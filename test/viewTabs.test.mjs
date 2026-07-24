import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activateViewTabParsedMode,
  closeViewTab,
  createViewTabsState,
  getIsolationViewType,
  openIsolatedView,
  setViewTabPathMode,
} from '../src/ui/viewTabs.js';

test('the whole-document tab is permanent and hidden-state starts with one tab', () => {
  const state = createViewTabsState();

  assert.deepEqual(state, {
    activeTabId: 'root',
    nextTabId: 1,
    tabs: [
      {
        id: 'root',
        title: '$',
        path: [],
        type: 'tree',
        closable: false,
      },
    ],
  });
  assert.deepEqual(closeViewTab(state, 'root'), state);
});

test('isolation allows containers and strings but rejects view roots and other primitives', () => {
  assert.equal(
    getIsolationViewType({ path: ['object'], effectiveKind: 'object' }, []),
    'tree',
  );
  assert.equal(
    getIsolationViewType({ path: ['array'], effectiveKind: 'array' }, []),
    'tree',
  );
  assert.equal(
    getIsolationViewType({ path: ['text'], effectiveKind: 'string' }, []),
    'string',
  );
  assert.equal(getIsolationViewType({ path: ['count'], effectiveKind: 'number' }, []), null);
  assert.equal(getIsolationViewType({ path: ['ok'], effectiveKind: 'boolean' }, []), null);
  assert.equal(getIsolationViewType({ path: ['none'], effectiveKind: 'null' }, []), null);
  assert.equal(getIsolationViewType({ path: ['scope'], effectiveKind: 'object' }, ['scope']), null);
});

test('opening the same path creates unlimited tabs with numbered duplicate titles', () => {
  const initial = createViewTabsState();
  const row = {
    path: ['records', 3, 'payload'],
    kind: 'string',
    effectiveKind: 'string',
    parsed: false,
    canParseAsJson: true,
    valueLength: 1200,
  };
  const opened = openIsolatedView(initial, row, []);
  const reopened = openIsolatedView(opened, row, []);

  assert.equal(opened.tabs.length, 2);
  assert.equal(reopened.tabs.length, 3);
  assert.equal(reopened.activeTabId, reopened.tabs[2].id);
  assert.deepEqual(opened.tabs[1], {
    id: 'view:1',
    title: '$.records[3].payload',
    path: ['records', 3, 'payload'],
    type: 'string',
    mode: 'raw',
    displayModeOverrides: [
      {
        path: ['records', 3, 'payload'],
        mode: 'raw',
      },
    ],
    closable: true,
    valueLength: 1200,
  });
  assert.equal(reopened.tabs[2].title, '$.records[3].payload (1)');
  assert.equal(reopened.tabs[2].mode, 'raw');
  assert.equal(reopened.nextTabId, 3);
});

test('a parsed JSON string opens as a structured tab with a parsed badge', () => {
  const state = openIsolatedView(
    createViewTabsState(),
    {
      path: ['payload'],
      kind: 'string',
      effectiveKind: 'object',
      parsed: true,
      hasParsed: true,
      valueLength: 80,
    },
    [],
  );

  assert.equal(state.tabs[1].type, 'tree');
  assert.equal(state.tabs[1].mode, 'parsed');
  assert.equal(state.tabs[1].valueLength, 80);
  assert.deepEqual(state.tabs[1].displayModeOverrides, [
    { path: ['payload'], mode: 'parsed' },
  ]);
});

test('raw and parsed switching changes only the targeted isolated tab', () => {
  const row = {
    path: ['payload'],
    kind: 'string',
    effectiveKind: 'string',
    parsedKind: 'object',
    parsed: false,
    hasParsed: true,
    valueLength: 120,
  };
  let state = openIsolatedView(createViewTabsState(), row, []);
  state = openIsolatedView(state, row, []);
  const [firstTab, secondTab] = state.tabs.slice(1);

  const switched = setViewTabPathMode(state, firstTab.id, row.path, 'parsed');

  assert.equal(switched.tabs[1].mode, 'parsed');
  assert.equal(switched.tabs[1].type, 'tree');
  assert.deepEqual(switched.tabs[1].displayModeOverrides, [
    { path: ['payload'], mode: 'parsed' },
  ]);
  assert.equal(switched.tabs[2].id, secondTab.id);
  assert.equal(switched.tabs[2].mode, 'raw');
  assert.equal(switched.tabs[2].type, 'string');
  assert.deepEqual(switched.tabs[2].displayModeOverrides, [
    { path: ['payload'], mode: 'raw' },
  ]);
});

test('an unparsed raw tab can activate its newly cached parsed value', () => {
  const opened = openIsolatedView(
    createViewTabsState(),
    {
      path: ['payload'],
      kind: 'string',
      effectiveKind: 'string',
      parsed: false,
      hasParsed: false,
      canParseAsJson: true,
      valueLength: 120,
    },
    [],
  );

  const activated = activateViewTabParsedMode(opened, opened.activeTabId, 'object');

  assert.equal(activated.tabs[0].id, 'root');
  assert.equal(activated.tabs[1].mode, 'parsed');
  assert.equal(activated.tabs[1].type, 'tree');
  assert.equal(activated.tabs[1].parsedType, 'tree');
  assert.deepEqual(activated.tabs[1].displayModeOverrides, [
    { path: ['payload'], mode: 'parsed' },
  ]);
});

test('a parsed badge inside an isolated tree updates only that tab path', () => {
  let state = openIsolatedView(
    createViewTabsState(),
    {
      path: ['payload'],
      kind: 'string',
      effectiveKind: 'object',
      parsedKind: 'object',
      parsed: true,
      hasParsed: true,
    },
    [],
  );
  const tabId = state.activeTabId;

  state = setViewTabPathMode(state, tabId, ['payload', 'nested'], 'raw');

  assert.equal(state.tabs[1].mode, 'parsed');
  assert.deepEqual(state.tabs[1].displayModeOverrides, [
    { path: ['payload'], mode: 'parsed' },
    { path: ['payload', 'nested'], mode: 'raw' },
  ]);
});

test('a nested isolated tab inherits parsed ancestors from its source tab', () => {
  let state = openIsolatedView(
    createViewTabsState(),
    {
      path: ['payload'],
      kind: 'string',
      effectiveKind: 'object',
      parsed: true,
      hasParsed: true,
    },
    [],
  );
  state = openIsolatedView(
    state,
    {
      path: ['payload', 'nested'],
      kind: 'object',
      effectiveKind: 'object',
    },
    ['payload'],
  );

  assert.deepEqual(state.tabs[2].displayModeOverrides, [
    { path: ['payload'], mode: 'parsed' },
  ]);
});

test('closing the active isolated tab returns to its left neighbor', () => {
  let state = createViewTabsState();
  state = openIsolatedView(
    state,
    { path: ['first'], effectiveKind: 'object' },
    [],
  );
  state = openIsolatedView(
    state,
    { path: ['second'], effectiveKind: 'array' },
    [],
  );

  const closed = closeViewTab(state, state.activeTabId);

  assert.equal(closed.tabs.length, 2);
  assert.equal(closed.activeTabId, closed.tabs[1].id);
  assert.equal(closed.tabs[1].title, '$.first');
});
