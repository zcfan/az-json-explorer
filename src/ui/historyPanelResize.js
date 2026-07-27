export const MIN_HISTORY_PANEL_WIDTH = 240;
export const MAX_HISTORY_PANEL_WIDTH = 720;
export const MIN_VIEWER_WIDTH = 360;

export function resizeHistoryPanelWidth({
  startWidth,
  startClientX,
  clientX,
  viewportWidth,
}) {
  const availableMaximum = Math.max(
    MIN_HISTORY_PANEL_WIDTH,
    viewportWidth - MIN_VIEWER_WIDTH,
  );
  const halfViewportMaximum = Math.max(
    MIN_HISTORY_PANEL_WIDTH,
    viewportWidth / 2,
  );
  const maximum = Math.min(
    MAX_HISTORY_PANEL_WIDTH,
    availableMaximum,
    halfViewportMaximum,
  );
  return Math.max(
    MIN_HISTORY_PANEL_WIDTH,
    Math.min(maximum, startWidth + startClientX - clientX),
  );
}
