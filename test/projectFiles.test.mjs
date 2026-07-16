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

test('manifest exposes external launch messaging without adding permissions', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  const background = await readFile(new URL('../src/background.js', import.meta.url), 'utf8');

  assert.deepEqual(manifest.background, {
    service_worker: 'src/background.js',
    type: 'module',
  });
  assert.deepEqual(manifest.externally_connectable, { ids: ['*'] });
  assert.equal(manifest.permissions, undefined);
  assert.match(background, /createLaunchBroker/);
  assert.match(background, /chrome\.runtime\.onMessageExternal\.addListener/);
  assert.match(background, /chrome\.tabs\.create/);
  assert.match(background, /getURL\('src\/viewer\.html'\)/);
  assert.match(background, /\?launch=/);
});

test('content script installs the webpage launch bridge before page detection can exit', async () => {
  const contentScript = await readFile(new URL('../src/contentScript.js', import.meta.url), 'utf8');

  assert.match(contentScript, /pageLaunchBridge\.js/);
  assert.match(contentScript, /installPageLaunchBridge/);
  assert.match(contentScript, /sendRequest:\s*\(request\)\s*=>\s*chrome\.runtime\.sendMessage\(request\)/);
  assert.ok(
    contentScript.indexOf('installPageLaunchBridge({') <
      contentScript.indexOf('const pageSource = detectJsonPageSource'),
    'the bridge must be installed on non-JSON pages too',
  );
});

test('standalone viewer claims external launch payloads without putting JSON in the URL', async () => {
  const viewer = await readFile(new URL('../src/viewer.js', import.meta.url), 'utf8');

  assert.match(viewer, /params\.get\('launch'\)/);
  assert.match(viewer, /INTERNAL_LAUNCH_CLAIM_TYPE/);
  assert.match(viewer, /chrome\.runtime\.sendMessage/);
  assert.match(viewer, /history\.replaceState/);
  assert.match(viewer, /app\.parseText\(response\.payload\.jsonText\)/);
  assert.match(viewer, /response\.payload\.sourceLabel/);
  assert.match(viewer, /else if \(launchId\)/);
  assert.doesNotMatch(viewer, /[?&]json(?:Text)?=/);
});

