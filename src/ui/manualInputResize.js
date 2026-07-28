export const MANUAL_INPUT_DRAG_THRESHOLD = 3;
export const MIN_MANUAL_INPUT_HEIGHT = 92;
export const MAX_MANUAL_INPUT_VIEWPORT_RATIO = 0.3;

export function hasExceededManualInputDragThreshold({
  startClientY,
  clientY,
}) {
  return Math.abs(clientY - startClientY) > MANUAL_INPUT_DRAG_THRESHOLD;
}

export function resizeManualInputHeight({
  startHeight,
  startClientY,
  clientY,
  viewportHeight,
}) {
  const maximum = Number.isFinite(viewportHeight)
    ? Math.max(
        MIN_MANUAL_INPUT_HEIGHT,
        viewportHeight * MAX_MANUAL_INPUT_VIEWPORT_RATIO,
      )
    : Number.POSITIVE_INFINITY;
  return Math.min(maximum, Math.max(
    MIN_MANUAL_INPUT_HEIGHT,
    startHeight + clientY - startClientY,
  ));
}

export function shouldToggleManualInputAfterPointerGesture({ dragging }) {
  return !dragging;
}
