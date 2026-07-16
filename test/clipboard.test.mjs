import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatJavaScriptStringLiteral,
  formatJsonStringLiteral,
  formatValueForClipboard,
} from '../src/core/clipboard.js';

test('formats copied values like the JSON object inspector', () => {
  assert.equal(formatValueForClipboard({ nested: [1, true] }), '{\n  "nested": [\n    1,\n    true\n  ]\n}');
  assert.equal(formatValueForClipboard('plain text'), 'plain text');
  assert.equal(formatValueForClipboard(null), 'null');
});

test('formats distinct JavaScript and JSON string literals', () => {
  const value = `line 1\nIt's "quoted" \\ ${String.fromCharCode(0)}`;

  assert.equal(formatJavaScriptStringLiteral(value), `'line 1\\nIt\\'s "quoted" \\\\ \\x00'`);
  assert.equal(formatJsonStringLiteral(value), `"line 1\\nIt's \\"quoted\\" \\\\ \\u0000"`);
});
