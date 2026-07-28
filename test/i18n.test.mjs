import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  getLocalizedChangelogUrl,
  getLocalizedIntegrationGuideUrl,
  localizeDocument,
  localizeUi,
  translate,
} from '../src/core/i18n.js';

const ROOT = new URL('../', import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, ROOT), 'utf8'));
}

function collectPlaceholderNames(entry) {
  return Object.keys(entry.placeholders || {}).sort();
}

test('English and Simplified Chinese catalogs expose the same messages and placeholders', async () => {
  const [english, chinese] = await Promise.all([
    readJson('_locales/en/messages.json'),
    readJson('_locales/zh_CN/messages.json'),
  ]);

  assert.deepEqual(Object.keys(chinese).sort(), Object.keys(english).sort());
  for (const key of Object.keys(english)) {
    assert.ok(english[key].message, `${key} needs an English message`);
    assert.ok(chinese[key].message, `${key} needs a Simplified Chinese message`);
    assert.deepEqual(
      collectPlaceholderNames(chinese[key]),
      collectPlaceholderNames(english[key]),
      `${key} must use the same named placeholders in both locales`,
    );
    for (const placeholder of collectPlaceholderNames(english[key])) {
      assert.equal(
        chinese[key].placeholders[placeholder].content,
        english[key].placeholders[placeholder].content,
        `${key}.${placeholder} must use the same positional substitution`,
      );
    }
  }
});

test('manual input toggle copy also explains drag resizing', async () => {
  const [english, chinese] = await Promise.all([
    readJson('_locales/en/messages.json'),
    readJson('_locales/zh_CN/messages.json'),
  ]);

  assert.equal(
    english.toggleJsonInput.message,
    'Toggle JSON input · Drag to resize',
  );
  assert.equal(
    chinese.toggleJsonInput.message,
    '显示或隐藏 JSON 输入框 · 拖拽可调整高度',
  );
});

test('Pro Tips copy preserves shortcut, paste, isolated-view, and integration semantics', async () => {
  const [english, chinese] = await Promise.all([
    readJson('_locales/en/messages.json'),
    readJson('_locales/zh_CN/messages.json'),
  ]);

  assert.deepEqual(
    {
      title: english.proTips.message,
      quickOpen: english.proTipQuickOpenOutcome.message,
      customShortcut: english.proTipCustomShortcutForeground.message,
      paste: english.proTipPasteAnywhereOutcome.message,
      replace: english.proTipReplaceInputOutcome.message,
      resize: english.proTipResizeInput.message,
      subtree: english.proTipIsolateSubtree.message,
      longString: english.proTipIsolateLongString.message,
      integration: english.proTipIntegrationLink.message,
    },
    {
      title: 'Pro Tips',
      quickOpen:
        'As long as Chrome is running in the background, AZ JSON Explorer opens, comes to the front, and parses it.',
      customShortcut:
        'Custom shortcuts work only while Chrome is in the foreground.',
      paste: 'anywhere in the viewer to paste and parse immediately.',
      replace:
        'replaces all existing content. When focused, paste behaves like normal editing: it inserts at the cursor or replaces the selection.',
      resize:
        'JSON input taking too much space? Drag the divider to resize it, or press',
      subtree:
        'Want to focus on one subtree? Right-click it and choose “View in isolated view.” You can open the same subtree in multiple tabs.',
      longString:
        'Need the full, untruncated text of a long string? Open it in an isolated view. If the string contains JSON, switch between raw and parsed directly on its tab.',
      integration: 'Read the integration guide',
    },
  );
  assert.deepEqual(
    {
      title: chinese.proTips.message,
      quickOpen: chinese.proTipQuickOpenOutcome.message,
      customShortcut: chinese.proTipCustomShortcutForeground.message,
      paste: chinese.proTipPasteAnywhereOutcome.message,
      replace: chinese.proTipReplaceInputOutcome.message,
      resize: chinese.proTipResizeInput.message,
      subtree: chinese.proTipIsolateSubtree.message,
      longString: chinese.proTipIsolateLongString.message,
      integration: chinese.proTipIntegrationLink.message,
    },
    {
      title: '使用技巧',
      quickOpen:
        '只要 Chrome 仍在后台运行，AZ JSON Explorer 就会打开、切到前台并解析剪贴板内容。',
      customShortcut:
        '请注意：自定义快捷键仅在 Chrome 位于前台时有效。',
      paste: '即可粘贴并立即解析。',
      replace:
        '会替换输入框中的全部现有内容；输入框已聚焦时，则遵循常规编辑逻辑：在光标处插入，或替换选中内容。',
      resize:
        'JSON 输入框占用太多空间？拖拽分隔线调整高度，或按',
      subtree:
        '想单独查看某个子树？右键点击它并选择“在独立视图中查看”。同一个子树可以同时打开多个标签页。',
      longString:
        '想查看超长字符串的完整内容且不被省略？在独立视图中打开它。如果字符串包含 JSON，还可以直接在标签页上切换原始/已解析视图。',
      integration: '查看集成文档',
    },
  );
});

