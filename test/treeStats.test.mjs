import assert from 'node:assert/strict';
import test from 'node:test';

import { countJsonNodesUpTo } from '../src/core/treeStats.js';

test('counts the rows that a fully expanded JSON tree would produce', () => {
  assert.deepEqual(countJsonNodesUpTo({ users: [{ name: 'Ada' }], active: true }, 10), {
    count: 5,
    truncated: false,
  });
});

test('stops counting as soon as the expanded row budget is exceeded', () => {
  const value = { records: Array.from({ length: 100_000 }, (_, id) => ({ id })) };

  assert.deepEqual(countJsonNodesUpTo(value, 5_000), {
    count: 5_000,
    truncated: true,
  });
});

test('treats a tree exactly at the budget as safe to expand', () => {
  assert.deepEqual(countJsonNodesUpTo([1, 2, 3], 4), {
    count: 4,
    truncated: false,
  });
});
