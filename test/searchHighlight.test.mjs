import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getRowSearchState,
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
