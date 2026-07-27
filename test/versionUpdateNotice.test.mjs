import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VERSION_UPDATE_NOTICE_STORAGE_KEY,
  claimVersionUpdateNotice,
} from '../src/core/versionUpdateNotice.js';

function createStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) {
    values.set(VERSION_UPDATE_NOTICE_STORAGE_KEY, initialValue);
  }

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test('claims the update notice once for each extension version', () => {
  const storage = createStorage('0.1.8');

  assert.equal(claimVersionUpdateNotice(storage, '0.1.9'), true);
  assert.equal(claimVersionUpdateNotice(storage, '0.1.9'), false);
  assert.equal(claimVersionUpdateNotice(storage, '0.2.0'), true);
});

test('claims the current version when no prior version was recorded', () => {
  const storage = createStorage();

  assert.equal(claimVersionUpdateNotice(storage, '0.1.9'), true);
  assert.equal(
    storage.getItem(VERSION_UPDATE_NOTICE_STORAGE_KEY),
    '0.1.9',
  );
});

test('does not claim without a storage target or current version', () => {
  assert.equal(claimVersionUpdateNotice(null, '0.1.9'), false);
  assert.equal(claimVersionUpdateNotice(createStorage(), ''), false);
});

test('fails closed when local storage is unavailable', () => {
  const storage = {
    getItem() {
      throw new Error('blocked');
    },
  };

  assert.equal(claimVersionUpdateNotice(storage, '0.1.9'), false);
});
