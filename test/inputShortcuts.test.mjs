import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getParseShortcutLabel,
  getPasteShortcutLabel,
  isParseShortcut,
  isSearchShortcut,
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

test('paste redirects unless its real target is an input or textarea', () => {
  assert.equal(shouldRedirectPaste({ tagName: 'DIV' }), true);
  assert.equal(shouldRedirectPaste({ tagName: 'INPUT' }), false);
  assert.equal(shouldRedirectPaste({ tagName: 'textarea' }), false);
  assert.equal(shouldRedirectPaste(null), true);
});