test('Pro Tips punctuation follows the active locale around shortcut badges', async () => {
  const [english, chinese] = await Promise.all([
    readJson('_locales/en/messages.json'),
    readJson('_locales/zh_CN/messages.json'),
  ]);

  assert.deepEqual(
    [
      english.proTipThen.message,
      english.proTipQuestionMark.message,
      english.proTipPeriod.message,
    ],
    [', followed by', '?', '.'],
  );
  assert.deepEqual(
    [
      chinese.proTipThen.message,
      chinese.proTipQuestionMark.message,
      chinese.proTipPeriod.message,
    ],
    ['，再按', '？', '。'],
  );
});

test('manifest and product source reference only cataloged message keys', async () => {
  const [manifest, english, ...sources] = await Promise.all([
    readJson('manifest.json'),
    readJson('_locales/en/messages.json'),
    readFile(new URL('src/background.js', ROOT), 'utf8'),
    readFile(new URL('src/core/i18n.js', ROOT), 'utf8'),
    readFile(new URL('src/viewer.js', ROOT), 'utf8'),
    readFile(new URL('src/ui/viewerApp.js', ROOT), 'utf8'),
  ]);
  const referencedKeys = new Set();
  const manifestText = JSON.stringify(manifest);

  for (const match of manifestText.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) {
    referencedKeys.add(match[1]);
  }
  for (const source of sources) {
    for (const match of source.matchAll(/translate\(\s*['"]([A-Za-z0-9_]+)['"]/g)) {
      referencedKeys.add(match[1]);
    }
    for (const match of source.matchAll(/data-i18n(?:-[a-z-]+)?="([A-Za-z0-9_]+)"/g)) {
      referencedKeys.add(match[1]);
    }
  }

  assert.equal(manifest.default_locale, 'en');
  assert.deepEqual(
    [...referencedKeys].filter((key) => !english[key]),
    [],
    'every source message key must exist in the default locale',
  );
});

test('translation falls back to source copy and forwards Chrome substitutions', () => {
  const previousChrome = globalThis.chrome;
  delete globalThis.chrome;
  assert.equal(translate('missing', 'Fallback'), 'Fallback');

  const calls = [];
  globalThis.chrome = {
    i18n: {
      getMessage(key, substitutions) {
        calls.push({ key, substitutions });
        return key === 'greeting' ? '你好，Codex' : '';
      },
    },
  };

  try {
    assert.equal(translate('greeting', 'Hello, Codex', 'Codex'), '你好，Codex');
    assert.equal(translate('missing', 'Fallback'), 'Fallback');
    assert.deepEqual(calls[0], {
      key: 'greeting',
      substitutions: ['Codex'],
    });
  } finally {
    if (previousChrome === undefined) {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = previousChrome;
    }
  }
});

test('document localization follows the Chrome UI language', () => {
  const previousChrome = globalThis.chrome;
  globalThis.chrome = {
    i18n: {
      getUILanguage: () => 'zh-CN',
      getMessage: (key) => (key === 'appName' ? 'AZ JSON Explorer' : ''),
    },
  };
  const document = {
    documentElement: { lang: 'en' },
    title: 'AZ JSON Explorer',
  };

  try {
    localizeDocument(document);
    assert.equal(document.documentElement.lang, 'zh-CN');
    assert.equal(document.title, 'AZ JSON Explorer');
  } finally {
    if (previousChrome === undefined) {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = previousChrome;
    }
  }
});

test('changelog links follow the locale selected by Chrome i18n', () => {
  const previousChrome = globalThis.chrome;
  globalThis.chrome = {
    i18n: {
      getMessage: (key) => (key === 'documentationLocale' ? 'zh-CN' : ''),
    },
  };

  try {
    assert.equal(
      getLocalizedChangelogUrl(),
      'https://github.com/zcfan/az-json-explorer/blob/main/CHANGELOG.zh-CN.md',
    );
    globalThis.chrome.i18n.getMessage = (key) =>
      key === 'documentationLocale' ? 'en' : '';
    assert.equal(
      getLocalizedChangelogUrl(),
      'https://github.com/zcfan/az-json-explorer/blob/main/CHANGELOG.md',
    );
  } finally {
    if (previousChrome === undefined) {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = previousChrome;
    }
  }
});

test('integration guide links follow the locale selected by Chrome i18n', () => {
  const previousChrome = globalThis.chrome;
  globalThis.chrome = {
    i18n: {
      getMessage: (key) => (key === 'documentationLocale' ? 'zh-CN' : ''),
    },
  };

  try {
    assert.equal(
      getLocalizedIntegrationGuideUrl(),
      'https://github.com/zcfan/az-json-explorer/blob/main/docs/integrations/open-in-az-json-explorer.zh-CN.md',
    );
    globalThis.chrome.i18n.getMessage = (key) =>
      key === 'documentationLocale' ? 'en' : '';
    assert.equal(
      getLocalizedIntegrationGuideUrl(),
      'https://github.com/zcfan/az-json-explorer/blob/main/docs/integrations/open-in-az-json-explorer.md',
    );
  } finally {
    if (previousChrome === undefined) {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = previousChrome;
    }
  }
});

test('English and Chinese repository documents link to each other and stay version-aligned', async () => {
  const [readmeEn, readmeZh, changelogEn, changelogZh] = await Promise.all([
    readFile(new URL('README.md', ROOT), 'utf8'),
    readFile(new URL('README.zh-CN.md', ROOT), 'utf8'),
    readFile(new URL('CHANGELOG.md', ROOT), 'utf8'),
    readFile(new URL('CHANGELOG.zh-CN.md', ROOT), 'utf8'),
  ]);

  assert.ok(readmeEn.startsWith('[简体中文](README.zh-CN.md)'));
  assert.ok(readmeZh.startsWith('[English](README.md)'));
  assert.ok(changelogEn.startsWith('[简体中文](CHANGELOG.zh-CN.md)'));
  assert.ok(changelogZh.startsWith('[English](CHANGELOG.md)'));

  const readmeAssets = [
    'store-assets/promo-marquee-1400x560.png',
    'store-assets/screenshot-1-isolated-view-context-menu-1280x800.png',
    'store-assets/screenshot-2-isolated-view-raw-1280x800.png',
    'store-assets/screenshot-3-isolated-view-parsed-1280x800.png',
  ];
  for (const asset of readmeAssets) {
    assert.match(readmeEn, new RegExp(asset.replaceAll('.', '\\.')));
    assert.match(readmeZh, new RegExp(asset.replaceAll('.', '\\.')));
  }

  const versionPattern = /^## (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2})$/gm;
  assert.deepEqual(
    [...changelogZh.matchAll(versionPattern)].map((match) => match[0]),
    [...changelogEn.matchAll(versionPattern)].map((match) => match[0]),
  );
});

test('static UI localization updates text and accessibility attributes', () => {
  const previousChrome = globalThis.chrome;
  globalThis.chrome = {
    i18n: {
      getMessage: (key) => ({
        help: '帮助',
        closeHistory: '关闭历史记录',
      })[key] || '',
    },
  };
  const elements = [
    {
      attributes: new Map([['data-i18n', 'help']]),
      textContent: 'Help',
    },
    {
      attributes: new Map([
        ['data-i18n-aria-label', 'closeHistory'],
        ['aria-label', 'Close history'],
      ]),
      textContent: '',
    },
  ];
  for (const element of elements) {
    element.getAttribute = (name) => element.attributes.get(name) ?? null;
    element.setAttribute = (name, value) => element.attributes.set(name, value);
  }
  const root = {
    querySelectorAll(selector) {
      const attribute = selector.slice(1, -1);
      return elements.filter((element) => element.attributes.has(attribute));
    },
  };

  try {
    localizeUi(root);
    assert.equal(elements[0].textContent, '帮助');
    assert.equal(elements[1].attributes.get('aria-label'), '关闭历史记录');
  } finally {
    if (previousChrome === undefined) {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = previousChrome;
    }
  }
});

test('Chrome Web Store packages include locale resources', async () => {
  const releaseScript = await readFile(
    new URL('scripts/release-chrome-web-store.mjs', ROOT),
    'utf8',
  );

  assert.match(
    releaseScript,
    /artifactRelativePath,[\s\S]*'manifest\.json',[\s\S]*'_locales',[\s\S]*'assets',[\s\S]*'src'/,
  );
});
