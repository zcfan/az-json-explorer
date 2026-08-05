const DEFAULT_SNAP_TOLERANCE = 0.25;

export function getForwardGridSpacing(
  position,
  gridSize,
  tolerance = DEFAULT_SNAP_TOLERANCE,
) {
  if (!Number.isFinite(position) || !Number.isFinite(gridSize) || gridSize <= 0) {
    return 0;
  }

  const nextGridLine = Math.ceil((position - tolerance) / gridSize) * gridSize;
  return Math.max(0, nextGridLine - position);
}
