import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { localizeDocument, localizeUi, translate } from '../src/core/i18n.js';

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

test('manifest and product source reference only cataloged message keys', async () => {
  const [manifest, english, ...sources] = await Promise.all([
    readJson('manifest.json'),
    readJson('_locales/en/messages.json'),
    readFile(new URL('src/background.js', ROOT), 'utf8'),
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
