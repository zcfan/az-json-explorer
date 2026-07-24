import assert from 'node:assert/strict';
import test from 'node:test';

import { ParseCache } from '../src/core/parseCache.js';
import {
  collectVisibleRows,
  getChildNodes,
  getNodeKind,
  pathKey,
} from '../src/core/treeModel.js';

test('classifies JSON value kinds', () => {
  assert.equal(getNodeKind(null), 'null');
  assert.equal(getNodeKind([]), 'array');
  assert.equal(getNodeKind({}), 'object');
  assert.equal(getNodeKind('x'), 'string');
  assert.equal(getNodeKind(1), 'number');
  assert.equal(getNodeKind(false), 'boolean');
});

test('returns child nodes with stable paths for objects and arrays', () => {
  const value = { users: [{ name: 'Ada' }], active: true };

  assert.deepEqual(
    getChildNodes(value).map((child) => ({
      key: child.key,
      path: child.path,
      kind: child.kind,
    })),
    [
      { key: 'users', path: ['users'], kind: 'array' },
      { key: 'active', path: ['active'], kind: 'boolean' },
    ],
  );

  assert.deepEqual(getChildNodes(value.users)[0].path, [0]);
});

test('collects only visible rows based on expansion state', async () => {
  const value = { users: [{ name: 'Ada' }, { name: 'Grace' }], meta: { count: 2 } };
  const expandedKeys = new Set([pathKey([]), pathKey(['users'])]);

  const rows = await collectVisibleRows(value, { expandedKeys, yieldEvery: 2 });

  assert.deepEqual(
    rows.map((row) => [row.depth, row.key, row.kind, row.expandable, row.expanded]),
    [
      [0, '$', 'object', true, true],
      [1, 'users', 'array', true, true],
      [2, 0, 'object', true, false],
      [2, 1, 'object', true, false],
      [1, 'meta', 'object', true, false],
    ],
  );
});

test('collects an isolated subtree while preserving canonical paths', async () => {
  const value = { users: [{ name: 'Ada' }, { name: 'Grace' }], active: true };
  const isolatedRoot = value.users;
  const rootPath = ['users'];
  const rows = await collectVisibleRows(isolatedRoot, {
    rootPath,
    expandedKeys: new Set([pathKey(rootPath)]),
  });

  assert.deepEqual(
    rows.map((row) => [row.depth, row.key, row.path, row.pathKey]),
    [
      [0, '$', ['users'], pathKey(['users'])],
      [1, 0, ['users', 0], pathKey(['users', 0])],
      [1, 1, ['users', 1], pathKey(['users', 1])],
    ],
  );
});

test('uses cached parsed string as expandable children without losing raw string row', async () => {
  const value = { payload: '{"items":[1,2]}' };
  const cache = new ParseCache();
  cache.storeParsed(['payload'], value.payload, { items: [1, 2] });

  const rows = await collectVisibleRows(value, {
    expandedKeys: new Set([pathKey([]), pathKey(['payload'])]),
    parseCache: cache,
  });

  assert.deepEqual(
    rows.map((row) => ({
      key: row.key,
      kind: row.kind,
      parsed: row.parsed,
      expandable: row.expandable,
    })),
    [
      { key: '$', kind: 'object', parsed: false, expandable: true },
      { key: 'payload', kind: 'string', parsed: true, expandable: true },
      { key: 'items', kind: 'array', parsed: false, expandable: true },
    ],
  );
});

test('caps visible row collection to protect rendering work', async () => {
  const value = { records: Array.from({ length: 1000 }, (_, index) => ({ id: index })) };
  const rows = await collectVisibleRows(value, {
    expandedKeys: new Set([pathKey([]), pathKey(['records'])]),
    maxRows: 25,
    yieldEvery: 5,
  });

  assert.equal(rows.length, 25);
  assert.equal(rows[0].key, '$');
  assert.equal(rows[1].key, 'records');
});

test('all mode expands every container except collapsed path exceptions', async () => {
  const value = {
    open: { deep: { value: 1 } },
    closed: { hidden: 2 },
  };

  const rows = await collectVisibleRows(value, {
    expansionMode: 'all',
    collapsedKeys: new Set([pathKey(['closed'])]),
  });

  assert.deepEqual(
    rows.map((row) => [row.pathKey, row.expanded]),
    [
      [pathKey([]), true],
      [pathKey(['open']), true],
      [pathKey(['open', 'deep']), true],
      [pathKey(['open', 'deep', 'value']), false],
      [pathKey(['closed']), false],
    ],
  );
});

test('all mode expands parsed string containers without parsing raw strings', async () => {
  const value = {
    parsed: '{"items":[1]}',
    raw: '{"hidden":true}',
  };
  const cache = new ParseCache();
  cache.storeParsed(['parsed'], value.parsed, { items: [1] });

  const rows = await collectVisibleRows(value, {
    expansionMode: 'all',
    parseCache: cache,
  });

  assert.deepEqual(
    rows.map((row) => [row.pathKey, row.expandable, row.expanded]),
    [
      [pathKey([]), true, true],
      [pathKey(['parsed']), true, true],
      [pathKey(['parsed', 'items']), true, true],
      [pathKey(['parsed', 'items', 0]), false, false],
      [pathKey(['raw']), false, false],
    ],
  );
});

test('recursive roots expand only their subtree in explicit mode', async () => {
  const value = {
    open: { deep: { value: 1 } },
    closed: { hidden: 2 },
  };

  const rows = await collectVisibleRows(value, {
    expandedKeys: new Set([pathKey([])]),
    recursiveExpandedKeys: new Set([pathKey(['open'])]),
  });

  assert.deepEqual(
    rows.map((row) => [row.pathKey, row.expanded, row.recursivelyExpanded]),
    [
      [pathKey([]), true, false],
      [pathKey(['open']), true, true],
      [pathKey(['open', 'deep']), true, true],
      [pathKey(['open', 'deep', 'value']), false, true],
      [pathKey(['closed']), false, false],
    ],
  );
});
