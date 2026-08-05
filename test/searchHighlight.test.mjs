import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCenteredRowScrollTop,
  getRowSearchState,
  getSearchNavigationIndex,
  splitHighlightedText,
} from '../src/ui/searchHighlight.js';

test('splits matching text into highlighted and plain segments', () => {
  assert.deepEqual(splitHighlightedText('DefaultTicketType and tickettype', 'tickettype'), [
    { text: 'Default', highlighted: false },
    { text: 'TicketType', highlighted: true },
    { text: ' and ', highlighted: false },
    { text: 'tickettype', highlighted: true },
  ]);
});

test('returns a single plain segment when query is empty or missing', () => {
  assert.deepEqual(splitHighlightedText('Config', ''), [
    { text: 'Config', highlighted: false },
  ]);
});

test('marks row highlight state from search result paths and sources', () => {
  const row = { pathKey: '["Project","Config"]' };
  const matches = [
    { pathKey: '["Project","Name"]', source: 'value' },
    { pathKey: '["Project","Config"]', source: 'key' },
    { pathKey: '["Project","Config"]', source: 'value' },
  ];

  assert.deepEqual(getRowSearchState(row, matches, 1), {
    highlighted: true,
    current: true,
    keyMatched: true,
    valueMatched: true,
  });
});

test('search navigation starts at the nearest result in the requested direction', () => {
  assert.equal(getSearchNavigationIndex(-1, 1, 4), 0);
  assert.equal(getSearchNavigationIndex(-1, -1, 4), 3);
  assert.equal(getSearchNavigationIndex(0, -1, 4), 3);
  assert.equal(getSearchNavigationIndex(3, 1, 4), 0);
  assert.equal(getSearchNavigationIndex(0, 0, 4), -1);
  assert.equal(getSearchNavigationIndex(0, 1, 0), -1);
});

test('centers search rows while clamping to document boundaries', () => {
  assert.equal(getCenteredRowScrollTop(0, 18, 180, 100), 0);
  assert.equal(getCenteredRowScrollTop(20, 18, 180, 100), 279);
  assert.equal(getCenteredRowScrollTop(99, 18, 180, 100), 1620);
  assert.equal(getCenteredRowScrollTop(-1, 18, 180, 100), 0);
});
