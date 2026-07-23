import test from 'node:test';
import assert from 'node:assert/strict';

import { resizeDialogRect } from '../src/ui/dialogResize.js';

test('right and bottom edges follow the pointer while the dialog center stays fixed', () => {
  const resized = resizeDialogRect(
    {
      left: 340,
      top: 140,
      right: 1260,
      bottom: 860,
    },
    'se',
    {
      deltaX: 100,
      deltaY: 50,
      bounds: { left: 8, top: 8, right: 1592, bottom: 992 },
      minWidth: 360,
      minHeight: 240,
    },
  );

  assert.deepEqual(resized, {
    left: 240,
    top: 90,
    right: 1360,
    bottom: 910,
    width: 1120,
    height: 820,
  });
});

test('left and top edges resize symmetrically and respect viewport and minimum size', () => {
  const moved = resizeDialogRect(
    { left: 340, top: 140, right: 1260, bottom: 860 },
    'nw',
    {
      deltaX: -100,
      deltaY: -50,
      bounds: { left: 8, top: 8, right: 1592, bottom: 992 },
      minWidth: 360,
      minHeight: 240,
    },
  );
  const clamped = resizeDialogRect(
    { left: 340, top: 140, right: 1260, bottom: 860 },
    'nw',
    {
      deltaX: 1000,
      deltaY: 1000,
      bounds: { left: 8, top: 8, right: 1592, bottom: 992 },
      minWidth: 360,
      minHeight: 240,
    },
  );
  const viewportBounded = resizeDialogRect(
    { left: 340, top: 140, right: 1260, bottom: 860 },
    'nw',
    {
      deltaX: -1000,
      deltaY: -1000,
      bounds: { left: 8, top: 8, right: 1592, bottom: 992 },
      minWidth: 360,
      minHeight: 240,
    },
  );

  assert.deepEqual(moved, {
    left: 240,
    top: 90,
    right: 1360,
    bottom: 910,
    width: 1120,
    height: 820,
  });
  assert.equal(clamped.left, 620);
  assert.equal(clamped.top, 380);
  assert.equal(clamped.right, 980);
  assert.equal(clamped.bottom, 620);
  assert.equal(clamped.width, 360);
  assert.equal(clamped.height, 240);
  assert.deepEqual(viewportBounded, {
    left: 8,
    top: 8,
    right: 1592,
    bottom: 992,
    width: 1584,
    height: 984,
  });
});
