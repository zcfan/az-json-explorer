import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAllExpansionState,
  createExplicitExpansionState,
  ensureExpanded,
  revealExpansionPaths,
  toggleExpansion,
} from '../src/ui/expansionState.js';

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
