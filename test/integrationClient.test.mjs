import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AZ_JSON_EXPLORER_STORE_URL,
  AZ_JSON_EXPLORER_WEB_STORE_ID,
  createAzJsonExplorerClient,
} from '../integrations/az-json-explorer-client.js';

function createSuccessResponse(request, result) {
  return {
    channel: request.channel,
    version: request.version,
    requestId: request.requestId,
    ok: true,
    result,
  };
}

test('the client helper opens a JSON value from another extension', async () => {
  const calls = [];
  const runtime = {
    id: 'caller-extension',
    async sendMessage(extensionId, request) {
      calls.push({ extensionId, request });
      return createSuccessResponse(request, { opened: true });
    },
  };
  const client = createAzJsonExplorerClient(
    {},
    {
      runtime,
      randomUUID: () => 'request-1',
    },
  );

  await client.open({ orderId: 123 }, { sourceLabel: 'Order #123' });

  assert.equal(calls[0].extensionId, AZ_JSON_EXPLORER_WEB_STORE_ID);
  assert.deepEqual(calls[0].request, {
    channel: 'az-json-explorer',
    version: 1,
    requestId: 'request-1',
    type: 'open',
    jsonText: '{"orderId":123}',
    sourceLabel: 'Order #123',
  });
});

test('the same client helper discovers and opens from a regular webpage', async () => {
  const listeners = new Set();
  const requests = [];
  const windowObject = {
    location: { origin: 'https://example.com' },
    addEventListener(type, listener) {
      if (type === 'message') listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'message') listeners.delete(listener);
    },
    postMessage(request, targetOrigin) {
      requests.push({ request, targetOrigin });
      const result = request.type === 'ping' ? { available: true } : { opened: true };
      queueMicrotask(() => {
        for (const listener of listeners) {
          listener({
            source: windowObject,
            data: createSuccessResponse(request, result),
          });
        }
      });
    },
  };
  const requestIds = ['ping-web-1', 'open-web-1'];
  const client = createAzJsonExplorerClient(
    {},
    {
      runtime: undefined,
      windowObject,
      randomUUID: () => requestIds.shift(),
    },
  );

  assert.equal(await client.isAvailable(), true);
  await client.openText('[1,2,3]', { sourceLabel: 'Page data' });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].targetOrigin, 'https://example.com');
  assert.equal(requests[1].request.jsonText, '[1,2,3]');
  assert.equal(requests[1].request.sourceLabel, 'Page data');
});

test('the client helper rejects values that are not JSON serializable', async () => {
  const client = createAzJsonExplorerClient(
    {},
    { runtime: { id: 'caller', sendMessage: async () => assert.fail('must not send') } },
  );
  const circular = {};
  circular.self = circular;

  await assert.rejects(client.open(circular), (error) => error.code === 'INVALID_REQUEST');
});

test('the client helper does not impose an explicit JSON text size limit', async () => {
  let sentLength = 0;
  const client = createAzJsonExplorerClient(
    {},
    {
      runtime: {
        id: 'caller',
        async sendMessage(extensionId, request) {
          sentLength = request.jsonText.length;
          return createSuccessResponse(request, { opened: true });
        },
      },
    },
  );
  const largeJsonText = 'a'.repeat(8 * 1024 * 1024 + 1);

  await client.openText(largeJsonText);

  assert.equal(sentLength, largeJsonText.length);
});

test('protocol errors are exposed through the helper error code', async () => {
  const client = createAzJsonExplorerClient(
    {},
    {
      runtime: {
        id: 'caller',
        async sendMessage(extensionId, request) {
          return {
            channel: request.channel,
            version: request.version,
            requestId: request.requestId,
            ok: false,
            error: {
              code: 'USER_GESTURE_REQUIRED',
              message: 'Open from a click.',
            },
          };
        },
      },
    },
  );

  await assert.rejects(
    client.openText('{}'),
    (error) => error.code === 'USER_GESTURE_REQUIRED' && /click/.test(error.message),
  );
});

