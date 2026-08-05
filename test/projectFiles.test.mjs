import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const PRODUCT_NAME = 'AZ JSON Explorer';

test('manifest is valid MV3 JSON and exposes viewer resources to content pages', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.name, '__MSG_appName__');
  assert.equal(manifest.action.default_title, '__MSG_appName__');
  assert.equal(manifest.action.default_popup, undefined);
  assert.deepEqual(manifest.commands['open-standalone-viewer'], {
    suggested_key: {
      default: 'Ctrl+Shift+6',
      mac: 'Command+Shift+6',
    },
    description: '__MSG_openStandaloneViewerCommand__',
    global: true,
  });
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
  assert.match(
    background,
    /chrome\.action\.onClicked\.addListener\(\(\) => openViewerTab\(\)\)/,
  );
  assert.match(
    background,
    /chrome\.commands\.onCommand\.addListener\([\s\S]*OPEN_STANDALONE_VIEWER_COMMAND[\s\S]*openFocusedViewerTab\(\)/,
  );
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

  assert.doesNotMatch(
    viewer,
    /sourceLabel:\s*translate\('standaloneViewer',\s*'Standalone viewer'\)/,
  );
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
  const viewerHtml = await readFile(new URL('../src/viewer.html', import.meta.url), 'utf8');
  const viewerApp = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');

  assert.match(viewerHtml, new RegExp(`<title>${PRODUCT_NAME}</title>`));
  assert.match(viewerApp, new RegExp(`<strong>${PRODUCT_NAME}</strong>`));
});

test('local file usage documents Chrome file URL access requirement', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /Allow access to file URLs/);
});

test('sample fixture is valid JSON and includes nested stringified JSON', async () => {
  const sample = JSON.parse(await readFile(new URL('../fixtures/sample.json', import.meta.url), 'utf8'));

  assert.equal(typeof sample.payload, 'string');
  assert.deepEqual(JSON.parse(sample.payload).items, [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(JSON.parse(sample.meta.stringifiedArray), [1, 2, 3]);
});

test('store presentation centers on parse, isolated views, and history', async () => {
  const [listing, listingZh] = await Promise.all([
    readFile(new URL('../store-assets/listing.md', import.meta.url), 'utf8'),
    readFile(new URL('../store-assets/listing.zh-CN.md', import.meta.url), 'utf8'),
  ]);
  const generator = await readFile(
    new URL('../scripts/generate-store-assets.mjs', import.meta.url),
    'utf8',
  );

  assert.match(listing, /Parse as JSON:/);
  assert.match(listing, /Isolated views:/);
  assert.match(listing, /History:/);
  assert.match(listing, /Star the project on GitHub:/);
  assert.match(listing, /github\.com\/zcfan\/az-json-explorer/);
  assert.match(listingZh, /解析嵌套 JSON：/);
  assert.match(listingZh, /独立视图：/);
  assert.match(listingZh, /历史记录：/);
  assert.match(listingZh, /树中的对象、数组或字符串/);
  assert.match(
    listingZh,
    /恢复当时打开的独立标签页、原始\/已解析模式和搜索词/,
  );
  assert.match(listingZh, /JSON 内容不会上传、同步或发送到第三方服务器/);
  assert.match(listingZh, /不会把 JSON 内容上传或同步到扩展开发者或第三方服务器/);
  assert.match(listingZh, /不包含遥测或分析代码/);
  assert.match(listingZh, /打开文件”不需要这项权限/);
  assert.match(listingZh, /允许访问文件网址/);
  assert.match(listingZh, /提供树形节点的直接编辑/);
  assert.match(listingZh, /github\.com\/zcfan\/az-json-explorer/);
  assert.doesNotMatch(listingZh, /任意路径/);
  assert.match(generator, /isolated-view-1\.png/);
  assert.match(generator, /isolated-view-2\.png/);
  assert.match(generator, /isolated-view-3\.png/);
  assert.match(generator, /listing\.zh-CN\.md/);
  assert.doesNotMatch(listing, /large-json-navigation/);
  assert.doesNotMatch(listingZh, /large-json-navigation/);
  assert.equal(generator.match(/class="tab tab-active"/g)?.length, 1);
  assert.match(
    generator,
    /\.tab\s*\{[\s\S]*?position:\s*relative;[\s\S]*?border-bottom:\s*0;/,
  );
  assert.match(
    generator,
    /\.tab-active::after\s*\{[^}]*bottom:\s*-2px;[^}]*height:\s*3px;[^}]*background:\s*#ffffff;/s,
  );
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

test('viewer exposes isolated tree and paged string tabs', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(viewer, /class="jt-tabs"[^>]*role="tablist"[^>]*hidden/);
  assert.match(
    css,
    /\.jt-tabs\s*\{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/s,
  );
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
  assert.doesNotMatch(viewer, /beginStringDialogResize/);
  assert.match(viewer, /if \(row\.valueTruncated\)/);
  assert.match(viewer, /translate\('viewAll', 'View all'\)/);
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
  assert.doesNotMatch(css, /\.jt-loader\s*\{[^}]*border-bottom:/s);
  assert.doesNotMatch(css, /\.jt-loader:has/);
  assert.match(
    css,
    /\.jt-tabs::after\s*\{[^}]*z-index:\s*0;[^}]*right:\s*0;[^}]*bottom:\s*0;[^}]*left:\s*0;[^}]*height:\s*1px;[^}]*background:\s*#cbd5e1;/s,
  );
  assert.match(
    css,
    /\.jt-tab\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*1;[^}]*border-bottom:\s*0;/s,
  );
  assert.match(viewer, /tab\.id === 'root' \? ' jt-tab-root' : ''/);
  assert.match(
    css,
    /\.jt-tab-root\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*none;[^}]*flex:\s*0 0 auto;/s,
  );
  assert.match(
    css,
    /\.jt-tab-root \.jt-tab-select\s*\{[^}]*flex:\s*0 0 auto;[^}]*padding:\s*0 12px;/s,
  );
  assert.match(
    css,
    /\.jt-tab-active::after\s*\{[^}]*bottom:\s*-1px;[^}]*height:\s*2px;[^}]*background:\s*#eef2f7;/s,
  );
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

