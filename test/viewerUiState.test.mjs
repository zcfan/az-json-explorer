import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VIEWER_UI_STATE_STORAGE_KEY,
  loadViewerUiState,
  saveViewerUiState,
} from '../src/ui/viewerUiState.js';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test('viewer UI state preserves history visibility, widths, and input height', () => {
  const storage = createStorage();
  const state = {
    historyPanelOpen: true,
    historyPanelWidth: 460,
    manualInputHeight: 380,
  };

  assert.equal(saveViewerUiState(storage, state), true);
  assert.equal(
    storage.getItem(VIEWER_UI_STATE_STORAGE_KEY),
    JSON.stringify(state),
  );
  assert.deepEqual(loadViewerUiState(storage), state);
});

test('viewer UI state rejects malformed values and unavailable storage', () => {
  const malformedStorage = createStorage();
  malformedStorage.setItem(VIEWER_UI_STATE_STORAGE_KEY, '{broken');
  assert.deepEqual(loadViewerUiState(malformedStorage), {
    historyPanelOpen: false,
    historyPanelWidth: 320,
    manualInputHeight: 300,
  });

  const invalidStorage = createStorage();
  invalidStorage.setItem(
    VIEWER_UI_STATE_STORAGE_KEY,
    JSON.stringify({
      historyPanelOpen: 'yes',
      historyPanelWidth: 900,
      manualInputHeight: 20,
    }),
  );
  assert.deepEqual(loadViewerUiState(invalidStorage), {
    historyPanelOpen: false,
    historyPanelWidth: 720,
    manualInputHeight: 92,
  });

  const blockedStorage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  assert.deepEqual(loadViewerUiState(blockedStorage), {
    historyPanelOpen: false,
    historyPanelWidth: 320,
    manualInputHeight: 300,
  });
  assert.equal(
    saveViewerUiState(blockedStorage, {
      historyPanelOpen: true,
      historyPanelWidth: 400,
      manualInputHeight: 400,
    }),
    false,
  );
});
