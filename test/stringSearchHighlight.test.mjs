import assert from 'node:assert/strict';
import test from 'node:test';

import { createStringSearchSegments } from '../src/ui/stringSearchHighlight.js';

test('maps full-string search offsets onto the loaded text page and current match', () => {
  const segments = createStringSearchSegments(
    'second hit and hit',
    10,
    [
      { valueIndex: 6, length: 3 },
      { valueIndex: 17, length: 3 },
      { valueIndex: 25, length: 3 },
    ],
    1,
  );

  assert.deepEqual(segments, [
    { text: 'second ', highlighted: false, current: false },
    { text: 'hit', highlighted: true, current: true },
    { text: ' and ', highlighted: false, current: false },
    { text: 'hit', highlighted: true, current: false },
  ]);
});
