import assert from 'node:assert/strict';
import test from 'node:test';

import { searchJsonTree } from '../src/core/treeSearch.js';

test('searches keys and primitive values with JSON paths', async () => {
  const value = {
    Project: {
      Config: '{"DefaultTicketType":3}',
      Enabled: true,
      Count: 12,
    },
  };

  const result = await searchJsonTree(value, 'config', {
    longStringThreshold: 20,
    maxResults: 10,
  });

  assert.equal(result.truncated, false);
  assert.deepEqual(
    result.matches.map((match) => ({
      path: match.path,
      kind: match.kind,
      source: match.source,
    })),
    [{ path: ['Project', 'Config'], kind: 'string', source: 'key' }],
  );
  assert.match(result.matches[0].preview, /Config/);
});

test('searches inside long strings with chunk boundaries', async () => {
  const value = {
    payload: `aaaaabcXYZdefzzzz`,
  };

  const result = await searchJsonTree(value, 'abcXYZdef', {
    caseSensitive: true,
    longStringThreshold: 5,
    stringChunkSize: 7,
    maxResults: 10,
  });

  assert.deepEqual(
    result.matches.map((match) => ({
      path: match.path,
      source: match.source,
      valueIndex: match.valueIndex,
    })),
    [{ path: ['payload'], source: 'value', valueIndex: 4 }],
  );
});

test('caps tree search results and reports truncation', async () => {
  const value = {
    records: Array.from({ length: 20 }, (_, index) => ({ name: `hit-${index}` })),
  };

  const result = await searchJsonTree(value, 'hit', {
    maxResults: 3,
  });

  assert.equal(result.matches.length, 3);
  assert.equal(result.truncated, true);
});
