export const MANUAL_INPUT_DRAG_THRESHOLD = 5;
export const MIN_MANUAL_INPUT_HEIGHT = 92;

export function hasExceededManualInputDragThreshold({
  startClientX,
  startClientY,
  clientX,
  clientY,
}) {
  return Math.hypot(
    clientX - startClientX,
    clientY - startClientY,
  ) > MANUAL_INPUT_DRAG_THRESHOLD;
}

export function resizeManualInputHeight({
  startHeight,
  startClientY,
  clientY,
}) {
  return Math.max(
    MIN_MANUAL_INPUT_HEIGHT,
    startHeight + clientY - startClientY,
  );
}

export function shouldToggleManualInputAfterPointerGesture({
  startedOnToggle,
  dragging,
}) {
  return startedOnToggle && !dragging;
}
