import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { pathKey } from '../src/core/path.js';

function runWorkerRequest(message) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
      type: 'module',
    });

    worker.once('message', (response) => {
      worker.terminate().then(() => resolve(response), reject);
    });
    worker.once('error', reject);
    worker.postMessage(message);
  });
}

test('worker parses raw JSON text', async () => {
  const response = await runWorkerRequest({
    id: 'parse-root-1',
    type: 'parse-root',
    text: '{"items":[1,2],"ok":true}',
  });

  assert.equal(response.id, 'parse-root-1');
  assert.equal(response.type, 'parse-root-result');
  assert.equal(response.ok, true);
  assert.equal('value' in response, false);
  assert.deepEqual(response.root, {
    kind: 'object',
    displayValue: '{2 keys}',
    expandable: true,
  });
});

test('worker parses a file-like blob without requiring main-thread text extraction', async () => {
  const response = await runWorkerRequest({
    id: 'parse-root-file-1',
    type: 'parse-root',
    file: new Blob(['{"fromFile":true,"items":[1,2,3]}'], {
      type: 'application/json',
    }),
  });

  assert.equal(response.id, 'parse-root-file-1');
  assert.equal(response.type, 'parse-root-result');
  assert.equal(response.ok, true);
  assert.equal('value' in response, false);
  assert.deepEqual(response.root, {
    kind: 'object',
    displayValue: '{2 keys}',
    expandable: true,
  });
});

test('worker reports parse errors without throwing', async () => {
  const response = await runWorkerRequest({
    id: 'parse-root-2',
    type: 'parse-root',
    text: '{"items":',
  });

  assert.equal(response.id, 'parse-root-2');
  assert.equal(response.type, 'parse-root-result');
  assert.equal(response.ok, false);
  assert.match(response.error, /JSON|Unexpected|position|end/i);
});

test('worker parses nested string values with path echo', async () => {
  const response = await runWorkerRequest({
    id: 'parse-string-1',
    type: 'parse-string',
    path: ['payload'],
    text: '{"nested":[true]}',
  });

  assert.equal(response.id, 'parse-string-1');
  assert.equal(response.type, 'parse-string-result');
  assert.equal(response.ok, true);
  assert.deepEqual(response.path, ['payload']);
  assert.deepEqual(response.value, { nested: [true] });
});

test('worker searches the retained parsed tree after root parsing', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });

  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });

  const parseResponse = await send({
    id: 'parse-root-retained',
    type: 'parse-root',
    text: '{"Project":{"Config":"{\\"DefaultTicketType\\":3}"}}',
  });
  assert.equal(parseResponse.ok, true);

  const searchResponse = await send({
    id: 'search-tree-1',
    type: 'search-tree',
    query: 'defaulttickettype',
    maxResults: 5,
    longStringThreshold: 8,
    stringChunkSize: 10,
  });

  await worker.terminate();

  assert.equal(searchResponse.id, 'search-tree-1');
  assert.equal(searchResponse.type, 'search-tree-result');
  assert.equal(searchResponse.ok, true);
  assert.deepEqual(searchResponse.result.matches[0].path, ['Project', 'Config']);
  assert.equal(searchResponse.result.matches[0].source, 'value');
});

test('worker collects visible row summaries from the retained root without cloning containers', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });

  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });

  const parseResponse = await send({
    id: 'parse-root-for-rows',
    type: 'parse-root',
    text: '{"items":[{"id":1},{"id":2}],"ok":true}',
  });
  assert.equal(parseResponse.ok, true);
  assert.equal('value' in parseResponse, false);

  const rowsResponse = await send({
    id: 'collect-visible-rows-1',
    type: 'collect-visible-rows',
    expandedKeys: [pathKey([]), pathKey(['items'])],
    maxRows: 10,
    parseCacheEntries: [],
  });

  await worker.terminate();

  assert.equal(rowsResponse.id, 'collect-visible-rows-1');
  assert.equal(rowsResponse.type, 'collect-visible-rows-result');
  assert.equal(rowsResponse.ok, true);
  assert.equal(rowsResponse.truncated, false);
  assert.deepEqual(
    rowsResponse.rows.map((row) => [row.depth, row.key, row.kind, row.displayValue]),
    [
      [0, '$', 'object', '{2 keys}'],
      [1, 'items', 'array', '[2 items]'],
      [2, 0, 'object', '{1 keys}'],
      [2, 1, 'object', '{1 keys}'],
      [1, 'ok', 'boolean', 'true'],
    ],
  );
  assert.equal('value' in rowsResponse.rows[0], false);
  assert.equal('effectiveValue' in rowsResponse.rows[0], false);
});

test('worker parses string values inside already parsed string containers', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });

  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });

  let parseResponse;
  let firstParseResponse;
  let secondParseResponse;
  let rowsResponse;

  try {
    parseResponse = await send({
      id: 'parse-root-for-nested-parse',
      type: 'parse-root',
      text: JSON.stringify({
        payload: JSON.stringify({
          items: [
            {
              extra: JSON.stringify({ deep: true }),
            },
          ],
        }),
      }),
    });

    firstParseResponse = await send({
      id: 'parse-payload',
      type: 'parse-string',
      path: ['payload'],
    });

    secondParseResponse = await send({
      id: 'parse-extra',
      type: 'parse-string',
      path: ['payload', 'items', 0, 'extra'],
    });

    rowsResponse = await send({
      id: 'collect-nested-parsed-rows',
      type: 'collect-visible-rows',
      expandedKeys: [
        pathKey([]),
        pathKey(['payload']),
        pathKey(['payload', 'items']),
        pathKey(['payload', 'items', 0]),
        pathKey(['payload', 'items', 0, 'extra']),
      ],
      maxRows: 20,
    });
  } finally {
    await worker.terminate();
  }

  assert.equal(parseResponse.ok, true);
  assert.equal(firstParseResponse.ok, true);
  assert.equal(secondParseResponse.ok, true);

  assert.equal(rowsResponse.ok, true);
  const extraRow = rowsResponse.rows.find(
    (row) => row.pathKey === pathKey(['payload', 'items', 0, 'extra']),
  );
  const deepRow = rowsResponse.rows.find(
    (row) => row.pathKey === pathKey(['payload', 'items', 0, 'extra', 'deep']),
  );

  assert.equal(extraRow.copyPath, 'JSON.parse(root.payload).items[0].extra');
  assert.equal(deepRow.copyPath, 'JSON.parse(JSON.parse(root.payload).items[0].extra).deep');
});
