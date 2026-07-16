import assert from 'node:assert/strict';
import test from 'node:test';

import { installPageLaunchBridge } from '../src/core/pageLaunchBridge.js';

function createFakeWindow() {
  const listeners = new Map();
  const posted = [];
  const windowObject = {
    location: { origin: 'https://example.com' },
    addEventListener(type, listener) {
      const registered = listeners.get(type) ?? [];
      registered.push(listener);
      listeners.set(type, registered);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== listener));
    },
    postMessage(data, targetOrigin) {
      posted.push({ data, targetOrigin });
    },
    emit(type, event) {
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
  };
  return { windowObject, posted };
}

test('a webpage can discover the extension without a user gesture or extension id', async () => {
  const { windowObject, posted } = createFakeWindow();
  const forwarded = [];
  installPageLaunchBridge({
    windowObject,
    documentObject: { title: 'Example page' },
    sendRequest: async (request) => {
      forwarded.push(request);
      return {
        channel: 'az-json-explorer',
        version: 1,
        requestId: request.requestId,
        ok: true,
        result: { available: true },
      };
    },
  });

  const request = {
    channel: 'az-json-explorer',
    version: 1,
    requestId: 'ping-page-1',
    type: 'ping',
  };
  windowObject.emit('message', {
    source: windowObject,
    origin: 'https://example.com',
    data: request,
  });
  await Promise.resolve();

  assert.deepEqual(forwarded, [request]);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].targetOrigin, 'https://example.com');
  assert.equal(posted[0].data.ok, true);
});

test('a trusted click permits exactly one webpage open request for five seconds', async () => {
  let now = 1_000;
  const { windowObject, posted } = createFakeWindow();
  const forwarded = [];
  installPageLaunchBridge({
    windowObject,
    documentObject: { title: 'Orders' },
    now: () => now,
    sendRequest: async (request) => {
      forwarded.push(request);
      return {
        channel: 'az-json-explorer',
        version: 1,
        requestId: request.requestId,
        ok: true,
        result: { opened: true },
      };
    },
  });
  const openRequest = {
    channel: 'az-json-explorer',
    version: 1,
    requestId: 'open-page-1',
    type: 'open',
    jsonText: '{}',
  };

  windowObject.emit('message', {
    source: windowObject,
    origin: 'https://example.com',
    data: openRequest,
  });
  await Promise.resolve();
  assert.equal(posted.at(-1).data.error.code, 'USER_GESTURE_REQUIRED');
  assert.equal(forwarded.length, 0);

  windowObject.emit('click', { isTrusted: true });
  now = 2_000;
  windowObject.emit('message', {
    source: windowObject,
    origin: 'https://example.com',
    data: openRequest,
  });
  await Promise.resolve();
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].sourceLabel, 'Orders');
  assert.equal(posted.at(-1).data.ok, true);

  windowObject.emit('message', {
    source: windowObject,
    origin: 'https://example.com',
    data: { ...openRequest, requestId: 'open-page-2' },
  });
  await Promise.resolve();
  assert.equal(forwarded.length, 1);
  assert.equal(posted.at(-1).data.error.code, 'USER_GESTURE_REQUIRED');
});

test('bridge failures are returned to the webpage as protocol errors', async () => {
  const { windowObject, posted } = createFakeWindow();
  installPageLaunchBridge({
    windowObject,
    documentObject: { title: 'Example' },
    sendRequest: async () => {
      throw new Error('Extension context invalidated');
    },
  });

  windowObject.emit('message', {
    source: windowObject,
    origin: 'https://example.com',
    data: {
      channel: 'az-json-explorer',
      version: 1,
      requestId: 'ping-failed',
      type: 'ping',
    },
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(posted[0].data.ok, false);
  assert.equal(posted[0].data.error.code, 'NOT_AVAILABLE');
});

test('the webpage bridge rejects unsupported versions before consuming a gesture', async () => {
  const { windowObject, posted } = createFakeWindow();
  installPageLaunchBridge({
    windowObject,
    documentObject: { title: 'Example' },
    sendRequest: async () => assert.fail('unsupported requests must not be forwarded'),
  });

  windowObject.emit('message', {
    source: windowObject,
    origin: 'https://example.com',
    data: {
      channel: 'az-json-explorer',
      version: 2,
      requestId: 'future-page',
      type: 'open',
      jsonText: '{}',
    },
  });
  await Promise.resolve();

  assert.equal(posted[0].data.version, 2);
  assert.equal(posted[0].data.error.code, 'UNSUPPORTED_VERSION');
});
