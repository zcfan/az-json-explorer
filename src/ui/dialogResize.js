function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function resizeDialogRect(startRect, edge, options) {
  const { deltaX, deltaY, bounds, minWidth, minHeight } = options;
  const centerX = (startRect.left + startRect.right) / 2;
  const centerY = (startRect.top + startRect.bottom) / 2;
  const startWidth = startRect.right - startRect.left;
  const startHeight = startRect.bottom - startRect.top;
  const maxWidth = Math.max(
    0,
    2 * Math.min(centerX - bounds.left, bounds.right - centerX),
  );
  const maxHeight = Math.max(
    0,
    2 * Math.min(centerY - bounds.top, bounds.bottom - centerY),
  );
  let targetWidth = startWidth;
  let targetHeight = startHeight;

  if (edge.includes('w')) {
    targetWidth = startWidth - 2 * deltaX;
  } else if (edge.includes('e')) {
    targetWidth = startWidth + 2 * deltaX;
  }

  if (edge.includes('n')) {
    targetHeight = startHeight - 2 * deltaY;
  } else if (edge.includes('s')) {
    targetHeight = startHeight + 2 * deltaY;
  }

  const width = clamp(targetWidth, Math.min(minWidth, maxWidth), maxWidth);
  const height = clamp(targetHeight, Math.min(minHeight, maxHeight), maxHeight);
  const left = centerX - width / 2;
  const top = centerY - height / 2;
  const right = centerX + width / 2;
  const bottom = centerY + height / 2;

  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
  };
}
