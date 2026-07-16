import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXTERNAL_LAUNCH_MAX_BYTES,
  createLaunchBroker,
} from '../src/core/externalLaunch.js';

test('callers can discover the external launch protocol without opening a tab', async () => {
  const broker = createLaunchBroker({
    openTab: async () => assert.fail('ping must not open a tab'),
  });

  const response = await broker.handleRequest(
    {
      channel: 'az-json-explorer',
      version: 1,
      requestId: 'ping-1',
      type: 'ping',
    },
    { callerKey: 'page:1' },
  );

  assert.deepEqual(response, {
    channel: 'az-json-explorer',
    version: 1,
    requestId: 'ping-1',
    ok: true,
    result: {
      available: true,
      protocolVersion: 1,
      capabilities: ['open', 'open-text'],
      maxPayloadBytes: EXTERNAL_LAUNCH_MAX_BYTES,
    },
  });
});

test('an open request completes only after one viewer claims its payload', async () => {
  const openedLaunchIds = [];
  const broker = createLaunchBroker({
    createLaunchId: () => 'launch-1',
    openTab: async (launchId) => openedLaunchIds.push(launchId),
  });

  const responsePromise = broker.handleRequest(
    {
      channel: 'az-json-explorer',
      version: 1,
      requestId: 'open-1',
      type: 'open',
      jsonText: '{"ok":true}',
      sourceLabel: 'Order #123',
    },
    { callerKey: 'extension:caller' },
  );

  await Promise.resolve();
  assert.deepEqual(openedLaunchIds, ['launch-1']);
  assert.deepEqual(broker.claim('launch-1'), {
    jsonText: '{"ok":true}',
    sourceLabel: 'Order #123',
  });
  assert.equal(broker.claim('launch-1'), null);
  assert.deepEqual(await responsePromise, {
    channel: 'az-json-explorer',
    version: 1,
    requestId: 'open-1',
    ok: true,
    result: { opened: true },
  });
});

test('unsupported protocol versions are rejected without opening a tab', async () => {
  const broker = createLaunchBroker({
    openTab: async () => assert.fail('invalid requests must not open a tab'),
  });
  const request = {
    channel: 'az-json-explorer',
    version: 2,
    requestId: 'future-1',
    type: 'ping',
  };

  assert.deepEqual(await broker.handleRequest(request, { callerKey: 'page:1' }), {
    channel: 'az-json-explorer',
    version: 2,
    requestId: 'future-1',
    ok: false,
    error: {
      code: 'UNSUPPORTED_VERSION',
      message: 'Unsupported AZ JSON Explorer protocol version.',
    },
  });
});

test('open requests over the public payload limit are rejected before opening a tab', async () => {
  const broker = createLaunchBroker({
    openTab: async () => assert.fail('oversized requests must not open a tab'),
  });
  const request = {
    channel: 'az-json-explorer',
    version: 1,
    requestId: 'large-1',
    type: 'open',
    jsonText: 'a'.repeat(EXTERNAL_LAUNCH_MAX_BYTES + 1),
  };

  const response = await broker.handleRequest(request, { callerKey: 'page:1' });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'PAYLOAD_TOO_LARGE');
});

test('each caller can open at most one viewer per second', async () => {
  let now = 1_000;
  let nextLaunch = 1;
  const broker = createLaunchBroker({
    now: () => now,
    createLaunchId: () => `launch-${nextLaunch++}`,
    openTab: async () => {},
  });
  const request = {
    channel: 'az-json-explorer',
    version: 1,
    requestId: 'open-rate-1',
    type: 'open',
    jsonText: '{}',
  };

  const firstResponse = broker.handleRequest(request, { callerKey: 'extension:caller' });
  await Promise.resolve();
  broker.claim('launch-1');
  assert.equal((await firstResponse).ok, true);

  now = 1_500;
  const secondResponse = await broker.handleRequest(
    { ...request, requestId: 'open-rate-2' },
    { callerKey: 'extension:caller' },
  );
  assert.equal(secondResponse.ok, false);
  assert.equal(secondResponse.error.code, 'RATE_LIMITED');
});

test('unclaimed launch payloads expire with a handoff timeout', async () => {
  let expireLaunch;
  const broker = createLaunchBroker({
    createLaunchId: () => 'launch-timeout',
    openTab: async () => {},
    setTimeoutFn: (callback) => {
      expireLaunch = callback;
      return 1;
    },
    clearTimeoutFn: () => {},
  });
  const responsePromise = broker.handleRequest(
    {
      channel: 'az-json-explorer',
      version: 1,
      requestId: 'timeout-1',
      type: 'open',
      jsonText: '{}',
    },
    { callerKey: 'page:1' },
  );

  await Promise.resolve();
  expireLaunch();
  const response = await responsePromise;
  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'HANDOFF_TIMEOUT');
  assert.equal(broker.claim('launch-timeout'), null);
});

test('tab creation failures are returned and do not leave claimable payloads', async () => {
  const broker = createLaunchBroker({
    createLaunchId: () => 'launch-failed',
    openTab: async () => {
      throw new Error('No browser window');
    },
  });

  const response = await broker.handleRequest(
    {
      channel: 'az-json-explorer',
      version: 1,
      requestId: 'failed-1',
      type: 'open',
      jsonText: '{}',
    },
    { callerKey: 'extension:caller' },
  );

  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'OPEN_FAILED');
  assert.match(response.error.message, /No browser window/);
  assert.equal(broker.claim('launch-failed'), null);
});

test('open requests require a request id and normalize display-only source labels', async () => {
  const broker = createLaunchBroker({
    createLaunchId: () => 'launch-label',
    openTab: async () => {},
  });
  const malformed = await broker.handleRequest({
    channel: 'az-json-explorer',
    version: 1,
    type: 'open',
    jsonText: '{}',
  });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.error.code, 'INVALID_REQUEST');

  const responsePromise = broker.handleRequest(
    {
      channel: 'az-json-explorer',
      version: 1,
      requestId: 'label-1',
      type: 'open',
      jsonText: '{}',
      sourceLabel: `  ${'x'.repeat(240)}  `,
    },
    { callerKey: 'page:label' },
  );
  await Promise.resolve();
  assert.equal(broker.claim('launch-label').sourceLabel, 'x'.repeat(200));
  assert.equal((await responsePromise).ok, true);
});

test('a viewer that claims during tab creation does not leave a timeout behind', async () => {
  let broker;
  let claimedPayload;
  broker = createLaunchBroker({
    createLaunchId: () => 'launch-fast',
    openTab: async (launchId) => {
      claimedPayload = broker.claim(launchId);
    },
    setTimeoutFn: () => assert.fail('a claimed launch must not schedule a timeout'),
  });

  const response = await broker.handleRequest(
    {
      channel: 'az-json-explorer',
      version: 1,
      requestId: 'fast-1',
      type: 'open',
      jsonText: '{"fast":true}',
    },
    { callerKey: 'extension:fast' },
  );

  assert.deepEqual(claimedPayload, {
    jsonText: '{"fast":true}',
    sourceLabel: undefined,
  });
  assert.equal(response.ok, true);
});
