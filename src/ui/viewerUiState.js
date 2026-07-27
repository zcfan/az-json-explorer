import {
  MAX_HISTORY_PANEL_WIDTH,
  MIN_HISTORY_PANEL_WIDTH,
} from './historyPanelResize.js';
import { MIN_MANUAL_INPUT_HEIGHT } from './manualInputResize.js';

export const VIEWER_UI_STATE_STORAGE_KEY = 'json-tools.viewer-ui-state';

export const DEFAULT_VIEWER_UI_STATE = Object.freeze({
  historyPanelOpen: false,
  historyPanelWidth: 320,
  manualInputHeight: 300,
});

function clampFiniteNumber(value, minimum, maximum, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeViewerUiState(state) {
  return {
    historyPanelOpen: state?.historyPanelOpen === true,
    historyPanelWidth: clampFiniteNumber(
      state?.historyPanelWidth,
      MIN_HISTORY_PANEL_WIDTH,
      MAX_HISTORY_PANEL_WIDTH,
      DEFAULT_VIEWER_UI_STATE.historyPanelWidth,
    ),
    manualInputHeight: clampFiniteNumber(
      state?.manualInputHeight,
      MIN_MANUAL_INPUT_HEIGHT,
      Number.MAX_SAFE_INTEGER,
      DEFAULT_VIEWER_UI_STATE.manualInputHeight,
    ),
  };
}

export function loadViewerUiState(storage) {
  try {
    const serialized = storage?.getItem(VIEWER_UI_STATE_STORAGE_KEY);
    if (!serialized) {
      return { ...DEFAULT_VIEWER_UI_STATE };
    }
    return normalizeViewerUiState(JSON.parse(serialized));
  } catch {
    return { ...DEFAULT_VIEWER_UI_STATE };
  }
}

export function saveViewerUiState(storage, state) {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(
      VIEWER_UI_STATE_STORAGE_KEY,
      JSON.stringify(normalizeViewerUiState(state)),
    );
    return true;
  } catch {
    return false;
  }
}