test('viewer help exposes grouped shortcuts and the published changelog', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
  const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');

  assert.match(
    viewer,
    /class="jt-help-button"[\s\S]*aria-haspopup="menu"[\s\S]*>Help<\/button>/,
  );
  assert.match(viewer, /class="jt-help-menu" role="menu" hidden/);
  assert.match(viewer, />Keyboard shortcuts<\/button>/);
  assert.match(
    viewer,
    /href="https:\/\/github\.com\/zcfan\/az-json-explorer\/blob\/main\/CHANGELOG\.md"/,
  );
  assert.match(viewer, /const changelogUrl = getLocalizedChangelogUrl\(\)/);
  assert.match(viewer, /versionUpdateLink\.href = changelogUrl/);
  assert.match(viewer, /changeLogLink\.href = changelogUrl/);
  assert.match(
    viewer,
    /class="jt-shortcuts-dialog" aria-labelledby="jt-shortcuts-title"/,
  );
  assert.match(viewer, />Chrome running in the background<\/h3>/);
  assert.match(viewer, />Chrome in focus<\/h3>/);
  assert.match(viewer, />Non-editable viewer area focused<\/h3>/);
  assert.match(viewer, />JSON input focused<\/h3>/);
  assert.match(viewer, />Viewer focused<\/h3>/);
  assert.match(viewer, />Search focused<\/h3>/);
  assert.match(viewer, /data-shortcut="open-viewer"/);
  assert.match(viewer, /data-shortcut="select-all"/);
  assert.match(viewer, /this\.elements\.shortcutsDialog\.showModal\(\)/);
  assert.match(
    viewer,
    /globalThis\.chrome\.tabs\.create\(\{ url \}\)/,
  );
  assert.match(css, /\.jt-help-menu\s*\{[^}]*position:\s*absolute;/s);
  assert.match(
    css,
    /\.jt-shortcuts-dialog::backdrop,\s*\.jt-pro-tips-dialog::backdrop\s*\{[^}]*background:/s,
  );
  assert.match(changelog, /^# Changelog/m);
  assert.match(changelog, /^## 0\.1\.10 — 2026-07-27/m);
  assert.match(changelog, /^## 0\.1\.9 — 2026-07-25/m);
  assert.match(changelog, /^## 0\.1\.0 — 2026-07-05/m);
  assert.doesNotMatch(changelog, /Unreleased/i);
});

test('viewer shows a ten-second changelog notice once per extension version', async () => {
  const entry = await readFile(new URL('../src/viewer.js', import.meta.url), 'utf8');
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(entry, /chrome\?\.runtime\?\.getManifest\?\.\(\)\.version/);
  assert.match(entry, /currentVersion,/);
  assert.match(viewer, /const VERSION_UPDATE_NOTICE_DURATION_MS = 10000;/);
  assert.match(
    viewer,
    /class="jt-version-update-notice"[\s\S]*data-action="view-update-notes"[\s\S]*>See what’s new<\/a>/,
  );
  assert.match(
    viewer,
    /AZ JSON Explorer <strong class="jt-version-update-version"><\/strong>[\s\S]*data-i18n="versionUpdateSuffix"[\s\S]*keeps paste in the focused search or other editable control\./,
  );
  assert.match(viewer, /claimVersionUpdateNotice\(storage, currentVersion\)/);
  assert.match(
    viewer,
    /setTimeout\(\(\) => \{[\s\S]*hideVersionUpdateNotice\(\);[\s\S]*VERSION_UPDATE_NOTICE_DURATION_MS/,
  );
  assert.match(
    css,
    /\.jt-version-update-notice::before\s*\{[^}]*inset:\s*0;[^}]*animation:\s*jt-version-update-countdown/s,
  );
  assert.match(
    css,
    /@keyframes jt-version-update-countdown\s*\{\s*from\s*\{\s*transform:\s*scaleX\(0\);\s*\}\s*to\s*\{\s*transform:\s*scaleX\(1\);/s,
  );
});

test('Help opens a localized Pro Tips dialog with three practical sections', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(
    viewer,
    /class="jt-help-menu-item"[\s\S]*data-action="show-pro-tips"[\s\S]*data-i18n="proTips"/,
  );
  assert.match(
    viewer,
    /class="jt-pro-tips-dialog" aria-labelledby="jt-pro-tips-title"/,
  );
  assert.match(viewer, /data-i18n="proTipsViewJsonFaster"/);
  assert.match(viewer, /data-i18n="proTipsIsolatedViews"/);
  assert.match(viewer, /data-i18n="proTipsOther"/);
  assert.match(viewer, /data-action="open-shortcut-settings"/);
  assert.match(viewer, /class="jt-pro-tips-integration-link"/);
  assert.match(viewer, /integrationGuideLink\.href = getLocalizedIntegrationGuideUrl\(\)/);
  assert.match(viewer, /this\.elements\.proTipsDialog\.showModal\(\)/);
  assert.match(viewer, /this\.elements\.proTipsDialog\.close\(\)/);
  assert.match(css, /\.jt-pro-tips-dialog::backdrop\s*\{[^}]*background:/s);
});

test('viewer supports one-way manual JSON input without echoing file content', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(
    viewer,
    /Paste JSON, open a file, or choose an item from History to get started\./,
  );
  assert.match(viewer, /<textarea class="jt-manual-input"/);
  assert.match(
    viewer,
    /class="jt-manual-input-resizer"[\s\S]*class="jt-manual-input-toggle"[\s\S]*Ctrl\+&#96;/,
  );
  assert.match(viewer, /data-action="toggle-manual-input"/);
  assert.match(
    viewer,
    /aria-controls="jt-manual-input jt-manual-input-actions"/,
  );
  assert.match(
    viewer,
    /<kbd>Ctrl\+&#96;<\/kbd> <span data-i18n="toggleJsonInput">Toggle JSON input · Drag to resize<\/span>/,
  );
  assert.doesNotMatch(viewer, /jt-manual-input-toggle-icon/);
  assert.match(
    viewer,
    /class="jt-manual-input"[\s\S]*class="jt-manual-input-card"[\s\S]*class="jt-loader-actions"[\s\S]*data-action="parse-manual"[\s\S]*data-action="format-manual"[\s\S]*data-action="toggle-manual-input"/,
  );
  assert.match(
    viewer,
    /manualInputToggle\.addEventListener\('click', \(event\) => \{[\s\S]*event\.detail !== 0[\s\S]*this\.toggleManualInput\(\)/,
  );
  assert.match(
    viewer,
    /manualInputResizer\.addEventListener\('pointerdown',[\s\S]*beginManualInputResize\(event\)[\s\S]*continueManualInputResize\(event\)[\s\S]*endManualInputResize\(event\)/,
  );
  assert.match(
    viewer,
    /const layout = resolveManualInputDrag\(\{[\s\S]*this\.applyManualInputDragLayout\(layout\)/,
  );
  assert.match(
    viewer,
    /applyManualInputDragLayout\(layout\) \{[\s\S]*setManualInputExpanded\(layout\.expanded\)[\s\S]*if \(!layout\.expanded\) \{[\s\S]*return;[\s\S]*layout\.handleClientY - manualInputResizer\.getBoundingClientRect\(\)\.top/,
  );
  assert.match(
    viewer,
    /applyManualInputDragLayout\(layout\) \{[\s\S]*manualInputResizer\.style\.transform/,
  );
  assert.match(
    viewer,
    /toggleManualInput\(\) \{[\s\S]*setManualInputExpanded\(this\.elements\.manualInput\.hidden\)/,
  );
  assert.match(
    viewer,
    /setManualInputExpanded\(expanded\) \{[\s\S]*manualInput\.hidden = !expanded;[\s\S]*manualInputActions\.hidden = !expanded;[\s\S]*setAttribute\('aria-expanded', String\(expanded\)\)/,
  );
  assert.match(
    viewer,
    /isSelectAllShortcut\(event\)[\s\S]*setManualInputExpanded\(true\);[\s\S]*manualInput\.focus\(\);[\s\S]*manualInput\.select\(\)/,
  );
  assert.match(
    viewer,
    /isManualInputToggleShortcut\(event\)[\s\S]*this\.toggleManualInput\(\)/,
  );
  assert.match(viewer, /data-action="parse-manual"/);
  assert.match(viewer, /data-action="format-manual"/);
  assert.match(viewer, /parseManualInput\(\)/);
  assert.match(viewer, /formatManualInput\(\)/);
  assert.match(viewer, /formatJsonText/);
  assert.match(viewer, /manualInput\.value\s*=\s*formatJsonText\(text\)/);
  assert.match(viewer, /this\.parseText\(text,\s*\{[\s\S]*historyEntry:/);
  assert.match(
    viewer,
    /const manualInputLabel = translate\('manualInput', 'Manual input'\);[\s\S]*setSourceLabel\(manualInputLabel\)/,
  );
  assert.doesNotMatch(viewer, /file\.text\(\)/);
  assert.doesNotMatch(viewer, /manualInput\.value\s*=\s*await\s+file\.text/);
  assert.match(viewer, /parseFile\(file,\s*'',\s*\{\s*recordHistory:\s*true\s*\}\)/);
  assert.match(viewer, /this\.requestWorker\('parse-root', \{\s*file,/);
  assert.match(css, /\.jt-manual-input\s*\{[^}]*height:\s*300px;/s);
  assert.match(css, /\.jt-manual-input\s*\{[^}]*resize:\s*none;/s);
  assert.match(
    css,
    /\.jt-manual-input-resizer\s*\{[^}]*min-height:\s*16px;[^}]*cursor:\s*pointer;[^}]*touch-action:\s*none;/s,
  );
  assert.match(
    css,
    /\.jt-manual-input-resizer-active,\s*\.jt-manual-input-resizer-active \.jt-manual-input-toggle\s*\{[^}]*cursor:\s*ns-resize;/s,
  );
  assert.match(
    css,
    /\.jt-manual-input-toggle\s*\{[^}]*z-index:\s*1;[^}]*background:\s*#f8fafc;[^}]*cursor:\s*pointer;/s,
  );
  assert.doesNotMatch(css, /\.jt-manual-input-toggle::before/);
  assert.match(
    css,
    /\.jt-manual-input-card\s*\{[^}]*width:\s*100%;[^}]*margin-top:\s*-6px;[^}]*border:\s*1px solid #cbd5e1;[^}]*border-radius:\s*0 0 8px 8px;[^}]*padding:\s*14px 10px 3px;/s,
  );
  assert.match(
    css,
    /\.jt-manual-input-card:has\(\.jt-manual-input-toggle\[aria-expanded="false"\]\)\s*\{[^}]*margin-top:\s*0;[^}]*border-radius:\s*6px;[^}]*padding:\s*3px 10px;/s,
  );
  assert.match(
    css,
    /\.jt-manual-input-resizer:hover::before,[\s\S]*\.jt-manual-input-resizer:has\(\.jt-manual-input-toggle:focus-visible\)::before,[\s\S]*\.jt-manual-input-resizer-active::before\s*\{[^}]*background:\s*#3b82f6;/s,
  );
  assert.match(
    css,
    /\.jt-manual-input-resizer::before\s*\{[^}]*height:\s*1px;[^}]*background:\s*#e2e8f0;/s,
  );
  assert.doesNotMatch(css, /\.jt-manual-input-resizer:focus-within::before/);
  assert.match(
    css,
    /\.jt-manual-input-toggle-content\s*\{[^}]*background:\s*transparent;/s,
  );
  assert.doesNotMatch(css, /\.jt-manual-input-toggle-icon/);
  assert.match(
    css,
    /\.jt-manual-input\[hidden\],[\s\S]*\.jt-loader-actions\[hidden\]\s*\{[^}]*display:\s*none;/s,
  );
});

test('embedded viewer hides the complete manual JSON input region', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(
    viewer,
    /if \(this\.options\.embedded\) \{[\s\S]*this\.elements\.loader\.hidden = true;/,
  );
  assert.match(
    css,
    /\.jt-loader\[hidden\]\s*\{[^}]*display:\s*none;/s,
  );
});

test('empty standalone tree opens the most recent history entry from a full-area prompt', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(
    viewer,
    /class="jt-empty-history-load"[\s\S]*data-action="open-latest-history"[\s\S]*data-i18n="loadLatestHistory"/,
  );
  assert.match(
    viewer,
    /emptyHistoryLoadButton\.addEventListener\('click',[\s\S]*openLatestHistoryEntry\(\)/,
  );
  assert.match(
    viewer,
    /async openLatestHistoryEntry\(\) \{[\s\S]*requestWorker\('list-history',\s*\{[\s\S]*cursor:\s*null,[\s\S]*limit:\s*1,[\s\S]*response\.items\[0\][\s\S]*openHistoryEntry\(/,
  );
  assert.match(
    css,
    /\.jt-empty-history-load\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*color:[^}]*font-size:/s,
  );
  assert.match(
    css,
    /\.jt-empty-history-load\[hidden\]\s*\{[^}]*display:\s*none;/s,
  );
});

test('viewer restores persistent history and manual-input dimensions', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');

  assert.match(viewer, /loadViewerUiState/);
  assert.match(viewer, /saveViewerUiState/);
  assert.match(
    viewer,
    /this\.createWorker\(\);\s*this\.restoreViewerUiState\(\);/,
  );
  assert.match(
    viewer,
    /restoreViewerUiState\(\) \{[\s\S]*manualInput\.style\.height[\s\S]*--jt-history-panel-width[\s\S]*historyPanelOpen[\s\S]*loadHistoryPage\(\{ reset: true \}\)/,
  );
  assert.match(
    viewer,
    /persistViewerUiState\(\) \{[\s\S]*historyPanelOpen:[\s\S]*historyPanelWidth:[\s\S]*manualInputHeight:[\s\S]*saveViewerUiState/,
  );
  assert.match(
    viewer,
    /endManualInputResize\(event\) \{[\s\S]*state\.dragging[\s\S]*persistViewerUiState\(\)/,
  );
  assert.match(
    viewer,
    /endHistoryPanelResize\(event\) \{[\s\S]*persistViewerUiState\(\)/,
  );
  assert.match(
    viewer,
    /toggleHistoryPanel\(\) \{[\s\S]*persistViewerUiState\(\)/,
  );
  assert.match(
    viewer,
    /closeHistoryPanel\(\) \{[\s\S]*persistViewerUiState\(\)/,
  );
});

test('viewer applies viewport limits while dragging and restoring dimensions', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(
    css,
    /\.jt-manual-input\s*\{[^}]*max-height:\s*30vh;/s,
  );
  assert.match(
    css,
    /\.jt-history-panel\s*\{[^}]*max-width:\s*50vw;/s,
  );
  assert.match(
    viewer,
    /continueManualInputResize\(event\) \{[\s\S]*viewportHeight[\s\S]*resizeManualInputHeight\(\{[\s\S]*viewportHeight/,
  );
  assert.match(
    viewer,
    /restoreViewerUiState\(\) \{[\s\S]*viewportHeight[\s\S]*resizeManualInputHeight\(\{[\s\S]*state\.manualInputHeight[\s\S]*viewportHeight[\s\S]*manualInput\.style\.height/,
  );
});

test('viewer exposes a paged right-side parse history without refilling manual input', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
  const openHistoryMethod = viewer.slice(
    viewer.indexOf('async openHistoryEntry('),
    viewer.indexOf('async markCurrentHistoryViewed('),
  );

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
    /const size = formatHistorySize\(item\.size\);[\s\S]*const time = formatHistoryTime\(item\.lastViewedAt\);[\s\S]*metadata\.textContent = translate\(/,
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
    /<form class="jt-history-retention">[\s\S]*Keep latest[\s\S]*data-action="history-keep-count"[^>]*value="10"[\s\S]*records[\s\S]*data-action="cleanup-history"[^>]*type="submit"[^>]*>Clean history<\/button>[\s\S]*<\/form>/,
  );
  assert.match(
    viewer,
    /historyRetention\.addEventListener\('submit',[\s\S]*preventDefault\(\)[\s\S]*cleanupHistory\(\)/,
  );
  assert.match(
    viewer,
    /historyKeepCount\.addEventListener\('keydown',[\s\S]*event\.key !== 'Enter'[\s\S]*preventDefault\(\)[\s\S]*historyRetention\.requestSubmit\(\)/,
  );
  assert.doesNotMatch(
    viewer,
    /historyCleanupButton\.addEventListener\('click'/,
  );
  assert.match(viewer, /requestWorker\('list-history',\s*\{[\s\S]*cursor:[\s\S]*limit:/);
  assert.match(viewer, /requestWorker\('open-history',\s*\{[\s\S]*historyId,/);
  assert.match(viewer, /const HISTORY_ENGAGEMENT_SELECTOR =/);
  assert.match(
    viewer,
    /this\.shadow\.addEventListener\('click',[\s\S]*isHistoryEngagementClick[\s\S]*markCurrentHistoryViewed/,
  );
  assert.match(openHistoryMethod, /this\.pendingHistoryViewId = response\.historyId/);
  assert.doesNotMatch(openHistoryMethod, /mark-history-viewed/);
  assert.match(
    viewer,
    /requestWorker\('mark-history-viewed',\s*\{\s*historyId,/,
  );
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
    /\.jt-loader\s*\{[^}]*grid-row:\s*4;/s,
    'history and main content must keep the same row anchor when the optional banner is hidden',
  );
  assert.match(css, /\.jt-history-panel\s*\{[^}]*grid-row:\s*4\s*\/\s*-1;/s);
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
  assert.match(viewer, /getPasteAction/);
  assert.match(viewer, /clipboardData\?\.getData\('text\/plain'\)/);
  assert.match(
    viewer,
    /if \(pasteAction === 'native'\) \{\s*return;\s*\}\s*event\.preventDefault\(\);/,
  );
  assert.match(
    viewer,
    /if \(pasteAction === 'replace-and-parse'\) \{\s*this\.setManualInputExpanded\(true\);\s*manualInput\.value = '';\s*manualInput\.setSelectionRange\(0, 0\);/,
  );
  assert.match(viewer, /manualInput\.setRangeText/);
  assert.match(
    viewer,
    /manualInput\.dispatchEvent\([\s\S]*this\.parseManualInput\(\);/,
  );
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
    /if \(search\?\.ready\)\s*\{[\s\S]*updateSearchUi\(search\.truncated\)/,
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
  assert.match(viewer, /parseFile\(\s*event\.data\.file/);
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

test('search row highlights are visible while matched text remains strongest', async () => {
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(css, /\.jt-row-search-hit\s*\{[^}]*background:\s*#fffaf0;/s);
  assert.match(css, /\.jt-row-search-current\s*\{[^}]*background:\s*#fff1c7;/s);
  assert.match(css, /\.jt-row-search-current\s*\{[^}]*outline:\s*1px solid #ead89a;/s);
  assert.match(css, /\.jt-search-mark\s*\{[^}]*background:\s*#facc15;/s);
});

test('search reveals after query edits or explicit navigation and centers tree matches', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const searchRunner = viewer.slice(
    viewer.indexOf('async runFullTextSearch(query, options = {})'),
    viewer.indexOf('\n  clearSearchResults'),
  );
  const navigator = viewer.slice(
    viewer.indexOf('async selectSearchResult(delta)'),
    viewer.indexOf('\n  async updateSearchUi'),
  );
  const searchUi = viewer.slice(
    viewer.indexOf('async updateSearchUi'),
    viewer.indexOf('\n  async revealStringSearchMatch'),
  );

  assert.match(
    viewer,
    /searchInput\.addEventListener\('input',[\s\S]*scheduleSearch\(\{ revealFirst: true \}\)/,
  );
  assert.match(
    searchRunner,
    /this\.selectedSearchIndex = this\.searchResults\.length > 0 \? 0 : -1/,
  );
  assert.match(
    searchRunner,
    /if \(options\.revealFirst && this\.selectedSearchIndex >= 0\) \{\s+await this\.revealSelectedSearchResult\(\)/,
  );
  assert.match(navigator, /getSearchNavigationIndex/);
  assert.match(navigator, /await this\.revealSelectedSearchResult\(\)/);
  assert.doesNotMatch(searchUi, /revealSearchMatch|revealStringSearchMatch/);
  assert.match(viewer, /scheduleSearch\(options = \{\}\)/);
  assert.match(viewer, /this\.runFullTextSearch\(query, options\)/);
  assert.match(viewer, /await this\.runFullTextSearch\(query\);/);
  assert.match(viewer, /tree\.scrollTop = getCenteredRowScrollTop\(/);
});

test('parse button is hidden after a string already has parsed cache', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');

  assert.match(viewer, /if \(row\.canParseAsJson && !row\.hasParsed\)/);
});

test('raw and parsed badges stay compact within dense JSON rows', async () => {
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(css, /\.jt-badge\s*\{[^}]*height:\s*18px;/s);
  assert.match(css, /\.jt-badge\s*\{[^}]*padding:\s*0 6px;/s);
  assert.match(css, /\.jt-badge\s*\{[^}]*font-size:\s*10px;/s);
  assert.match(css, /\.jt-badge\s*\{[^}]*line-height:\s*1;/s);
});

test('parse controls appear between the key and colon while View all follows the value', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const keyIndex = viewer.indexOf('element.append(key);');
  const parseButtonIndex = viewer.indexOf('element.append(parseButton);');
  const badgeIndex = viewer.indexOf('element.append(badge);');
  const colonIndex = viewer.indexOf('element.append(colon);');
  const valueIndex = viewer.indexOf('element.append(value);');
  const viewAllIndex = viewer.indexOf('element.append(viewAllButton);');

  assert.ok(keyIndex < parseButtonIndex && parseButtonIndex < colonIndex);
  assert.ok(keyIndex < badgeIndex && badgeIndex < colonIndex);
  assert.ok(colonIndex < valueIndex && valueIndex < viewAllIndex);
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

test('only the explicit toggle and its leading indentation expand a row', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
  const rowRenderer = viewer.slice(
    viewer.indexOf('createRowElement(row, index)'),
    viewer.indexOf('\n  appendRowKey'),
  );

  assert.match(viewer, /row\.expandable \? 'jt-row-expandable' : ''/);
  assert.doesNotMatch(rowRenderer, /element\.addEventListener\('click'/);
  assert.match(
    rowRenderer,
    /if \(row\.expandable\) \{\s+indent\.addEventListener\('click', \(\) => this\.toggleExpanded\(row\)\);\s+\}/,
  );
  assert.match(
    rowRenderer,
    /toggle\.addEventListener\('click', \(\) => this\.toggleExpanded\(row\)\)/,
  );
  assert.doesNotMatch(css, /\.jt-row-expandable\s*\{[^}]*cursor:\s*pointer;/s);
  assert.match(css, /\.jt-row-expandable \.jt-indent\s*\{[^}]*cursor:\s*pointer;/s);
  assert.match(css, /\.jt-row-expandable \.jt-value[^}]*cursor:\s*text;/s);
});

test('nested rows draw vertical indentation guides aligned with ancestor keys', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(viewer, /const INDENT_WIDTH = 24;/);
  assert.match(viewer, /row\.depth \* INDENT_WIDTH/);
  assert.match(viewer, /row\.depth > 0 \? 'jt-indent jt-indent-guided' : 'jt-indent'/);
  assert.match(css, /\.jt-indent\s*\{[^}]*height:\s*100%;/s);
  assert.match(css, /\.jt-indent-guided\s*\{[^}]*repeating-linear-gradient\([^)]*24px/s);
  assert.match(css, /#e2e8f0 23px 24px/);
});

test('dense JSON row metrics stay synchronized with virtual scrolling', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(viewer, /const ROW_HEIGHT = 18;/);
  assert.match(css, /\.jt-tree\s*\{[^}]*font:\s*12px\/18px/s);
  assert.match(css, /\.jt-row\s*\{[^}]*height:\s*18px;/s);
  assert.match(css, /\.jt-toggle\s*\{[^}]*width:\s*20px;[^}]*height:\s*18px;/s);
  assert.match(css, /\.jt-parse-button\s*\{[^}]*height:\s*18px;/s);
  assert.match(css, /\.jt-view-all-button\s*\{[^}]*height:\s*18px;/s);
});

test('sticky ancestors are navigation-only and capped at ten rows', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
  const stickyRenderer = viewer.slice(
    viewer.indexOf('createStickyAncestorElement(row, rowIndex)'),
    viewer.indexOf('\n  locateTreeRow(rowIndex) {'),
  );

  assert.match(viewer, /const MAX_STICKY_ANCESTOR_ROWS = 10;/);
  assert.match(viewer, /const STICKY_COVERED_THRESHOLD = 3;/);
  assert.match(viewer, /createParentRowIndexes\(this\.rows\)/);
  assert.match(
    viewer,
    /ROW_HEIGHT,\s+MAX_STICKY_ANCESTOR_ROWS,\s+STICKY_COVERED_THRESHOLD,/,
  );
  assert.doesNotMatch(viewer, /getStickyRowLimit|MAX_STICKY_VIEWPORT_RATIO/);
  assert.match(stickyRenderer, /className = 'jt-sticky-row'/);
  assert.match(
    stickyRenderer,
    /event\.stopPropagation\(\);\s+this\.locateTreeRow\(rowIndex\)/,
  );
  assert.match(
    stickyRenderer,
    /addEventListener\('contextmenu', \(event\) => event\.preventDefault\(\)\)/,
  );
  assert.doesNotMatch(
    stickyRenderer,
    /createRowElement|toggleExpanded|parseStringRow|openRowContextMenu|jt-toggle|jt-parse-button/,
  );
  assert.match(stickyRenderer, /if \(row\.parsed\)/);
  assert.match(stickyRenderer, /document\.createElement\('span'\)/);
  assert.match(stickyRenderer, /jt-badge jt-badge-parsed jt-sticky-badge/);
  assert.doesNotMatch(stickyRenderer, /badge\.addEventListener/);
  assert.match(viewer, /tree\.scrollTop = getStickyExitScrollTop\(/);
  assert.match(viewer, /index === this\.locatedRowIndex \? 'jt-row-located' : ''/);
  assert.match(css, /\.jt-sticky-layer\s*\{[^}]*position:\s*sticky;/s);
  assert.match(css, /\.jt-sticky-row\s*\{[^}]*cursor:\s*pointer;/s);
  assert.match(css, /\.jt-sticky-badge\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(css, /\.jt-row-located\s*\{[^}]*animation:/s);
});

test('JSON keys use muted color and regular weight in dense rows', async () => {
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(
    css,
    /\.jt-key\s*\{[^}]*color:\s*hsl\(220 3% 58%\);[^}]*font-weight:\s*400;/s,
  );
});

test('JSON values use maximum weight and saturation in dense rows', async () => {
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(css, /\.jt-value\s*\{[^}]*font-weight:\s*900;/s);
  assert.match(css, /\.jt-effective-string\s*\{[^}]*color:\s*hsl\(162 100% 26%\);/s);
  assert.match(css, /\.jt-effective-number\s*\{[^}]*color:\s*hsl\(219 100% 48%\);/s);
  assert.match(css, /\.jt-effective-boolean\s*\{[^}]*color:\s*hsl\(24 100% 38%\);/s);
});

test('values follow their keys without column alignment spacers', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.doesNotMatch(viewer, /valueAlignment|VALUE_ALIGNMENT|value-aligner|alignVisibleRowValues/);
  assert.doesNotMatch(css, /\.jt-value-aligner/);
  assert.match(
    css,
    /\.jt-colon\s*\{[^}]*margin-right:\s*8px;[^}]*color:\s*hsl\(220 45% 58%\);/s,
  );
});

test('viewer wires Expand all through compact expansion state', async () => {
  const viewer = await readFile(new URL('../src/ui/viewerApp.js', import.meta.url), 'utf8');

  assert.match(viewer, /data-action="expand-all"/);
  assert.match(viewer, /createAllExpansionState/);
  assert.match(viewer, /expansionMode:\s*this\.expansion\.mode/);
  assert.match(viewer, /collapsedKeys:\s*Array\.from\(this\.expansion\.collapsedKeys\)/);
  assert.match(
    viewer,
    /pendingStatus:\s*translate\('expandingAll', 'Expanding all\.\.\.'\)/,
  );
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
