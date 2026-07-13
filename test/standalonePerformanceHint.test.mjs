import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dismissStandalonePerformanceHint,
  isStandalonePerformanceHintDismissed,
  STANDALONE_PERFORMANCE_HINT_DISMISSED_KEY,
} from '../src/core/standalonePerformanceHint.js';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test('standalone performance hint is visible until dismissed', () => {
  const storage = createStorage();

  assert.equal(isStandalonePerformanceHintDismissed(storage), false);
  assert.equal(dismissStandalonePerformanceHint(storage), true);
  assert.equal(storage.getItem(STANDALONE_PERFORMANCE_HINT_DISMISSED_KEY), '1');
  assert.equal(isStandalonePerformanceHintDismissed(storage), true);
});

test('standalone performance hint storage failures do not throw', () => {
  const storage = {
    getItem() {
      throw new Error('read blocked');
    },
    setItem() {
      throw new Error('write blocked');
    },
  };

  assert.equal(isStandalonePerformanceHintDismissed(storage), false);
  assert.equal(dismissStandalonePerformanceHint(storage), false);
});
