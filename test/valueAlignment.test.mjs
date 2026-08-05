import assert from 'node:assert/strict';
import test from 'node:test';
import { getForwardGridSpacing } from '../src/ui/valueAlignment.js';

test('moves a value forward to the next global indentation grid line', () => {
  assert.equal(getForwardGridSpacing(53, 48), 43);
  assert.equal(getForwardGridSpacing(95.5, 48), 0.5);
});

test('aligns nearby values while allowing a longer key to advance to a later column', () => {
  const naturalPositions = [53, 60, 79, 103];
  const alignedPositions = naturalPositions.map(
    (position) => position + getForwardGridSpacing(position, 48),
  );

  assert.deepEqual(alignedPositions, [96, 96, 96, 144]);
});

test('keeps values already on a grid line in place despite layout rounding', () => {
  assert.equal(getForwardGridSpacing(96, 48), 0);
  assert.equal(getForwardGridSpacing(96.2, 48), 0);
});

test('ignores invalid grid measurements', () => {
  assert.equal(getForwardGridSpacing(Number.NaN, 24), 0);
  assert.equal(getForwardGridSpacing(53, 0), 0);
});
