import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasExceededManualInputDragThreshold,
  resizeManualInputHeight,
  shouldToggleManualInputAfterPointerGesture,
} from '../src/ui/manualInputResize.js';

test('manual input drag starts only beyond 5px and resizes vertically', () => {
  assert.equal(
    hasExceededManualInputDragThreshold({
      startClientX: 10,
      startClientY: 10,
      clientX: 13,
      clientY: 14,
    }),
    false,
  );
  assert.equal(
    hasExceededManualInputDragThreshold({
      startClientX: 10,
      startClientY: 10,
      clientX: 14,
      clientY: 14,
    }),
    true,
  );

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

test('only an undragged press on the toggle text changes input visibility', () => {
  assert.equal(
    shouldToggleManualInputAfterPointerGesture({
      startedOnToggle: true,
      dragging: false,
    }),
    true,
  );
  assert.equal(
    shouldToggleManualInputAfterPointerGesture({
      startedOnToggle: false,
      dragging: false,
    }),
    false,
  );
  assert.equal(
    shouldToggleManualInputAfterPointerGesture({
      startedOnToggle: true,
      dragging: true,
    }),
    false,
  );
});
