import { spawnSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_ROOT = 'https://chromewebstore.googleapis.com';
const WEB_STORE_SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 60;

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function defaultSignJwt(credentials, now = Date.now()) {
  const issuedAt = Math.floor(now / 1_000);
  const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = encodeBase64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: WEB_STORE_SCOPE,
    aud: credentials.token_uri,
    iat: issuedAt,
    exp: issuedAt + 3_600,
  }));
  const unsignedToken = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  return `${unsignedToken}.${signer.sign(credentials.private_key, 'base64url')}`;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readResponse(response) {
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { rawResponse: text };
    }
  }

  if (!response.ok) {
    const message = payload?.error?.message ?? payload?.message ?? text ?? response.statusText;
    throw new Error(`Chrome Web Store API ${response.status}: ${message}`);
  }
  return payload;
}

async function requestJson(fetchImpl, url, options) {
  return readResponse(await fetchImpl(url, options));
}

export function validateReleaseMetadata(manifest, packageJson) {
  if (!manifest.version || !packageJson.version) {
    throw new Error('manifest.json and package.json must both define a version.');
  }
  if (manifest.version !== packageJson.version) {
    throw new Error(
      `manifest.json version ${manifest.version} does not match package.json version ${packageJson.version}.`,
    );
  }
  return manifest.version;
}

export function validateApiConfig(env) {
  const publisherId = env.CWS_PUBLISHER_ID?.trim();
  const extensionId = env.CWS_EXTENSION_ID?.trim();
  const missing = [];
  if (!publisherId) missing.push('CWS_PUBLISHER_ID');
  if (!extensionId) missing.push('CWS_EXTENSION_ID');
  if (missing.length > 0) {
    throw new Error(`Missing Chrome Web Store configuration: ${missing.join(', ')}.`);
  }
  return { publisherId, extensionId };
}

export async function getAccessToken(
  env,
  { fetchImpl = fetch, signJwt = defaultSignJwt } = {},
) {
  const directToken = env.CWS_ACCESS_TOKEN?.trim();
  if (directToken) return directToken;

  const credentialsPath = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!credentialsPath) {
    throw new Error(
      'Set CWS_ACCESS_TOKEN or GOOGLE_APPLICATION_CREDENTIALS before publishing.',
    );
  }

  const credentials = await readJson(resolve(credentialsPath));
  const missing = ['client_email', 'private_key', 'token_uri'].filter((key) => !credentials[key]);
  if (missing.length > 0) {
    throw new Error(`Service account credentials are missing: ${missing.join(', ')}.`);
  }

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: signJwt(credentials),
  });
  const tokenResponse = await requestJson(fetchImpl, credentials.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tokenResponse.access_token) {
    throw new Error('Google OAuth token response did not contain access_token.');
  }
  return tokenResponse.access_token;
}

export async function uploadPackage({
  publisherId,
  extensionId,
  token,
  packageBytes,
  fetchImpl = fetch,
  sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  const itemName = `publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}`;
  const authorization = { Authorization: `Bearer ${token}` };
  const upload = await requestJson(fetchImpl, `${API_ROOT}/upload/v2/${itemName}:upload`, {
    method: 'POST',
    headers: {
      ...authorization,
      'Content-Type': 'application/zip',
    },
    body: packageBytes,
  });

  let uploadState = upload.uploadState;
  for (let attempt = 0; uploadState === 'IN_PROGRESS' && attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const status = await requestJson(fetchImpl, `${API_ROOT}/v2/${itemName}:fetchStatus`, {
      method: 'GET',
      headers: authorization,
    });
    uploadState = status.lastAsyncUploadState;
  }

  if (uploadState !== 'SUCCEEDED') {
    throw new Error(`Chrome Web Store package upload did not succeed (state: ${uploadState ?? 'unknown'}).`);
  }

  return {
    ...upload,
    uploadState,
  };
}

export async function publishPackage({
  publisherId,
  extensionId,
  token,
  packageBytes,
  fetchImpl = fetch,
  sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  await uploadPackage({
    publisherId,
    extensionId,
    token,
    packageBytes,
    fetchImpl,
    sleep,
  });

  const itemName = `publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}`;
  return requestJson(fetchImpl, `${API_ROOT}/v2/${itemName}:publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stderr || result.stdout}` : '';
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}.${detail}`);
  }
  return options.capture ? result.stdout : '';
}

function assertCleanWorktree() {
  const status = run('git', ['status', '--porcelain', '--untracked-files=all'], { capture: true });
  if (status.trim()) {
    throw new Error('Refusing to release a dirty worktree. Commit or stash all changes first.');
  }
}

async function buildPackage(version) {
  const artifactPath = join(ROOT, 'dist', `az-json-explorer-${version}.zip`);
  await mkdir(dirname(artifactPath), { recursive: true });
  await rm(artifactPath, { force: true });
  const artifactRelativePath = relative(ROOT, artifactPath);
  run('zip', ['-r', '-X', artifactRelativePath, 'manifest.json', 'assets', 'src']);
  run('unzip', ['-t', artifactRelativePath]);
  return artifactPath;
}

export function parseOptions(argv) {
  const knownOptions = new Set(['--dry-run', '--upload-only']);
  const unknown = argv.filter((argument) => !knownOptions.has(argument));
  if (unknown.length > 0) {
    throw new Error(`Unknown option: ${unknown.join(', ')}.`);
  }

  const dryRun = argv.includes('--dry-run');
  const uploadOnly = argv.includes('--upload-only');
  if (dryRun && uploadOnly) {
    throw new Error('--dry-run and --upload-only cannot be combined.');
  }
  return { dryRun, uploadOnly };
}

export async function main({ argv = process.argv.slice(2), env = process.env } = {}) {
  const { dryRun, uploadOnly } = parseOptions(argv);
  const [manifest, packageJson] = await Promise.all([
    readJson(join(ROOT, 'manifest.json')),
    readJson(join(ROOT, 'package.json')),
  ]);
  const version = validateReleaseMetadata(manifest, packageJson);

  if (!dryRun) assertCleanWorktree();

  console.log(`Testing Chrome Web Store release ${version}...`);
  run('npm', ['test']);
  console.log(`Packaging Chrome Web Store release ${version}...`);
  const artifactPath = await buildPackage(version);

  if (dryRun) {
    console.log(`Dry run complete. Package verified at ${artifactPath}`);
    return { version, artifactPath, dryRun: true };
  }

  const { publisherId, extensionId } = validateApiConfig(env);
  const token = await getAccessToken(env);
  const packageBytes = await readFile(artifactPath);
  console.log(`Uploading ${artifactPath} to Chrome Web Store...`);
  if (uploadOnly) {
    const upload = await uploadPackage({
      publisherId,
      extensionId,
      token,
      packageBytes,
    });
    console.log(`Uploaded ${extensionId} as a draft without submitting it for review.`);
    if (upload.warningInfo?.warnings?.length) {
      console.warn(JSON.stringify(upload.warningInfo.warnings, null, 2));
    }
    return { version, artifactPath, upload, uploadOnly: true };
  }

  const publication = await publishPackage({
    publisherId,
    extensionId,
    token,
    packageBytes,
  });
  console.log(`Submitted ${extensionId} for automatic publication: ${publication.state ?? 'submitted'}`);
  if (publication.warningInfo?.warnings?.length) {
    console.warn(JSON.stringify(publication.warningInfo.warnings, null, 2));
  }
  return { version, artifactPath, publication };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
