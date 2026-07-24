import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const ROOT = process.cwd();
const ASSETS_DIR = resolve(ROOT, 'assets');
const STORE_DIR = resolve(ROOT, 'store-assets');
const SOURCE_DIR = resolve(STORE_DIR, 'source');
const SERVER_PORTS = Array.from({ length: 10 }, (_, index) => 8765 + index);

const SCREENSHOTS = [
  {
    source: 'isolated-view-1.png',
    output: 'screenshot-1-isolated-view-context-menu-1280x800.png',
  },
  {
    source: 'isolated-view-2.png',
    output: 'screenshot-2-isolated-view-raw-1280x800.png',
  },
  {
    source: 'isolated-view-3.png',
    output: 'screenshot-3-isolated-view-parsed-1280x800.png',
  },
];

const LEGACY_SCREENSHOTS = [
  'screenshot-1-detect-nested-json-string-1280x800.png',
  'screenshot-2-one-click-parsed-tree-1280x800.png',
  'screenshot-3-search-parsed-json-1280x800.png',
  'screenshot-4-large-json-navigation-1280x800.png',
];

const LISTING = `# Chrome Web Store Listing Draft

## Product Details

Name:
AZ JSON Explorer

Short description:
Parse nested JSON strings, isolate any path in its own tab, and reopen recent inputs from local history.

Category:
Developer Tools

Language:
English

## Detailed Description

AZ JSON Explorer is a local-first JSON viewer for developers working with API responses, logs, fixtures, and local files.

It is built around three focused workflows:

Key features:
- Parse as JSON: turn escaped objects or arrays into browsable tree nodes, while preserving the original string so you can switch between raw and parsed views.
- Isolated views: open any object, array, or JSON string in its own tab. Each tab keeps its own raw/parsed mode and search state.
- History: reopen successfully parsed manual inputs and files from local history, together with restored tabs and per-tab view state.

AZ JSON Explorer can replace raw JSON pages directly in Chrome or open manual input and local files in its standalone viewer. Web Worker parsing and virtual scrolling keep large trees responsive.

History is stored locally in your browser until you clean it. JSON content is never uploaded or synced to an external server.

Like AZ JSON Explorer? Star the project on GitHub:
https://github.com/zcfan/az-json-explorer

What this extension does not do:
- It is not a JSON editor.
- It does not upload, sync, or send JSON content to a server.

## Suggested Store Copy

Headline:
Parse. Isolate. Revisit.

Feature callouts:
- Parse nested JSON strings without losing the original raw value.
- Focus on any JSON path in an independent, searchable tab.
- Reopen recent manual inputs and files from local browser history.

Like AZ JSON Explorer? Star the project on GitHub:
https://github.com/zcfan/az-json-explorer

## Privacy And Permissions Notes

AZ JSON Explorer processes JSON locally in the browser. The extension does not collect, sell, transmit, or store user data on external servers.

The extension runs on HTTP, HTTPS, and file URLs so it can detect raw JSON pages and replace them with the viewer. For local file previews, users must explicitly enable file URL access in Chrome extension details.

## Asset Checklist

- Store icon: ../assets/icon-128.png
- Small promo tile: ./promo-small-440x280.png
- Marquee promo tile: ./promo-marquee-1400x560.png
- Screenshots:
  - ./screenshot-1-isolated-view-context-menu-1280x800.png
  - ./screenshot-2-isolated-view-raw-1280x800.png
  - ./screenshot-3-isolated-view-parsed-1280x800.png
`;

const iconHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent;
      }
      .mark {
        position: absolute;
        inset: 1vmin;
        border-radius: 22%;
        background: #2563eb;
        box-shadow: inset 0 -0.9vmin 0 rgba(15, 23, 42, 0.16);
      }
      .braces {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3vmin;
        font: 900 52vmin/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: 0;
      }
      .brace-left { color: #ffffff; }
      .brace-right { color: #34d399; }
    </style>
  </head>
  <body>
    <div class="mark">
      <div class="braces"><span class="brace-left">{</span><span class="brace-right">}</span></div>
    </div>
  </body>
</html>`;

function promoHtml({ width, height }) {
  const large = width > 600;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      * { box-sizing: border-box; }
      html, body {
        width: ${width}px;
        height: ${height}px;
        margin: 0;
        overflow: hidden;
        color: #111827;
        background: #f6f7f9;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .stage {
        position: relative;
        width: 100%;
        height: 100%;
        padding: ${large ? 54 : 24}px;
        background:
          radial-gradient(circle at 8% 8%, #ffffff 0, rgba(255, 255, 255, 0) 40%),
          linear-gradient(135deg, #ffffff 0 46%, #eef6ff 72%, #e4efff 100%);
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 18px;
        color: #475467;
        font-weight: 700;
      }
      .mini-logo {
        display: grid;
        place-items: center;
        width: ${large ? 58 : 38}px;
        height: ${large ? 58 : 38}px;
        border-radius: 14px;
        color: #ffffff;
        background: #2563eb;
        font: 800 ${large ? 24 : 16}px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        box-shadow: inset 0 -4px 0 rgba(15, 23, 42, 0.16);
      }
      .mini-logo .left { color: #ffffff; }
      .mini-logo .right { color: #34d399; }
      h1 {
        max-width: ${large ? 580 : 190}px;
        margin: 0;
        color: #0f172a;
        font-size: ${large ? 60 : 29}px;
        line-height: 0.98;
        letter-spacing: -0.035em;
      }
      .sub {
        max-width: ${large ? 550 : 182}px;
        margin: ${large ? 24 : 12}px 0 0;
        color: #475467;
        font-size: ${large ? 20 : 10}px;
        line-height: 1.45;
      }
      .features {
        display: flex;
        flex-direction: ${large ? 'row' : 'column'};
        flex-wrap: wrap;
        gap: ${large ? 10 : 5}px;
        max-width: ${large ? 600 : 180}px;
        margin-top: ${large ? 28 : 14}px;
      }
      .feature {
        display: inline-flex;
        align-items: center;
        gap: ${large ? 8 : 5}px;
        width: max-content;
        padding: ${large ? '9px 13px' : '4px 7px'};
        border: 1px solid #cbd8ea;
        border-radius: 999px;
        color: #334155;
        background: rgba(255, 255, 255, 0.88);
        font-size: ${large ? 15 : 8}px;
        font-weight: 750;
        box-shadow: 0 4px 14px rgba(51, 65, 85, 0.06);
      }
      .feature::before {
        width: ${large ? 8 : 5}px;
        height: ${large ? 8 : 5}px;
        border-radius: 50%;
        background: #2563eb;
        content: "";
      }
      .diagram {
        position: absolute;
        right: ${large ? 42 : 16}px;
        top: ${large ? 48 : 48}px;
        width: ${large ? 660 : 214}px;
        height: ${large ? 464 : 216}px;
        border: 1px solid #cbd5e1;
        border-radius: ${large ? 14 : 8}px;
        background: #ffffff;
        box-shadow: 0 24px 54px rgba(28, 52, 84, 0.18);
        overflow: hidden;
      }
      .toolbar {
        height: ${large ? 48 : 27}px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 ${large ? 18 : 10}px;
        border-bottom: 1px solid #d9dee8;
        color: #475467;
        font-size: ${large ? 15 : 8}px;
        font-weight: 700;
      }
      .history-button {
        padding: ${large ? '6px 12px' : '3px 6px'};
        border: 1px solid #cbd5e1;
        border-radius: ${large ? 7 : 4}px;
        color: #334155;
        background: #ffffff;
        font-size: ${large ? 11 : 5}px;
      }
      .tabs {
        display: flex;
        align-items: end;
        height: ${large ? 56 : 30}px;
        padding: ${large ? '10px 12px 0' : '5px 5px 0'};
        border-bottom: 1px solid #cbd5e1;
        background: #eef2f7;
      }
      .tab {
        position: relative;
        display: flex;
        align-items: center;
        gap: ${large ? 7 : 3}px;
        height: ${large ? 46 : 25}px;
        padding: 0 ${large ? 13 : 5}px;
        border: 1px solid #cbd5e1;
        border-bottom: 0;
        border-radius: ${large ? '9px 9px 0 0' : '5px 5px 0 0'};
        color: #334155;
        background: #e2e8f0;
        font-size: ${large ? 12 : 5}px;
        font-weight: 700;
        white-space: nowrap;
      }
      .tab + .tab {
        margin-left: ${large ? 7 : 3}px;
      }
      .tab-root {
        color: #64748b;
        background: #e7edf5;
        border-bottom-color: #cbd5e1;
      }
      .tab-active {
        color: #0f172a;
        background: #ffffff;
      }
      .tab-active::after {
        position: absolute;
        right: 0;
        bottom: -2px;
        left: 0;
        height: 3px;
        background: #ffffff;
        content: "";
      }
      .rows {
        padding: ${large ? '12px 194px 12px 18px' : '6px 66px 6px 7px'};
        font: ${large ? 14 : 6}px/1.9 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      .row {
        display: flex;
        align-items: center;
        gap: ${large ? 8 : 3}px;
        min-height: ${large ? 35 : 17}px;
        white-space: nowrap;
      }
      .key { color: #7c3aed; font-weight: 700; }
      .string { color: #047857; }
      .number { color: #1d4ed8; }
      .muted { color: #98a2b3; }
      .parse {
        display: inline-flex;
        align-items: center;
        height: ${large ? 24 : 11}px;
        padding: 0 ${large ? 8 : 3}px;
        border: 1px solid #99f6e4;
        border-radius: 6px;
        color: #115e59;
        background: #ecfdf5;
        font: 700 ${large ? 11 : 4}px/1 ui-sans-serif, system-ui, sans-serif;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        height: ${large ? 24 : 11}px;
        padding: 0 ${large ? 8 : 3}px;
        border: 1px solid #fde68a;
        border-radius: 6px;
        color: #92400e;
        background: #fffbeb;
        font: 800 ${large ? 11 : 4}px/1 ui-sans-serif, system-ui, sans-serif;
      }
      .indent-1 { padding-left: ${large ? 28 : 11}px; }
      .indent-2 { padding-left: ${large ? 52 : 20}px; }
      .history {
        position: absolute;
        top: ${large ? 104 : 57}px;
        right: 0;
        bottom: 0;
        width: ${large ? 180 : 60}px;
        border-left: 1px solid #cbd5e1;
        background: #ffffff;
      }
      .history-title {
        padding: ${large ? '12px 13px' : '5px'};
        border-bottom: 1px solid #d9dee8;
        color: #1e293b;
        font-size: ${large ? 12 : 5}px;
        font-weight: 800;
      }
      .history-item {
        padding: ${large ? '12px 13px' : '5px'};
        border-bottom: 1px solid #e7ebf1;
      }
      .history-item.active {
        border-left: ${large ? 3 : 2}px solid #2563eb;
        background: #eef5ff;
      }
      .history-name {
        color: #273449;
        font-size: ${large ? 10 : 4}px;
        font-weight: 800;
      }
      .history-preview {
        margin-top: ${large ? 5 : 2}px;
        overflow: hidden;
        color: #64748b;
        font: ${large ? 8 : 3}px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    <main class="stage">
      <div class="brand"><div class="mini-logo"><span><span class="left">{</span><span class="right">}</span></span></div><span>AZ JSON Explorer</span></div>
      <h1>Parse.<br>Isolate.<br>Revisit.</h1>
      <p class="sub">${large ? 'Parse nested JSON strings, focus on any path in its own tab, and reopen recent inputs from local history.' : 'Three focused ways to explore JSON.'}</p>
      <div class="features">
        <span class="feature">Parse as JSON</span>
        <span class="feature">Isolated views</span>
        <span class="feature">History</span>
      </div>
      <section class="diagram" aria-label="AZ JSON Explorer preview">
        <div class="toolbar"><span>AZ JSON Explorer</span><span class="history-button">History</span></div>
        <div class="tabs">
          <span class="tab tab-root">$</span>
          <span class="tab tab-active">$.payload <span class="badge">parsed</span></span>
          <span class="tab">$.shipping <span class="badge">parsed</span></span>
        </div>
        <div class="rows">
          <div class="row"><span class="key">"$"</span><span class="badge">parsed</span><span class="muted">{ 5 keys }</span></div>
          <div class="row indent-1"><span class="key">"orderId"</span><span class="muted">:</span><span class="string">"ORD-2026-001"</span></div>
          <div class="row indent-1"><span class="key">"payload"</span><span class="muted">:</span><span class="parse">Parse as JSON</span></div>
          <div class="row indent-1"><span class="key">"customer"</span><span class="muted">:</span><span class="muted">{ 2 keys }</span></div>
          <div class="row indent-1"><span class="key">"items"</span><span class="muted">:</span><span class="muted">[ 2 items ]</span></div>
          <div class="row indent-1"><span class="key">"shipping"</span><span class="muted">:</span><span class="badge">parsed</span></div>
        </div>
        <aside class="history">
          <div class="history-title">History</div>
          <div class="history-item active"><div class="history-name">Manual input</div><div class="history-preview">{"orderId":"ORD-2026..."}</div></div>
          <div class="history-item"><div class="history-name">events.json</div><div class="history-preview">[{"event":"created"...}]</div></div>
          <div class="history-item"><div class="history-name">Manual input</div><div class="history-preview">{"payload":"{\\"id\\"..."}</div></div>
        </aside>
      </section>
    </main>
  </body>
</html>`;
}

async function main() {
  await mkdir(ASSETS_DIR, { recursive: true });
  await mkdir(SOURCE_DIR, { recursive: true });

  const promoSmall = promoHtml({ width: 440, height: 280 });
  const promoMarquee = promoHtml({ width: 1400, height: 560 });

  await writeFile(resolve(STORE_DIR, 'listing.md'), LISTING);
  await writeFile(resolve(SOURCE_DIR, 'icon.html'), `${iconHtml}\n`);
  await writeFile(resolve(SOURCE_DIR, 'promo-small.html'), `${promoSmall}\n`);
  await writeFile(resolve(SOURCE_DIR, 'promo-marquee.html'), `${promoMarquee}\n`);
  await rm(resolve(SOURCE_DIR, 'viewer-demo.html'), { force: true });
  await Promise.all(
    LEGACY_SCREENSHOTS.map((filename) => rm(resolve(STORE_DIR, filename), { force: true })),
  );

  const server = await startStaticServer();
  try {
    execPlaywright(['open', 'about:blank']);
    await renderHtml(iconHtml, resolve(ASSETS_DIR, 'icon-16.png'), 16, 16, { omitBackground: true });
    await renderHtml(iconHtml, resolve(ASSETS_DIR, 'icon-32.png'), 32, 32, { omitBackground: true });
    await renderHtml(iconHtml, resolve(ASSETS_DIR, 'icon-48.png'), 48, 48, { omitBackground: true });
    await renderHtml(iconHtml, resolve(ASSETS_DIR, 'icon-128.png'), 128, 128, { omitBackground: true });
    await renderHtml(iconHtml, resolve(STORE_DIR, 'icon-128.png'), 128, 128, { omitBackground: true });
    await renderHtml(promoSmall, resolve(STORE_DIR, 'promo-small-440x280.png'), 440, 280);
    await renderHtml(promoMarquee, resolve(STORE_DIR, 'promo-marquee-1400x560.png'), 1400, 560);
    for (const screenshot of SCREENSHOTS) {
      await renderSourceScreenshot(server.baseUrl, screenshot.source, screenshot.output);
    }
    await Promise.all(
      SCREENSHOTS.map(({ output }) =>
        validatePngDimensions(resolve(STORE_DIR, output), 1280, 800),
      ),
    );
  } finally {
    server.process.kill();
    try {
      execPlaywright(['close']);
    } catch {
      // The browser may already be closed; generated assets are still valid.
    }
  }

  console.log(`Generated Chrome Web Store assets in ${relative(ROOT, STORE_DIR)}`);
}

async function startStaticServer() {
  for (const port of SERVER_PORTS) {
    const child = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
      cwd: ROOT,
      stdio: 'ignore',
    });

    try {
      const baseUrl = `http://127.0.0.1:${port}`;
      await waitForUrl(`${baseUrl}/store-assets/source/${SCREENSHOTS[0].source}`, 2500);
      return { baseUrl, process: child };
    } catch {
      child.kill();
    }
  }

  throw new Error(`Could not start a local static server on ports ${SERVER_PORTS.join(', ')}`);
}

