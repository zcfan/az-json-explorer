import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const PRODUCT_NAME = 'AZ JSON Explorer';

test('manifest is valid MV3 JSON and exposes viewer resources to content pages', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, PRODUCT_NAME);
  assert.equal(manifest.action.default_title, PRODUCT_NAME);
  assert.equal(manifest.content_scripts[0].js[0], 'src/contentScript.js');
  assert.ok(manifest.content_scripts[0].matches.includes('file:///*'));
  assert.ok(manifest.web_accessible_resources[0].resources.includes('src/viewer.html'));
  assert.ok(manifest.web_accessible_resources[0].resources.includes('src/worker/*.js'));
});

test('visible extension surfaces use the product name', async () => {
  const popup = await readFile(new URL('../src/popup.html', import.meta.url), 'utf8');
  const viewerHtml = await readFile(new URL('../src/viewer.html', import.meta.url), 'utf8');
  const viewerApp = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');

  assert.match(popup, new RegExp(`<title>${PRODUCT_NAME}</title>`));
  assert.match(popup, new RegExp(`Open ${PRODUCT_NAME}`));
  assert.match(viewerHtml, new RegExp(`<title>${PRODUCT_NAME}</title>`));
  assert.match(viewerApp, new RegExp(`<strong>${PRODUCT_NAME}</strong>`));
});

test('local file usage documents Chrome file URL access requirement', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const popup = await readFile(new URL('../src/popup.html', import.meta.url), 'utf8');

  assert.match(readme, /Allow access to file URLs/);
  assert.match(popup, /Allow access to file URLs/);
});

test('sample fixture is valid JSON and includes nested stringified JSON', async () => {
  const sample = JSON.parse(await readFile(new URL('../fixtures/sample.json', import.meta.url), 'utf8'));

  assert.equal(typeof sample.payload, 'string');
  assert.deepEqual(JSON.parse(sample.payload).items, [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(JSON.parse(sample.meta.stringifiedArray), [1, 2, 3]);
});

test('viewer layout constrains the virtual tree to a scroll viewport', async () => {
  const html = await readFile(new URL('../src/viewer.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(html, /#app\s*\{[^}]*(?:^|\n)\s*height:\s*100%;/s);
  assert.match(css, /\.jt-app\s*\{[^}]*(?:^|\n)\s*height:\s*100vh;/s);
  assert.match(css, /\.jt-app\s*\{[^}]*(?:^|\n)\s*overflow:\s*hidden;/s);
  assert.match(css, /\.jt-tree\s*\{[^}]*(?:^|\n)\s*min-height:\s*0;/s);
});

test('viewer supports one-way manual JSON input without echoing file content', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');

  assert.match(viewer, /<textarea class="jt-manual-input"/);
  assert.match(viewer, /data-action="parse-manual"/);
  assert.match(viewer, /parseManualInput\(\)/);
  assert.match(viewer, /this\.parseText\(text\)/);
  assert.match(viewer, /setSourceLabel\('Manual input'\)/);
  assert.doesNotMatch(viewer, /file\.text\(\)/);
  assert.doesNotMatch(viewer, /manualInput\.value\s*=/);
  assert.match(viewer, /parseFile\(file\)/);
  assert.match(viewer, /this\.requestWorker\('parse-root', \{ file/);
});

test('direct page previews pass file-like payloads instead of raw JSON text strings', async () => {
  const contentScript = await readFile(new URL('../src/contentScript.js', import.meta.url), 'utf8');
  const viewer = await readFile(new URL('../src/viewer.js', import.meta.url), 'utf8');

  assert.match(contentScript, /detectJsonPageSource/);
  assert.match(contentScript, /fetchPageBlob/);
  assert.match(contentScript, /type:\s*'load-json-file'/);
  assert.doesNotMatch(contentScript, /text:\s*rawText/);
  assert.match(viewer, /load-json-file/);
  assert.match(viewer, /parseFile\(event\.data\.file/);
});

test('direct page previews show a standalone viewer performance banner', async () => {
  const viewer = await readFile(new URL('../src/viewer.js', import.meta.url), 'utf8');
  const viewerApp = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(viewerApp, /jt-direct-file-banner/);
  assert.match(viewerApp, /For very large JSON files/);
  assert.match(viewerApp, /Standalone Viewer/);
  assert.match(viewerApp, /showDirectFileBanner\(\)/);
  assert.match(viewer, /showDirectFileBanner\(\)/);
  assert.match(viewer, /load-json-file[\s\S]*showDirectFileBanner\(\)[\s\S]*parseFile/);
  assert.match(viewer, /load-json'[\s\S]*showDirectFileBanner\(\)[\s\S]*parseText/);
  assert.match(css, /\.jt-direct-file-banner/);
});

test('browser entry modules pass syntax checks', () => {
  const files = [
    'src/contentScript.js',
    'src/viewer.js',
    'src/ui/viewerApp.js',
    'src/worker/jsonWorker.js',
  ];

  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});

test('viewer includes search result row and text highlight hooks', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(viewer, /getRowSearchState/);
  assert.match(viewer, /appendHighlightedText/);
  assert.match(css, /\.jt-row-search-hit/);
  assert.match(css, /\.jt-search-mark/);
});

test('search row highlights stay visually softer than matched text highlights', async () => {
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(css, /\.jt-row-search-hit\s*\{[^}]*background:\s*#fffdf3;/s);
  assert.match(css, /\.jt-row-search-current\s*\{[^}]*background:\s*#fff6dc;/s);
  assert.match(css, /\.jt-row-search-current\s*\{[^}]*outline:\s*1px solid #f3d48a;/s);
  assert.match(css, /\.jt-search-mark\s*\{[^}]*background:\s*#facc15;/s);
});

test('parse button is hidden after a string already has parsed cache', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');

  assert.match(viewer, /if \(row\.canParseAsJson && !row\.hasParsed\)/);
});

test('viewer key context menu copies the worker-provided row path', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(viewer, /Copy path/);
  assert.match(viewer, /contextmenu/);
  assert.match(viewer, /row\.copyPath/);
  assert.match(viewer, /navigator\.clipboard\.writeText/);
  assert.match(css, /\.jt-context-menu/);
});

test('viewer keeps the parsed root inside the worker and requests visible rows by summary', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');

  assert.doesNotMatch(viewer, /this\.rootValue\s*=\s*response\.value/);
  assert.match(viewer, /this\.hasParsedRoot\s*=\s*true/);
  assert.match(viewer, /'collect-visible-rows'/);
});

test('expand toggles use a DOM chevron rotated by CSS instead of text glyphs', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(viewer, /jt-toggle-chevron/);
  assert.match(viewer, /jt-toggle-expanded/);
  assert.doesNotMatch(viewer, /row\.expanded\s*\?\s*'v'\s*:\s*'>'/);
  assert.match(css, /\.jt-toggle-chevron/);
  assert.match(css, /\.jt-toggle\s*\{[^}]*position:\s*relative;/s);
  assert.match(css, /\.jt-toggle-chevron\s*\{[^}]*position:\s*absolute;[^}]*top:\s*50%;[^}]*left:\s*50%;/s);
  assert.match(css, /transform:\s*translate\([^)]*\)\s*rotate\(var\(--jt-toggle-chevron-rotation\)\)/s);
  assert.match(css, /--jt-toggle-chevron-offset-x:\s*-2(?:\.5)?px;/);
  assert.match(css, /--jt-toggle-chevron-offset-y:\s*-2(?:\.5)?px;/);
  assert.match(css, /\.jt-toggle-expanded\s+\.jt-toggle-chevron/);
});
