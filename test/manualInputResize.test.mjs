import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasExceededManualInputDragThreshold,
  resizeManualInputHeight,
  shouldToggleManualInputAfterPointerGesture,
} from '../src/ui/manualInputResize.js';

test('manual input drag starts only after more than 3px of vertical movement', () => {
  assert.equal(
    hasExceededManualInputDragThreshold({
      startClientX: 10,
      startClientY: 10,
      clientX: 100,
      clientY: 13,
    }),
    false,
  );
  assert.equal(
    hasExceededManualInputDragThreshold({
      startClientX: 10,
      startClientY: 10,
      clientX: 10,
      clientY: 14,
    }),
    true,
  );
});

test('manual input drag resizes vertically', () => {
  assert.equal(
    resizeManualInputHeight({
      startHeight: 300,
      startClientY: 200,
      clientY: 260,
    }),
    360,
  );
  assert.equal(
    resizeManualInputHeight({
      startHeight: 120,
      startClientY: 200,
      clientY: 0,
    }),
    92,
  );
});

test('manual input height never exceeds 30% of the viewport', () => {
  assert.equal(
    resizeManualInputHeight({
      startHeight: 300,
      startClientY: 200,
      clientY: 900,
      viewportHeight: 800,
    }),
    240,
  );
});

test('an undragged press anywhere on the resizer changes input visibility', () => {
  assert.equal(
    shouldToggleManualInputAfterPointerGesture({
      dragging: false,
    }),
    true,
  );
  assert.equal(
    shouldToggleManualInputAfterPointerGesture({
      dragging: true,
    }),
    false,
  );
});
