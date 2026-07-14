import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAllExpansionState,
  createExplicitExpansionState,
  createInitialExpansionState,
  ensureExpanded,
  revealExpansionPaths,
  toggleExpansion,
} from '../src/ui/expansionState.js';

test('initial expansion opens bounded roots and keeps oversized roots shallow', () => {
  const rootKey = '[]';
  const small = createInitialExpansionState({ count: 5000, truncated: false }, rootKey);
  const large = createInitialExpansionState({ count: 5000, truncated: true }, rootKey);

  assert.equal(small.mode, 'all');
  assert.deepEqual([...small.collapsedKeys], []);
  assert.equal(large.mode, 'explicit');
  assert.deepEqual([...large.expandedKeys], [rootKey]);
});

test('explicit mode tracks only explicitly expanded paths', () => {
  const rootKey = '[]';
  const initial = createExplicitExpansionState([rootKey]);
  const collapsed = toggleExpansion(initial, rootKey);
  const reopened = toggleExpansion(collapsed, rootKey);

  assert.equal(initial.mode, 'explicit');
  assert.deepEqual([...initial.expandedKeys], [rootKey]);
  assert.deepEqual([...initial.collapsedKeys], []);
  assert.deepEqual([...collapsed.expandedKeys], []);
  assert.deepEqual([...reopened.expandedKeys], [rootKey]);
});

test('all mode stores only collapsed exceptions', () => {
  const childKey = '["items"]';
  const initial = createAllExpansionState();
  const collapsed = toggleExpansion(initial, childKey);
  const reopened = ensureExpanded(collapsed, childKey);

  assert.equal(initial.mode, 'all');
  assert.deepEqual([...initial.expandedKeys], []);
  assert.deepEqual([...collapsed.collapsedKeys], [childKey]);
  assert.deepEqual([...reopened.collapsedKeys], []);
});

test('search reveal opens every ancestor in either mode', () => {
  const rootKey = '[]';
  const itemsKey = '["items"]';
  const recordKey = '["items",0]';
  const ancestors = [rootKey, itemsKey, recordKey];

  const explicit = revealExpansionPaths(createExplicitExpansionState(), ancestors);
  const all = revealExpansionPaths(createAllExpansionState(ancestors), ancestors);

  assert.deepEqual([...explicit.expandedKeys], ancestors);
  assert.deepEqual([...all.collapsedKeys], []);
});