test('the helper rejects responses that do not match its request id', async () => {
  const client = createAzJsonExplorerClient(
    {},
    {
      runtime: {
        id: 'caller',
        async sendMessage(extensionId, request) {
          return createSuccessResponse({ ...request, requestId: 'another-request' }, {
            opened: true,
          });
        },
      },
      randomUUID: () => 'expected-request',
    },
  );

  await assert.rejects(
    client.openText('{}'),
    (error) => error.code === 'NOT_AVAILABLE' && /response/.test(error.message),
  );
});

test('webpage open waits for the full viewer handoff window', async () => {
  const delays = [];
  const listeners = new Set();
  const windowObject = {
    location: { origin: 'https://example.com' },
    addEventListener(type, listener) {
      if (type === 'message') listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'message') listeners.delete(listener);
    },
    postMessage(request) {
      queueMicrotask(() => {
        for (const listener of listeners) {
          listener({
            source: windowObject,
            data: createSuccessResponse(request, { opened: true }),
          });
        }
      });
    },
  };
  const client = createAzJsonExplorerClient(
    {},
    {
      runtime: undefined,
      windowObject,
      randomUUID: () => 'slow-page-open',
      setTimeoutFn(callback, delay) {
        delays.push(delay);
        return callback;
      },
      clearTimeoutFn() {},
    },
  );

  await client.openText('{}');

  assert.deepEqual(delays, [11_000]);
});

test('extension installation checks return false after one second', async () => {
  const timers = [];
  const client = createAzJsonExplorerClient(
    {},
    {
      runtime: {
        id: 'caller',
        sendMessage: async () => new Promise(() => {}),
      },
      randomUUID: () => 'extension-ping-timeout',
      setTimeoutFn(callback, delay) {
        timers.push({ callback, delay });
        return callback;
      },
      clearTimeoutFn() {},
    },
  );

  const availability = client.isAvailable();
  assert.equal(timers[0].delay, 1_000);
  timers[0].callback();
  assert.equal(await availability, false);
});

test('the helper validates source labels before sending', async () => {
  const client = createAzJsonExplorerClient(
    {},
    {
      runtime: {
        id: 'caller',
        sendMessage: async () => assert.fail('invalid options must not be sent'),
      },
    },
  );

  await assert.rejects(
    client.openText('{}', { sourceLabel: 123 }),
    (error) => error.code === 'INVALID_REQUEST',
  );
});

test('another extension can explicitly open the store page without extra permissions', async () => {
  const createdTabs = [];
  const client = createAzJsonExplorerClient(
    {},
    {
      runtime: { id: 'caller-extension' },
      tabs: {
        async create(options) {
          createdTabs.push(options);
        },
      },
      windowObject: undefined,
    },
  );

  assert.deepEqual(await client.openInstallPage(), {
    opened: true,
    url: AZ_JSON_EXPLORER_STORE_URL,
  });
  assert.deepEqual(createdTabs, [{
    active: true,
    url: AZ_JSON_EXPLORER_STORE_URL,
  }]);
});

test('a webpage can explicitly open the store page from its click handler', async () => {
  const calls = [];
  const openedWindow = { opener: 'calling-page' };
  const client = createAzJsonExplorerClient(
    {},
    {
      runtime: undefined,
      windowObject: {
        open(url, target) {
          calls.push({ url, target });
          return openedWindow;
        },
      },
    },
  );

  await client.openInstallPage();

  assert.deepEqual(calls, [{ url: AZ_JSON_EXPLORER_STORE_URL, target: '_blank' }]);
  assert.equal(openedWindow.opener, null);
});

test('a blocked webpage store popup is reported as OPEN_FAILED', async () => {
  const client = createAzJsonExplorerClient(
    {},
    {
      runtime: undefined,
      windowObject: { open: () => null },
    },
  );

  await assert.rejects(
    client.openInstallPage(),
    (error) => error.code === 'OPEN_FAILED' && /store page/.test(error.message),
  );
});
