import assert from 'node:assert/strict';
import test from 'node:test';

import { formatJsonText } from '../src/core/jsonFormat.js';

test('formats valid JSON text with two-space indentation', () => {
  assert.equal(
    formatJsonText('{"name":"Ada","items":[{"id":1},{"id":2}]}'),
    `{
  "name": "Ada",
  "items": [
    {
      "id": 1
    },
    {
      "id": 2
    }
  ]
}`,
  );
});

test('throws without returning a replacement for invalid JSON text', () => {
  assert.throws(() => formatJsonText('{"name":'), SyntaxError);
});
