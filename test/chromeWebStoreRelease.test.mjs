import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  getAccessToken,
  publishPackage,
  validateApiConfig,
  validateReleaseMetadata,
} from '../scripts/release-chrome-web-store.mjs';

test('release metadata requires matching manifest and package versions', () => {
  assert.equal(validateReleaseMetadata({ version: '1.2.3' }, { version: '1.2.3' }), '1.2.3');
  assert.throws(
    () => validateReleaseMetadata({ version: '1.2.3' }, { version: '1.2.4' }),
    /manifest\.json version 1\.2\.3 does not match package\.json version 1\.2\.4/,
  );
});

test('API configuration reports all missing identifiers together', () => {
  assert.throws(
    () => validateApiConfig({}),
    /CWS_PUBLISHER_ID, CWS_EXTENSION_ID/,
  );

  assert.deepEqual(
    validateApiConfig({ CWS_PUBLISHER_ID: ' publisher ', CWS_EXTENSION_ID: ' extension ' }),
    { publisherId: 'publisher', extensionId: 'extension' },
  );
});

test('access token can be supplied directly without reading credentials', async () => {
  const token = await getAccessToken({ CWS_ACCESS_TOKEN: ' short-lived-token ' });
  assert.equal(token, 'short-lived-token');
});

test('service account credentials are exchanged for a Chrome Web Store token', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cws-release-'));
  const credentialsPath = join(directory, 'service-account.json');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  await writeFile(
    credentialsPath,
    JSON.stringify({
      client_email: 'publisher@example.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      token_uri: 'https://oauth2.googleapis.com/token',
    }),
  );

  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ access_token: 'service-account-token' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const token = await getAccessToken(
    { GOOGLE_APPLICATION_CREDENTIALS: credentialsPath },
    { fetchImpl },
  );

  assert.equal(token, 'service-account-token');
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  const assertion = calls[0].options.body.get('assertion');
  const [, encodedClaims, signature] = assertion.split('.');
  const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString());
  assert.equal(claims.iss, 'publisher@example.iam.gserviceaccount.com');
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/chromewebstore');
  assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.ok(signature);
  assert.match(calls[0].options.body.toString(), /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
});

test('package upload waits for processing and submits an automatic publish', async () => {
  const calls = [];
  const responses = [
    { uploadState: 'IN_PROGRESS' },
    { lastAsyncUploadState: 'SUCCEEDED' },
    { itemId: 'extension', state: 'PENDING_REVIEW' },
  ];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await publishPackage({
    publisherId: 'publisher',
    extensionId: 'extension',
    token: 'token',
    packageBytes: Buffer.from('zip'),
    fetchImpl,
    sleep: async () => {},
  });

  assert.equal(result.state, 'PENDING_REVIEW');
  assert.equal(
    calls[0].url,
    'https://chromewebstore.googleapis.com/upload/v2/publishers/publisher/items/extension:upload',
  );
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(
    calls[1].url,
    'https://chromewebstore.googleapis.com/v2/publishers/publisher/items/extension:fetchStatus',
  );
  assert.equal(calls[2].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[2].options.body), { publishType: 'DEFAULT_PUBLISH' });
});

test('API failures include the server message and stop before publish', async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({ error: { message: 'Version must be greater than the published version.' } }),
    { status: 400, headers: { 'Content-Type': 'application/json' } },
  );

  await assert.rejects(
    publishPackage({
      publisherId: 'publisher',
      extensionId: 'extension',
      token: 'token',
      packageBytes: Buffer.from('zip'),
      fetchImpl,
    }),
    /400.*Version must be greater than the published version/,
  );
});
