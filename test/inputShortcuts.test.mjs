import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getParseShortcutLabel,
  getPasteShortcutLabel,
  getSearchNavigationDelta,
  isManualInputToggleShortcut,
  isParseShortcut,
  isSearchShortcut,
  isSelectAllShortcut,
  shouldRedirectPaste,
} from '../src/core/inputShortcuts.js';

test('parse shortcut label follows the current desktop platform', () => {
  assert.equal(getParseShortcutLabel('MacIntel'), 'cmd+enter');
  assert.equal(getParseShortcutLabel('Windows'), 'ctrl+enter');
  assert.equal(getParseShortcutLabel('Linux x86_64'), 'ctrl+enter');
});

test('paste shortcut label follows the current desktop platform', () => {
  assert.equal(getPasteShortcutLabel('MacIntel'), 'cmd+v');
  assert.equal(getPasteShortcutLabel('Windows'), 'ctrl+v');
});

test('parse shortcut requires the platform primary modifier and Enter', () => {
  assert.equal(isParseShortcut({ key: 'Enter', metaKey: true }, 'MacIntel'), true);
  assert.equal(isParseShortcut({ key: 'Enter', ctrlKey: true }, 'MacIntel'), false);
  assert.equal(isParseShortcut({ key: 'Enter', ctrlKey: true }, 'Windows'), true);
  assert.equal(isParseShortcut({ key: 'Enter', metaKey: true }, 'Windows'), false);
  assert.equal(
    isParseShortcut({ key: 'Enter', ctrlKey: true, shiftKey: true }, 'Windows'),
    false,
  );
  assert.equal(isParseShortcut({ key: 'NumpadEnter', ctrlKey: true }, 'Windows'), false);
});

test('search shortcut matches the platform equivalent of browser find', () => {
  assert.equal(isSearchShortcut({ key: 'f', metaKey: true }, 'MacIntel'), true);
  assert.equal(isSearchShortcut({ key: 'F', metaKey: true }, 'MacIntel'), true);
  assert.equal(isSearchShortcut({ key: 'f', ctrlKey: true }, 'MacIntel'), false);
  assert.equal(isSearchShortcut({ key: 'f', ctrlKey: true }, 'Windows'), true);
  assert.equal(isSearchShortcut({ key: 'f', metaKey: true }, 'Windows'), false);
  assert.equal(
    isSearchShortcut({ key: 'f', ctrlKey: true, shiftKey: true }, 'Windows'),
    false,
  );
});

test('select-all shortcut requires the current platform primary modifier', () => {
  assert.equal(isSelectAllShortcut({ key: 'a', metaKey: true }, 'MacIntel'), true);
  assert.equal(isSelectAllShortcut({ key: 'A', metaKey: true }, 'MacIntel'), true);
  assert.equal(isSelectAllShortcut({ key: 'a', ctrlKey: true }, 'MacIntel'), false);
  assert.equal(isSelectAllShortcut({ key: 'a', ctrlKey: true }, 'Windows'), true);
  assert.equal(isSelectAllShortcut({ key: 'a', metaKey: true }, 'Windows'), false);
  assert.equal(
    isSelectAllShortcut({ key: 'a', ctrlKey: true, shiftKey: true }, 'Windows'),
    false,
  );
});

test('manual input toggle shortcut is Ctrl+Backquote on every platform', () => {
  assert.equal(
    isManualInputToggleShortcut({ key: '`', code: 'Backquote', ctrlKey: true }),
    true,
  );
  assert.equal(isManualInputToggleShortcut({ code: 'Backquote', ctrlKey: true }), true);
  assert.equal(
    isManualInputToggleShortcut({ key: '`', code: 'Backquote', metaKey: true }),
    false,
  );
  assert.equal(
    isManualInputToggleShortcut({
      key: '`',
      code: 'Backquote',
      ctrlKey: true,
      shiftKey: true,
    }),
    false,
  );
  assert.equal(
    isManualInputToggleShortcut({
      key: '`',
      code: 'Backquote',
      ctrlKey: true,
      repeat: true,
    }),
    false,
  );
});

test('Enter navigates search results forward and Shift+Enter navigates backward', () => {
  assert.equal(getSearchNavigationDelta({ key: 'Enter' }), 1);
  assert.equal(getSearchNavigationDelta({ key: 'Enter', shiftKey: true }), -1);
  assert.equal(getSearchNavigationDelta({ key: 'Enter', metaKey: true }), 0);
  assert.equal(getSearchNavigationDelta({ key: 'Enter', ctrlKey: true }), 0);
  assert.equal(getSearchNavigationDelta({ key: 'Enter', altKey: true }), 0);
  assert.equal(getSearchNavigationDelta({ key: 'Enter', isComposing: true }), 0);
  assert.equal(getSearchNavigationDelta({ key: 'NumpadEnter' }), 0);
});

test('paste redirects whenever the manual JSON input is not the real target', () => {
  const manualInput = { tagName: 'TEXTAREA' };

  assert.equal(shouldRedirectPaste(manualInput, manualInput), false);
  assert.equal(shouldRedirectPaste({ tagName: 'INPUT' }, manualInput), true);
  assert.equal(shouldRedirectPaste({ tagName: 'TEXTAREA' }, manualInput), true);
  assert.equal(shouldRedirectPaste(null, manualInput), true);
});
