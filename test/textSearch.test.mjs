import assert from 'node:assert/strict';
import test from 'node:test';

import { findTextMatches } from '../src/core/textSearch.js';

test('finds case-insensitive matches across the raw JSON text', async () => {
  const text = JSON.stringify({
    ProjectName: 'Glata',
    config: '{"DefaultTicketType":3}',
  });

  const result = await findTextMatches(text, 'defaulttickettype', {
    chunkSize: 12,
    maxResults: 10,
  });

  assert.equal(result.query, 'defaulttickettype');
  assert.equal(result.truncated, false);
  assert.equal(result.matches.length, 1);
  assert.equal(text.slice(result.matches[0].index, result.matches[0].index + result.matches[0].length), 'DefaultTicketType');
  assert.match(result.matches[0].preview, /DefaultTicketType/);
});

test('finds matches that cross chunk boundaries', async () => {
  const text = `aaaaabcXYZdefzzzz`;

  const result = await findTextMatches(text, 'abcXYZdef', {
    caseSensitive: true,
    chunkSize: 7,
    maxResults: 10,
  });

  assert.deepEqual(
    result.matches.map((match) => ({
      index: match.index,
      length: match.length,
    })),
    [{ index: 4, length: 9 }],
  );
});

test('preserves whitespace in match previews', async () => {
  const text = 'before  \n\t target  after';

  const result = await findTextMatches(text, 'target', {
    caseSensitive: true,
    chunkSize: 8,
    context: 20,
    maxResults: 10,
  });

  assert.equal(result.matches[0].preview, text);
});

test('caps match results and reports truncation', async () => {
  const text = 'hit '.repeat(20);

  const result = await findTextMatches(text, 'hit', {
    chunkSize: 8,
    maxResults: 3,
  });

  assert.equal(result.matches.length, 3);
  assert.equal(result.truncated, true);
});