test('public docs expose copyable webpage and extension integration paths', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const integration = await readFile(
    new URL('../docs/integrations/open-in-az-json-explorer.md', import.meta.url),
    'utf8',
  );
  const helper = await readFile(
    new URL('../integrations/az-json-explorer-client.js', import.meta.url),
    'utf8',
  );

  assert.match(readme, /Open in AZ JSON Explorer/);
  assert.match(integration, /createAzJsonExplorerClient/);
  assert.match(integration, /isAvailable\(\)/);
  assert.match(integration, /openText/);
  assert.match(integration, /runtime\.sendMessage/);
  assert.match(integration, /USER_GESTURE_REQUIRED/);
  assert.match(helper, /logkfmmknmmkpflgamhddeaedneaankj/);
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
  assert.match(viewer, /data-action="format-manual"/);
  assert.match(viewer, /parseManualInput\(\)/);
  assert.match(viewer, /formatManualInput\(\)/);
  assert.match(viewer, /formatJsonText/);
  assert.match(viewer, /manualInput\.value\s*=\s*formatJsonText\(text\)/);
  assert.match(viewer, /this\.parseText\(text\)/);
  assert.match(viewer, /setSourceLabel\('Manual input'\)/);
  assert.doesNotMatch(viewer, /file\.text\(\)/);
  assert.doesNotMatch(viewer, /manualInput\.value\s*=\s*await\s+file\.text/);
  assert.match(viewer, /parseFile\(file\)/);
  assert.match(viewer, /this\.requestWorker\('parse-root', \{\s*file,/);
});

test('viewer redirects page paste and exposes the platform parse shortcut', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');

  assert.match(viewer, /getParseShortcutLabel/);
  assert.match(viewer, /getPasteShortcutLabel/);
  assert.match(viewer, /Paste JSON, or press \$\{pasteShortcut\} anywhere/);
  assert.match(viewer, /shouldRedirectPaste/);
  assert.match(viewer, /clipboardData\?\.getData\('text\/plain'\)/);
  assert.match(viewer, /manualInput\.setRangeText/);
  assert.match(viewer, /manualInput\.addEventListener\('keydown'/);
  assert.match(viewer, /this\.parseManualInput\(\)/);
});

test('viewer places expansion and search controls below the loader and intercepts find', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(
    viewer,
    /<\/section>\s*<section class="jt-view-controls">[\s\S]*class="jt-expansion-controls"[\s\S]*>Collapse<[\s\S]*>Expand root<[\s\S]*>Expand all<[\s\S]*class="jt-search-controls"[\s\S]*class="jt-search-input"[\s\S]*<\/section>\s*<div class="jt-status"/,
  );
  assert.match(viewer, /isSearchShortcut/);
  assert.match(viewer, /ownerDocument\.addEventListener\('keydown'/);
  assert.match(viewer, /searchInput\.focus\(\)/);
  assert.match(css, /\.jt-view-controls\s*\{[^}]*justify-content:\s*space-between;/s);
  assert.match(css, /\.jt-search-controls\s*\{[^}]*margin-left:\s*auto;/s);
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

test('standalone viewer shows an open-file performance banner', async () => {
  const viewer = await readFile(new URL('../src/viewer.js', import.meta.url), 'utf8');
  const viewerApp = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(viewerApp, /For very large JSON files, use Open file instead of pasting JSON/);
  assert.match(viewerApp, /showStandalonePerformanceBanner\(\)/);
  assert.match(viewer, /if \(embedded\)[\s\S]*else \{[\s\S]*showStandalonePerformanceBanner\(\)/);
  assert.match(viewerApp, /data-action="dismiss-performance-hint"/);
  assert.match(viewerApp, /aria-label="Dismiss performance hint"/);
  assert.match(viewerApp, /isStandalonePerformanceHintDismissed\(\)/);
  assert.match(viewerApp, /dismissStandalonePerformanceHint\(\)/);
  assert.match(viewerApp, /dismissStandalonePerformanceBanner\(\)/);
  assert.match(css, /\.jt-performance-banner-close/);
});

test('browser entry modules pass syntax checks', () => {
  const files = [
    'integrations/az-json-explorer-client.js',
    'src/background.js',
    'src/contentScript.js',
    'src/core/clipboard.js',
    'src/core/externalLaunch.js',
    'src/core/pageLaunchBridge.js',
    'src/viewer.js',
    'src/ui/expansionState.js',
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

test('viewer row context menu avoids duplicate string actions and works outside the key', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(viewer, /Copy value/);
  assert.match(viewer, /Copy path/);
  assert.doesNotMatch(viewer, /Copy string contents/);
  assert.match(viewer, /Copy string as JavaScript literal/);
  assert.match(viewer, /Copy string as JSON literal/);
  assert.match(viewer, /Expand recursively/);
  assert.match(viewer, /element\.addEventListener\('contextmenu'/);
  assert.match(viewer, /openRowContextMenu/);
  assert.doesNotMatch(viewer, /key\.addEventListener\('contextmenu'/);
  assert.match(viewer, /row\.copyPath/);
  assert.match(viewer, /'copy-node'/);
  assert.match(viewer, /expandRecursively/);
  assert.match(viewer, /recursiveExpandedKeys:\s*Array\.from/);
  assert.match(viewer, /navigator\.clipboard\.writeText/);
  assert.match(css, /\.jt-context-menu/);
  assert.match(css, /\.jt-context-menu-separator/);
  assert.match(css, /\.jt-context-menu-item\[hidden\][^}]*display:\s*none;/s);
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

test('only blank areas and the toggle expand a row without blocking text selection', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(viewer, /row\.expandable \? 'jt-row-expandable' : ''/);
  assert.match(viewer, /element\.addEventListener\('click', \(event\) =>/);
  assert.match(viewer, /event\.target === element/);
  assert.match(viewer, /event\.target\.classList\.contains\('jt-indent'\)/);
  assert.match(viewer, /window\.getSelection\(\)\?\.isCollapsed === false/);
  assert.match(viewer, /this\.toggleExpanded\(row\)/);
  assert.match(css, /\.jt-row-expandable\s*\{[^}]*cursor:\s*pointer;/s);
  assert.match(css, /\.jt-row-expandable \.jt-value[^}]*cursor:\s*text;/s);
});

test('viewer wires Expand all through compact expansion state', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');

  assert.match(viewer, /data-action="expand-all"/);
  assert.match(viewer, /createAllExpansionState/);
  assert.match(viewer, /expansionMode:\s*this\.expansion\.mode/);
  assert.match(viewer, /collapsedKeys:\s*Array\.from\(this\.expansion\.collapsedKeys\)/);
  assert.match(viewer, /pendingStatus:\s*'Expanding all\.\.\.'/);
  assert.match(viewer, /this\.expansion\s*=\s*ensureExpanded\(this\.expansion, row\.pathKey\)/);
  assert.match(
    viewer,
    /this\.expansion\s*=\s*revealExpansionPaths\(this\.expansion, ancestorPathKeys\)/,
  );
  assert.doesNotMatch(viewer, /this\.expandedKeys/);
});

test('viewer automatically expands roots within a bounded expanded-row budget', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');

  assert.match(viewer, /const AUTO_EXPAND_MAX_ROWS = 5000;/);
  assert.match(viewer, /nodeCountLimit:\s*AUTO_EXPAND_MAX_ROWS/);
  assert.match(viewer, /createInitialExpansionState\(response\.nodeCount, pathKey\(\[\]\)\)/);
});
