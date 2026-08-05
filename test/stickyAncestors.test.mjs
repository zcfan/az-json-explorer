import assert from 'node:assert/strict';
import test from 'node:test';
import { ParseCache } from '../src/core/parseCache.js';
import { collectVisibleRows } from '../src/core/treeModel.js';
import {
  createParentRowIndexes,
  getStickyAncestorIndexes,
  getStickyViewportAncestorIndexes,
} from '../src/ui/stickyAncestors.js';

test('builds parent indexes from flattened tree depths', () => {
  const rows = [0, 1, 2, 2, 1, 2, 3].map((depth) => ({ depth }));

  assert.deepEqual(Array.from(createParentRowIndexes(rows)), [-1, 0, 1, 1, 0, 4, 5]);
});

test('returns the nearest ten ancestors ordered from outer to inner', () => {
  const rows = Array.from({ length: 13 }, (_, depth) => ({ depth }));
  const parentIndexes = createParentRowIndexes(rows);

  assert.deepEqual(getStickyAncestorIndexes(parentIndexes, 12, 10), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test('promotes parent rows covered by the sticky region into the sticky stack', () => {
  const rows = [0, 1, 2, 3, 4, 4].map((depth) => ({ depth }));
  const parentIndexes = createParentRowIndexes(rows);

  assert.deepEqual(
    getStickyViewportAncestorIndexes(parentIndexes, 18, 18, 10),
    [0, 1, 2, 3],
  );
});

test('promotes the root after the viewport covers three pixels', () => {
  const rows = [0, 1, 1].map((depth) => ({ depth }));
  const parentIndexes = createParentRowIndexes(rows);

  assert.deepEqual(
    getStickyViewportAncestorIndexes(parentIndexes, 2, 18, 10, 3),
    [],
  );
  assert.deepEqual(
    getStickyViewportAncestorIndexes(parentIndexes, 3, 18, 10, 3),
    [0],
  );
});

test('keeps scanning when the next row is only partially visible below sticky rows', () => {
  const rows = [0, 1, 1, 1].map((depth) => ({ depth }));
  const parentIndexes = createParentRowIndexes(rows);

  assert.deepEqual(
    getStickyViewportAncestorIndexes(parentIndexes, 20, 18, 10),
    [0],
  );
});

test('promotes a row only after sticky content covers at least three pixels', () => {
  const rows = [0, 1, 1, 1, 2].map((depth) => ({ depth }));
  const parentIndexes = createParentRowIndexes(rows);

  assert.deepEqual(
    getStickyViewportAncestorIndexes(parentIndexes, 37, 18, 10, 3),
    [0],
  );
  assert.deepEqual(
    getStickyViewportAncestorIndexes(parentIndexes, 39, 18, 10, 3),
    [0, 3],
  );
});

test('keeps the deepest covered chain when a shallower sibling follows it', () => {
  const depths = [
    0,
    1,
    2,
    ...Array(12).fill(3),
    4,
    4,
    5,
    6,
    7,
    8,
    9,
    7,
    7,
    4,
    3,
  ];
  const parentIndexes = createParentRowIndexes(depths.map((depth) => ({ depth })));

  assert.deepEqual(
    getStickyViewportAncestorIndexes(parentIndexes, 251.4, 18, 10, 3),
    [0, 1, 2, 14, 16, 17, 18, 19, 20],
  );
});

test('keeps parsed-string ancestors sticky at the end of the document', async () => {
  const description = JSON.stringify({
    deltas: {
      _deltas: [{ ops: [{ insert: '\n', zoneId: '0', zoneType: 'Z' }] }],
    },
  });
  const value = { body: { Ticket: { Description: description } } };
  const parseCache = new ParseCache();
  parseCache.storeParsed(['body', 'Ticket', 'Description'], description, JSON.parse(description));
  const rows = await collectVisibleRows(value, {
    expansionMode: 'all',
    parseCache,
  });
  const parentIndexes = createParentRowIndexes(rows);
  const stickyIndexes = getStickyViewportAncestorIndexes(
    parentIndexes,
    3,
    18,
    10,
    3,
  );

  assert.deepEqual(
    stickyIndexes.map((index) => rows[index].key),
    ['$', 'body', 'Ticket', 'Description', 'deltas', '_deltas', 0, 'ops', 0],
  );
  assert.equal(rows[stickyIndexes[3]].parsed, true);
});
