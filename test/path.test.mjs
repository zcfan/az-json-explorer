import assert from 'node:assert/strict';
import test from 'node:test';

import { formatCopyPath, pathKey } from '../src/core/path.js';

function createParsedPathSet(paths) {
  const keys = new Set(paths.map((path) => pathKey(path)));

  return {
    hasParsed(path) {
      return keys.has(pathKey(path));
    },
  };
}

test('formats copy paths as root-based JavaScript property access', () => {
  assert.equal(formatCopyPath([]), 'root');
  assert.equal(formatCopyPath(['user', 'name']), 'root.user.name');
  assert.equal(formatCopyPath(['items', 0, 'id']), 'root.items[0].id');
  assert.equal(formatCopyPath(['bad-key', 'x.y']), 'root["bad-key"]["x.y"]');
});

test('wraps parsed string ancestors when formatting descendant copy paths', () => {
  const parseCache = createParsedPathSet([
    ['payload'],
    ['payload', 'items', 0, 'extra'],
  ]);

  assert.equal(formatCopyPath(['payload'], parseCache), 'root.payload');
  assert.equal(
    formatCopyPath(['payload', 'items', 0, 'extra'], parseCache),
    'JSON.parse(root.payload).items[0].extra',
  );
  assert.equal(
    formatCopyPath(['payload', 'items', 0, 'extra', 'deep'], parseCache),
    'JSON.parse(JSON.parse(root.payload).items[0].extra).deep',
  );
});