async function waitForUrl(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the server is ready or the timeout expires.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function renderHtml(html, output, width, height, options = {}) {
  const code = `async page => {
    await page.setViewportSize({ width: ${width}, height: ${height} });
    await page.setContent(${JSON.stringify(html)}, { waitUntil: 'load' });
    await page.screenshot({
      path: ${JSON.stringify(output)},
      omitBackground: ${Boolean(options.omitBackground)},
      animations: 'disabled'
    });
  }`;
  execPlaywright(['run-code', code]);
}

async function renderSourceScreenshot(baseUrl, sourceFilename, outputFilename) {
  const output = resolve(STORE_DIR, outputFilename);
  const sourceUrl = `${baseUrl}/store-assets/source/${sourceFilename}`;
  const code = `async page => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(${JSON.stringify(sourceUrl)}, {
      waitUntil: 'load',
      timeout: 10000
    });
    await page.addStyleTag({
      content: '*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#fff}img{display:block;width:100%;height:100%;margin:0;object-fit:cover;object-position:center}'
    });

    await page.screenshot({
      path: ${JSON.stringify(output)},
      animations: 'disabled'
    });
  }`;
  execPlaywright(['run-code', code]);
}

async function validatePngDimensions(path, expectedWidth, expectedHeight) {
  const bytes = await readFile(path);
  const signature = bytes.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error(`${relative(ROOT, path)} is not a PNG file.`);
  }

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(
      `${relative(ROOT, path)} is ${width}x${height}; expected ${expectedWidth}x${expectedHeight}.`,
    );
  }
}

function execPlaywright(args) {
  execFileSync('playwright-cli', args, {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
