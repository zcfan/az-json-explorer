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
  const integrationZh = await readFile(
    new URL('../docs/integrations/open-in-az-json-explorer.zh-CN.md', import.meta.url),
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
  assert.match(integration, /openInstallPage/);
  assert.match(integration, /runtime\.sendMessage/);
  assert.match(integration, /USER_GESTURE_REQUIRED/);
  assert.match(integrationZh, /未安装时引导到商店/);
  assert.match(integrationZh, /openInstallPage/);
  assert.match(integrationZh, /安装完成后.*刷新原页面/);
  assert.match(helper, /logkfmmknmmkpflgamhddeaedneaankj/);
  assert.match(helper, /AZ_JSON_EXPLORER_STORE_URL/);
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

test('viewer preserves consecutive whitespace in string values', async () => {
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(css, /\.jt-effective-string\s*\{[^}]*white-space:\s*pre;/s);
  assert.match(css, /\.jt-search-preview\s*\{[^}]*white-space:\s*break-spaces;/s);
});

test('viewer exposes isolated tree and paged string tabs instead of a modal', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(viewer, /class="jt-tabs"[^>]*role="tablist"[^>]*hidden/);
  assert.match(viewer, /class="jt-string-view-text"[^>]*aria-label="Full string value with line numbers"/);
  assert.match(viewer, /data-action="string-view-copy-all"/);
  assert.match(viewer, /this\.viewTabs\.tabs\.length < 2/);
  assert.match(viewer, /rootPath:\s*this\.getActiveTab\(\)\.path/);
  assert.match(viewer, /this\.treeViewStates\.set\(tab\.id,\s*\{[\s\S]*expansion:\s*this\.expansion/);
  assert.match(
    viewer,
    /this\.requestWorker\('search-tree',\s*\{[\s\S]*rootPath:\s*tab\.path/,
  );
  assert.match(viewer, /openRowInIsolatedView\(row\)/);
  assert.match(viewer, /getIsolationViewType\(row,\s*this\.getActiveTab\(\)\.path\)/);
  assert.doesNotMatch(viewer, /<dialog/);
  assert.doesNotMatch(viewer, /showModal\(\)/);
  assert.doesNotMatch(viewer, /beginStringDialogResize/);
  assert.match(viewer, /if \(row\.valueTruncated\)/);
  assert.match(viewer, /textContent = 'View all'/);
  assert.match(viewer, /this\.requestWorker\('read-string-range'/);
  assert.match(viewer, /handleStringViewScroll\(\)/);
  assert.match(viewer, /renderStringViewLines\(\s*response\.text,/);
  assert.match(viewer, /className = 'jt-string-view-line-number'/);
  assert.match(viewer, /className = 'jt-string-view-line-text'/);
  assert.match(css, /\.jt-tab-title\s*\{[^}]*direction:\s*rtl;/s);
  assert.match(css, /\.jt-tab-title\s*\{[^}]*text-overflow:\s*ellipsis;/s);
  assert.doesNotMatch(css, /\.jt-tab-title\s*\{[^}]*unicode-bidi:\s*plaintext;/s);
  assert.match(viewer, /titleText\.className = 'jt-tab-title-text'/);
  assert.match(viewer, /titleText\.textContent = tab\.title/);
  assert.match(
    css,
    /\.jt-tab-title-text\s*\{[^}]*direction:\s*ltr;[^}]*unicode-bidi:\s*isolate;/s,
  );
  assert.match(
    css,
    /\.jt-tab:not\(\.jt-tab-active\):hover,[\s\S]*\.jt-tab:not\(\.jt-tab-active\):focus-within\s*\{[^}]*background:/s,
  );
  assert.doesNotMatch(css, /\.jt-tab:hover/);
  assert.doesNotMatch(css, /\.jt-tab-select:hover/);
  assert.match(viewer, /const isActive = tab\.id === this\.viewTabs\.activeTabId/);
  assert.match(viewer, /select\.disabled = isActive/);
  assert.match(css, /\.jt-tab-select:disabled\s*\{[^}]*cursor:\s*default;/s);
  assert.match(css, /\.jt-tab-close\s*\{[^}]*border-radius:\s*50%;/s);
  assert.match(
    css,
    /\.jt-tab-close:hover,[\s\S]*\.jt-tab-close:focus-visible\s*\{[^}]*background:/s,
  );
  assert.match(
    css,
    /\.jt-tabs\s*\{[^}]*border-bottom:\s*0;/s,
  );
  assert.match(css, /\.jt-tab\s*\{[^}]*border-bottom:\s*1px solid #cbd5e1;/s);
  assert.match(css, /\.jt-tab-active\s*\{[^}]*border-bottom-color:\s*#eef2f7;/s);
  assert.match(viewer, /const mode = document\.createElement\('button'\)/);
  assert.match(viewer, /mode\.addEventListener\('click',[\s\S]*toggleIsolatedTabMode/);
  assert.match(
    viewer,
    /requestWorker\('parse-string',\s*\{[\s\S]*activateDisplay:\s*false/,
  );
  assert.match(viewer, /activateViewTabParsedMode/);
  assert.match(viewer, /setViewTabPathMode/);
  assert.match(css, /\.jt-string-view-line-text\s*\{[^}]*white-space:\s*break-spaces;/s);
  assert.match(css, /\.jt-string-view-line-text\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(css, /\.jt-string-view-line:nth-child\(odd\)/);
  assert.match(css, /\.jt-string-view-line:nth-child\(even\)/);
});

test('viewer supports one-way manual JSON input without echoing file content', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');

  assert.match(
    viewer,
    /Paste JSON, open a file, or choose an item from History to get started\./,
  );
  assert.match(viewer, /<textarea class="jt-manual-input"/);
  assert.match(viewer, /data-action="parse-manual"/);
  assert.match(viewer, /data-action="format-manual"/);
  assert.match(viewer, /parseManualInput\(\)/);
  assert.match(viewer, /formatManualInput\(\)/);
  assert.match(viewer, /formatJsonText/);
  assert.match(viewer, /manualInput\.value\s*=\s*formatJsonText\(text\)/);
  assert.match(viewer, /this\.parseText\(text,\s*\{[\s\S]*historyEntry:/);
  assert.match(viewer, /setSourceLabel\('Manual input'\)/);
  assert.doesNotMatch(viewer, /file\.text\(\)/);
  assert.doesNotMatch(viewer, /manualInput\.value\s*=\s*await\s+file\.text/);
  assert.match(viewer, /parseFile\(file,\s*'',\s*\{\s*recordHistory:\s*true\s*\}\)/);
  assert.match(viewer, /this\.requestWorker\('parse-root', \{\s*file,/);
});

test('viewer exposes a paged right-side parse history without refilling manual input', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(
    viewer,
    /class="jt-loader-actions"[\s\S]*data-action="parse-manual"[\s\S]*data-action="format-manual"[\s\S]*data-action="toggle-history"[^>]*>History<\/button>/,
  );
  assert.match(viewer, /class="jt-history-panel"[^>]*aria-label="Parse history"[^>]*hidden/);
  assert.match(
    viewer,
    /class="jt-history-close"[^>]*aria-label="Close history"[^>]*>[\s\S]*class="jt-history-close-icon"[\s\S]*aria-hidden="true"/,
  );
  assert.match(
    viewer,
    /class="jt-history-resizer"[^>]*role="separator"[^>]*aria-orientation="vertical"/,
  );
  assert.match(viewer, /resizeHistoryPanelWidth/);
  assert.match(viewer, /historyResizer\.addEventListener\('pointerdown'/);
  assert.match(
    viewer,
    /ownerDocument\.addEventListener\('pointermove'[\s\S]*continueHistoryPanelResize/,
  );
  assert.match(
    viewer,
    /ownerDocument\.addEventListener\('pointerup'[\s\S]*endHistoryPanelResize/,
  );
  assert.match(viewer, /data-action="load-more-history"/);
  assert.match(viewer, /listItem\.setAttribute\('role',\s*'listitem'\)/);
  assert.match(viewer, /listItem\.append\(button\)/);
  assert.doesNotMatch(viewer, /button\.setAttribute\('role',\s*'listitem'\)/);
  assert.match(viewer, /preview\.className = 'jt-history-item-preview'/);
  assert.match(viewer, /preview\.textContent = item\.preview/);
  assert.match(
    viewer,
    /metadata\.textContent = `\$\{formatHistorySize\([\s\S]*item\.lastViewedAt/,
  );
  assert.doesNotMatch(
    viewer,
    /metadata\.textContent = `\$\{[\s\S]*item\.sourceType[\s\S]*Manual input/,
  );
  assert.match(viewer, />No history yet\.<\/div>/);
  assert.doesNotMatch(viewer, /No parse history yet\./);
  assert.match(
    viewer,
    /this\.elements\.historyList\.hidden = this\.historyItems\.length === 0/,
  );
  assert.match(
    viewer,
    /class="jt-history-retention"[\s\S]*Keep latest[\s\S]*data-action="history-keep-count"[^>]*value="10"[\s\S]*records[\s\S]*data-action="cleanup-history"[^>]*>Clean history<\/button>/,
  );
  assert.match(viewer, /requestWorker\('list-history',\s*\{[\s\S]*cursor:[\s\S]*limit:/);
  assert.match(viewer, /requestWorker\('open-history',\s*\{[\s\S]*historyId,/);
  assert.match(viewer, /requestWorker\('save-history-session',\s*\{/);
  assert.match(
    viewer,
    /requestWorker\('cleanup-history',\s*\{\s*keep:\s*keepCount/,
  );
  assert.match(viewer, /historyEntry:\s*\{[\s\S]*sourceType:\s*'manual'/);
  assert.match(viewer, /historyEntry:\s*\{[\s\S]*sourceType:\s*'file'/);
  assert.match(viewer, /restoreViewSessionSnapshot\(response\.session\)/);
  assert.doesNotMatch(
    viewer,
    /openHistoryEntry[\s\S]*manualInput\.value\s*=/,
  );
  assert.doesNotMatch(viewer, /delete-history|clear-history/);
  assert.match(css, /\.jt-history-button\s*\{[^}]*margin-left:\s*auto;/s);
  assert.match(
    css,
    /\.jt-app\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s,
  );
  assert.match(
    css,
    /\.jt-history-panel\s*\{[^}]*width:\s*var\(--jt-history-panel-width,\s*320px\);/s,
  );
  assert.match(
    css,
    /\.jt-loader\s*\{[^}]*grid-row:\s*3;/s,
    'history and main content must keep the same row anchor when the optional banner is hidden',
  );
  assert.match(css, /\.jt-history-panel\s*\{[^}]*grid-row:\s*3\s*\/\s*-1;/s);
  assert.match(css, /\.jt-history-panel\[hidden\]\s*\{[^}]*display:\s*none;/s);
  assert.match(
    css,
    /\.jt-history-close-icon\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;[^}]*stroke:\s*currentColor;/s,
  );
  assert.match(
    css,
    /\.jt-history-resizer\s*\{[^}]*cursor:\s*col-resize;/s,
  );
  assert.match(
    css,
    /\.jt-history-empty\s*\{[^}]*flex:\s*1 1 auto;[^}]*align-items:\s*center;/s,
  );
  assert.match(
    css,
    /\.jt-history-item-preview\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
  );
  assert.match(
    css,
    /\.jt-history-retention\s*\{[^}]*margin-top:\s*auto;[^}]*flex-wrap:\s*wrap;[^}]*justify-content:\s*flex-end;[^}]*border-top:/s,
  );
  assert.match(viewer, /formatHistoryTime\(\s*item\.lastViewedAt/);
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

test('viewer places tabs above the expansion and search controls and intercepts find', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(
    viewer,
    /<\/section>\s*<nav class="jt-tabs"[^>]*><\/nav>\s*<section class="jt-view-controls">[\s\S]*class="jt-expansion-controls"[\s\S]*>Collapse<[\s\S]*>Expand root<[\s\S]*>Expand all<[\s\S]*class="jt-search-controls"[\s\S]*class="jt-search-input"[\s\S]*<\/section>\s*<div class="jt-status"/,
  );
  assert.match(viewer, /isSearchShortcut/);
  assert.match(viewer, /ownerDocument\.addEventListener\('keydown'/);
  assert.match(viewer, /searchInput\.focus\(\)/);
  assert.match(css, /\.jt-view-controls\s*\{[^}]*justify-content:\s*space-between;/s);
  assert.match(css, /\.jt-search-controls\s*\{[^}]*margin-left:\s*auto;/s);
});

test('viewer saves and restores search progress independently for each tree tab', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');

  assert.match(
    viewer,
    /this\.tabSearchStates\.set\(tab\.id,\s*\{[\s\S]*query:\s*this\.elements\.searchInput\.value[\s\S]*results:\s*\[\.\.\.this\.searchResults\][\s\S]*selectedIndex:\s*this\.selectedSearchIndex[\s\S]*truncated:\s*this\.searchResultsTruncated[\s\S]*ready:\s*this\.searchResultsReady/,
  );
  assert.match(viewer, /const search = this\.tabSearchStates\.get\(tab\.id\)/);
  assert.match(viewer, /this\.elements\.searchInput\.value = search\?\.query \|\| ''/);
  assert.match(viewer, /this\.searchResults = \[\.\.\.\(search\?\.results \|\| \[\]\)\]/);
  assert.match(viewer, /this\.selectedSearchIndex = search\?\.selectedIndex \?\? -1/);
  assert.match(
    viewer,
    /await this\.refreshRows\(\);\s*if \(tab\.id !== this\.viewTabs\.activeTabId\) \{\s*return;/,
  );
  assert.match(
    viewer,
    /if \(search\?\.ready\)\s*\{[\s\S]*updateSearchUi\(search\.truncated,\s*\{\s*reveal:\s*false\s*\}\)/,
  );
  assert.match(viewer, /else if \(search\?\.query\)\s*\{[\s\S]*this\.scheduleSearch\(\)/);
});

test('paged string tabs search, highlight, and restore their own current match', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(viewer, /this\.tabSearchStates = new Map\(\)/);
  assert.match(
    viewer,
    /this\.tabSearchStates\.set\(tab\.id,\s*\{[\s\S]*query:[\s\S]*selectedIndex:[\s\S]*ready:/,
  );
  assert.match(viewer, /const search = this\.tabSearchStates\.get\(tab\.id\)/);
  assert.match(
    viewer,
    /class="jt-expansion-controls"[\s\S]*class="jt-string-controls"[^>]*hidden[\s\S]*data-action="string-view-copy-all"[\s\S]*class="jt-search-controls"/,
  );
  assert.match(
    viewer,
    /tab\.type === 'string'[\s\S]*this\.elements\.expansionControls\.hidden = true[\s\S]*this\.elements\.stringControls\.hidden = false/,
  );
  assert.match(
    viewer,
    /this\.elements\.expansionControls\.hidden = false[\s\S]*this\.elements\.stringControls\.hidden = true/,
  );
  assert.match(
    css,
    /\.jt-expansion-controls\[hidden\],\s*\.jt-string-controls\[hidden\]\s*\{[^}]*display:\s*none;/s,
  );
  assert.match(
    viewer,
    /class="jt-button jt-copy-all-button"[^>]*data-action="string-view-copy-all"/,
  );
  assert.match(
    css,
    /\.jt-copy-all-button\s*\{[^}]*border-color:\s*#93c5fd;[^}]*color:\s*#1d4ed8;[^}]*background:\s*#eff6ff;/s,
  );
  assert.doesNotMatch(viewer, /class="jt-string-view-footer"/);
  assert.doesNotMatch(css, /\.jt-string-view-footer\s*\{/);
  assert.match(viewer, /this\.requestWorker\('search-string'/);
  assert.match(viewer, /createStringSearchSegments\(/);
  assert.match(css, /\.jt-string-search-current\s*\{/);
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

test('an isolated view switches row mode through tab-local state', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');

  assert.match(viewer, /activeTab\.closable[\s\S]*toggleTabParsedDisplay\(row\)/);
  assert.match(viewer, /setViewTabPathMode\([\s\S]*nextMode/);
  assert.match(viewer, /toggleParsedDisplay\(row\)/);
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
  assert.match(viewer, />View in isolated view<\/button>/);
  assert.doesNotMatch(viewer, /在隔离视图中查看/);
  assert.match(viewer, /element\.addEventListener\('contextmenu'/);
  assert.doesNotMatch(viewer, /if \(row\.key !== '\$'\) \{\s*element\.addEventListener\('contextmenu'/);
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
