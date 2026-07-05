import { execFileSync, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const ROOT = process.cwd();
const ASSETS_DIR = resolve(ROOT, 'assets');
const STORE_DIR = resolve(ROOT, 'store-assets');
const SOURCE_DIR = resolve(STORE_DIR, 'source');
const SERVER_PORTS = Array.from({ length: 10 }, (_, index) => 8765 + index);

const DEMO_DATA = {
  requestId: 'req_20260705_001',
  endpoint: '/api/orders/preview',
  nestedPayload: JSON.stringify({
    customer: {
      id: 'cus_10042',
      tier: 'enterprise',
      flags: ['beta', 'priority'],
    },
    cart: {
      currency: 'USD',
      items: [
        { sku: 'json-probe', qty: 2, price: 29 },
        { sku: 'worker-search', qty: 1, price: 49 },
      ],
    },
    shipping: {
      method: 'express',
      address: { city: 'San Francisco', country: 'US' },
    },
  }),
  auditTrail: JSON.stringify([
    { at: '2026-07-05T09:12:00Z', event: 'created', actor: 'api-gateway' },
    { at: '2026-07-05T09:12:02Z', event: 'enriched', actor: 'worker' },
    { at: '2026-07-05T09:12:03Z', event: 'ready', actor: 'queue' },
  ]),
  meta: {
    source: 'demo fixture',
    note: 'Nested JSON strings stay local and parse in the browser.',
  },
  records: Array.from({ length: 40 }, (_, index) => ({
    id: index + 1,
    status: index % 3 === 0 ? 'open' : 'closed',
    durationMs: 18 + index * 7,
    trace: {
      logId: `log_${String(index + 1).padStart(4, '0')}`,
      phase: index % 2 === 0 ? 'ingest' : 'render',
    },
  })),
};

const LISTING = `# Chrome Web Store Listing Draft

## Product Details

Name:
AZ JSON Explorer

Short description:
View large JSON and parse nested JSON strings into browsable trees with one click.

Category:
Developer Tools

Language:
English

## Detailed Description

AZ JSON Explorer is a fast JSON viewer for developers working with API responses, logs, fixtures, and local JSON files.

Many APIs return objects or arrays as escaped string fields. AZ JSON Explorer detects string values that look like JSON and shows a Parse as JSON action, so you can expand them into a normal tree without copying the value into another tool.

Key features:
- Parse nested JSON strings into browsable trees with one click.
- Browse raw JSON pages directly in Chrome.
- Open local JSON files in the standalone viewer.
- Parse JSON in a Web Worker so large files do not block the page UI.
- Use virtual scrolling to keep large JSON trees responsive.
- Search across the parsed JSON tree.
- Toggle parsed string values back to their original raw string form.

What this extension does not do:
- It is not a JSON editor.
- It does not upload, sync, or send JSON content to a server.

## Suggested Store Copy

Headline:
Parse nested JSON strings with one click

Feature callouts:
- Turn escaped JSON strings into normal tree nodes.
- Keep large JSON responsive with worker parsing and virtual scrolling.
- Search API responses, logs, fixtures, and local files without leaving Chrome.

## Privacy And Permissions Notes

AZ JSON Explorer processes JSON locally in the browser. The extension does not collect, sell, transmit, or store user data on external servers.

The extension runs on HTTP, HTTPS, and file URLs so it can detect raw JSON pages and replace them with the viewer. For local file previews, users must explicitly enable file URL access in Chrome extension details.

## Asset Checklist

- Store icon: ../assets/icon-128.png
- Small promo tile: ./promo-small-440x280.png
- Marquee promo tile: ./promo-marquee-1400x560.png
- Screenshots:
  - ./screenshot-1-detect-nested-json-string-1280x800.png
  - ./screenshot-2-one-click-parsed-tree-1280x800.png
  - ./screenshot-3-search-parsed-json-1280x800.png
  - ./screenshot-4-large-json-navigation-1280x800.png
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
        inset: 12.5vmin;
        border-radius: 21%;
        background: #2563eb;
        box-shadow: inset 0 -0.9vmin 0 rgba(15, 23, 42, 0.16);
      }
      .braces {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 2.5vmin;
        font: 900 39vmin/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
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
        background: linear-gradient(90deg, #ffffff 0 55%, #eef6ff 55% 100%);
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
        max-width: ${large ? 560 : 190}px;
        margin: 0;
        color: #0f172a;
        font-size: ${large ? 54 : 23}px;
        line-height: 1.03;
        letter-spacing: 0;
      }
      .sub {
        max-width: ${large ? 520 : 188}px;
        margin: ${large ? 22 : 12}px 0 0;
        color: #475467;
        font-size: ${large ? 20 : 12}px;
        line-height: 1.45;
      }
      .diagram {
        position: absolute;
        right: ${large ? 58 : 24}px;
        top: ${large ? 54 : 58}px;
        width: ${large ? 610 : 178}px;
        height: ${large ? 452 : 178}px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.14);
        overflow: hidden;
      }
      .toolbar {
        height: ${large ? 54 : 31}px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 ${large ? 18 : 10}px;
        border-bottom: 1px solid #d9dee8;
        color: #475467;
        font-size: ${large ? 15 : 8}px;
        font-weight: 700;
      }
      .search {
        width: ${large ? 154 : 48}px;
        height: ${large ? 28 : 15}px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        background: #f8fafc;
      }
      .rows {
        padding: ${large ? 18 : 8}px ${large ? 22 : 9}px;
        font: ${large ? 18 : 8}px/1.9 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      .row {
        display: flex;
        align-items: center;
        gap: ${large ? 12 : 5}px;
        min-height: ${large ? 32 : 16}px;
        white-space: nowrap;
      }
      .key { color: #7c3aed; font-weight: 700; }
      .string { color: #047857; }
      .number { color: #1d4ed8; }
      .muted { color: #98a2b3; }
      .parse {
        display: inline-flex;
        align-items: center;
        height: ${large ? 26 : 13}px;
        padding: 0 ${large ? 9 : 4}px;
        border: 1px solid #99f6e4;
        border-radius: 6px;
        color: #115e59;
        background: #ecfdf5;
        font: 700 ${large ? 13 : 6}px/1 ui-sans-serif, system-ui, sans-serif;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        height: ${large ? 26 : 13}px;
        padding: 0 ${large ? 9 : 4}px;
        border: 1px solid #fde68a;
        border-radius: 6px;
        color: #92400e;
        background: #fffbeb;
        font: 800 ${large ? 13 : 6}px/1 ui-sans-serif, system-ui, sans-serif;
      }
      .indent-1 { padding-left: ${large ? 34 : 14}px; }
      .indent-2 { padding-left: ${large ? 68 : 28}px; }
      .callout {
        position: absolute;
        right: ${large ? 404 : 130}px;
        bottom: ${large ? 48 : 23}px;
        width: ${large ? 250 : 118}px;
        padding: ${large ? 14 : 7}px;
        border: 1px solid #bbf7d0;
        border-radius: 8px;
        color: #14532d;
        background: #f0fdf4;
        font-size: ${large ? 15 : 7}px;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main class="stage">
      <div class="brand"><div class="mini-logo"><span><span class="left">{</span><span class="right">}</span></span></div><span>AZ JSON Explorer</span></div>
      <h1>Parse nested JSON strings with one click</h1>
      <p class="sub">${large ? 'A fast Chrome JSON viewer for API responses, logs, fixtures, and local files. Worker parsing and virtual scrolling keep large trees responsive.' : 'Turn escaped API payloads into readable tree nodes.'}</p>
      <section class="diagram" aria-label="AZ JSON Explorer preview">
        <div class="toolbar"><span>${large ? 'orders-api-response.json' : 'api-response.json'}</span><div class="search"></div></div>
        <div class="rows">
          <div class="row"><span class="key">"$"</span><span class="muted">{</span></div>
          <div class="row indent-1"><span class="key">"nestedPayload"</span><span class="muted">:</span><span class="parse">Parse as JSON</span></div>
          <div class="row indent-1"><span class="badge">parsed</span><span class="muted">{</span></div>
          <div class="row indent-2"><span class="key">"customer"</span><span class="muted">:</span><span class="muted">{...}</span></div>
          <div class="row indent-2"><span class="key">"items"</span><span class="muted">:</span><span class="number">[2]</span></div>${large ? '\n          <div class="row indent-2"><span class="key">"shipping"</span><span class="muted">:</span><span class="string">"express"</span></div><div class="row indent-1"><span class="key">"records"</span><span class="muted">:</span><span class="number">[40]</span></div>' : ''}
        </div>
      </section>${large ? '\n      <div class="callout">No copy-paste into another parser. Keep the payload in context.</div>' : ''}
    </main>
  </body>
</html>`;
}

const viewerDemoHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AZ JSON Explorer Store Demo</title>
    <link rel="icon" href="data:,">
    <style>
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        background: #f6f7f9;
      }
      #app { height: 100%; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module">
      import { mountJsonViewer } from '../../src/ui/viewerApp.js';

      const demoJson = ${JSON.stringify(JSON.stringify(DEMO_DATA, null, 2))};

      mountJsonViewer(document.getElementById('app'), {
        autoParse: true,
        initialText: demoJson,
        sourceLabel: 'orders-api-response.json',
        styleUrl: new URL('../../src/ui/styles.css', import.meta.url).href,
        workerUrl: new URL('../../src/worker/jsonWorker.js', import.meta.url).href,
      });
    </script>
  </body>
</html>`;

async function main() {
  await mkdir(ASSETS_DIR, { recursive: true });
  await mkdir(SOURCE_DIR, { recursive: true });

  const promoSmall = promoHtml({ width: 440, height: 280 });
  const promoMarquee = promoHtml({ width: 1400, height: 560 });

  await writeFile(resolve(STORE_DIR, 'listing.md'), LISTING);
  await writeFile(resolve(SOURCE_DIR, 'icon.html'), iconHtml);
  await writeFile(resolve(SOURCE_DIR, 'promo-small.html'), promoSmall);
  await writeFile(resolve(SOURCE_DIR, 'promo-marquee.html'), promoMarquee);
  await writeFile(resolve(SOURCE_DIR, 'viewer-demo.html'), viewerDemoHtml);

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
    await renderViewerScreenshot(server.baseUrl, 'detect', 'screenshot-1-detect-nested-json-string-1280x800.png');
    await renderViewerScreenshot(server.baseUrl, 'parse', 'screenshot-2-one-click-parsed-tree-1280x800.png');
    await renderViewerScreenshot(server.baseUrl, 'search', 'screenshot-3-search-parsed-json-1280x800.png');
    await renderViewerScreenshot(server.baseUrl, 'records', 'screenshot-4-large-json-navigation-1280x800.png');
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
      await waitForUrl(`${baseUrl}/store-assets/source/viewer-demo.html`, 2500);
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

async function renderViewerScreenshot(baseUrl, action, filename) {
  const output = resolve(STORE_DIR, filename);
  const code = `async page => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(${JSON.stringify(`${baseUrl}/store-assets/source/viewer-demo.html`)}, {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });
    await page.waitForSelector('text=Parse as JSON', { timeout: 10000 });

    if (${JSON.stringify(action)} === 'parse' || ${JSON.stringify(action)} === 'search') {
      await page.getByText('Parse as JSON').first().click();
      await page.getByText('parsed').first().waitFor({ timeout: 10000 });
    }

    if (${JSON.stringify(action)} === 'search') {
      await page.getByRole('searchbox').fill('express');
      await page.waitForTimeout(750);
    }

    if (${JSON.stringify(action)} === 'records') {
      await page.locator('.jt-row[title="$.records"] .jt-toggle').click();
      await page.waitForTimeout(250);
      await page.locator('.jt-row[title="$.records[0]"] .jt-toggle').click();
      await page.waitForTimeout(250);
    }

    await page.screenshot({
      path: ${JSON.stringify(output)},
      animations: 'disabled'
    });
  }`;
  execPlaywright(['run-code', code]);
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
