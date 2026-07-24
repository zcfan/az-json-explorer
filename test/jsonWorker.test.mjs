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

test('worker reports whether a root fits within an expanded-row budget', async () => {
  const withinBudget = await runWorkerRequest({
    id: 'parse-root-within-node-budget',
    type: 'parse-root',
    text: '{"nested":{"value":1}}',
    nodeCountLimit: 3,
  });
  const overBudget = await runWorkerRequest({
    id: 'parse-root-over-node-budget',
    type: 'parse-root',
    text: '{"nested":{"value":1},"tail":2}',
    nodeCountLimit: 3,
  });

  assert.deepEqual(withinBudget.nodeCount, { count: 3, truncated: false });
  assert.deepEqual(overBudget.nodeCount, { count: 3, truncated: true });
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

test('worker records only successful user parses and lists history without source content', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      const onError = (error) => reject(error);
      worker.once('message', (response) => {
        worker.off('error', onError);
        resolve(response);
      });
      worker.once('error', onError);
      worker.postMessage(message);
    });

  try {
    const parsed = await send({
      id: 'history-parse-success',
      type: 'parse-root',
      text: '{"saved":true}',
      historyEntry: {
        sourceType: 'manual',
        title: 'Manual input',
      },
    });
    const failed = await send({
      id: 'history-parse-failure',
      type: 'parse-root',
      text: '{"broken":',
      historyEntry: {
        sourceType: 'manual',
        title: 'Broken input',
      },
    });
    const history = await send({
      id: 'history-list',
      type: 'list-history',
      limit: 20,
    });

    assert.equal(parsed.ok, true);
    assert.equal(typeof parsed.historyId, 'string');
    assert.equal(failed.ok, false);
    assert.equal(history.ok, true);
    assert.equal(history.items.length, 1);
    assert.deepEqual(
      {
        id: history.items[0].id,
        title: history.items[0].title,
        sourceType: history.items[0].sourceType,
        size: history.items[0].size,
        preview: history.items[0].preview,
      },
      {
        id: parsed.historyId,
        title: 'Manual input',
        sourceType: 'manual',
        size: 14,
        preview: '{"saved":true}',
      },
    );
    assert.equal('content' in history.items[0], false);
    assert.equal(history.nextCursor, null);
  } finally {
    await worker.terminate();
  }
});

test('worker restores a saved history session and parsed string cache', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });

  try {
    const parsed = await send({
      id: 'history-session-parse',
      type: 'parse-root',
      text: JSON.stringify({
        payload: '{"needle":true}',
      }),
      historyEntry: {
        sourceType: 'manual',
        title: 'Manual input',
      },
    });
    await send({
      id: 'history-session-parse-string',
      type: 'parse-string',
      path: ['payload'],
      activateDisplay: false,
    });

    const session = {
      version: 1,
      activeTabId: 'view:1',
      nextTabId: 2,
      tabs: [
        {
          id: 'root',
          title: '$',
          path: [],
          type: 'tree',
          closable: false,
          searchQuery: '',
        },
        {
          id: 'view:1',
          title: '$.payload',
          path: ['payload'],
          type: 'tree',
          mode: 'parsed',
          parsedType: 'tree',
          displayModeOverrides: [{ path: ['payload'], mode: 'parsed' }],
          closable: true,
          searchQuery: 'needle',
        },
      ],
    };
    const saved = await send({
      id: 'history-session-save',
      type: 'save-history-session',
      historyId: parsed.historyId,
      session,
    });
    const reopened = await send({
      id: 'history-session-open',
      type: 'open-history',
      historyId: parsed.historyId,
      nodeCountLimit: 100,
    });
    const rows = await send({
      id: 'history-session-rows',
      type: 'collect-visible-rows',
      rootPath: ['payload'],
      rootMode: 'parsed',
      displayModeOverrides: [{ path: ['payload'], mode: 'parsed' }],
      expansionMode: 'all',
      maxRows: 100,
    });

    assert.equal(saved.ok, true);
    assert.equal(reopened.ok, true);
    assert.equal(reopened.historyId, parsed.historyId);
    assert.equal(reopened.title, 'Manual input');
    assert.deepEqual(reopened.session.tabs, session.tabs);
    assert.equal(rows.ok, true);
    assert.deepEqual(
      rows.rows.map((row) => [row.path, row.effectiveKind]),
      [
        [['payload'], 'object'],
        [['payload', 'needle'], 'boolean'],
      ],
    );
  } finally {
    await worker.terminate();
  }
});

test('history reorders only after active-record engagement and cleanup keeps the latest N records', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      const onError = (error) => reject(error);
      worker.once('message', (response) => {
        worker.off('error', onError);
        resolve(response);
      });
      worker.once('error', onError);
      worker.postMessage(message);
    });

  try {
    const created = [];
    for (const title of ['First', 'Second', 'Third']) {
      created.push(
        await send({
          id: `history-order-${title}`,
          type: 'parse-root',
          text: JSON.stringify({ title }),
          historyEntry: {
            sourceType: 'manual',
            title,
          },
        }),
      );
    }

    const initial = await send({
      id: 'history-order-initial',
      type: 'list-history',
      limit: 10,
    });
    assert.deepEqual(
      initial.items.map((item) => item.title),
      ['Third', 'Second', 'First'],
    );

    await send({
      id: 'history-order-reopen-first',
      type: 'open-history',
      historyId: created[0].historyId,
      nodeCountLimit: 10,
    });
    const reordered = await send({
      id: 'history-order-after-open',
      type: 'list-history',
      limit: 10,
    });
    assert.deepEqual(
      reordered.items.map((item) => item.title),
      ['Third', 'Second', 'First'],
    );

    const markedViewed = await send({
      id: 'history-mark-first-viewed',
      type: 'mark-history-viewed',
      historyId: created[0].historyId,
    });
    const reorderedAfterInteraction = await send({
      id: 'history-order-after-interaction',
      type: 'list-history',
      limit: 10,
    });
    assert.equal(markedViewed.ok, true);
    assert.deepEqual(
      reorderedAfterInteraction.items.map((item) => item.title),
      ['First', 'Third', 'Second'],
    );

    const cleaned = await send({
      id: 'history-cleanup',
      type: 'cleanup-history',
      keep: 2,
    });
    const remaining = await send({
      id: 'history-order-after-cleanup',
      type: 'list-history',
      limit: 10,
    });
    const deleted = await send({
      id: 'history-open-deleted',
      type: 'open-history',
      historyId: created[1].historyId,
    });

    assert.equal(cleaned.ok, true);
    assert.equal(cleaned.deletedCount, 1);
    assert.equal(cleaned.activeHistoryRetained, true);
    assert.deepEqual(
      remaining.items.map((item) => item.title),
      ['First', 'Third'],
    );
    assert.equal(deleted.ok, false);
  } finally {
    await worker.terminate();
  }
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

test('worker can cache parsed JSON for an isolated tab without changing the source display', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });

  try {
    await send({
      id: 'parse-root-for-tab-only-parse',
      type: 'parse-root',
      text: JSON.stringify({ payload: '{"nested":true}' }),
    });
    const parseResponse = await send({
      id: 'parse-for-tab-only',
      type: 'parse-string',
      path: ['payload'],
      activateDisplay: false,
    });
    const rowsResponse = await send({
      id: 'collect-source-after-tab-only-parse',
      type: 'collect-visible-rows',
      expandedKeys: [pathKey([])],
      maxRows: 10,
    });

    assert.equal(parseResponse.ok, true);
    assert.equal(parseResponse.displayMode, 'raw');
    assert.equal(parseResponse.parsedKind, 'object');
    const payloadRow = rowsResponse.rows.find((row) => row.pathKey === pathKey(['payload']));
    assert.equal(payloadRow.hasParsed, true);
    assert.equal(payloadRow.parsed, false);
  } finally {
    await worker.terminate();
  }
});

test('an isolated tab parse failure does not add an error to the source row', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });

  try {
    await send({
      id: 'parse-root-for-tab-only-error',
      type: 'parse-root',
      text: JSON.stringify({ payload: '{"nested":}' }),
    });
    const parseResponse = await send({
      id: 'parse-error-for-tab-only',
      type: 'parse-string',
      path: ['payload'],
      activateDisplay: false,
    });
    const rowsResponse = await send({
      id: 'collect-source-after-tab-only-error',
      type: 'collect-visible-rows',
      expandedKeys: [pathKey([])],
      maxRows: 10,
    });

    assert.equal(parseResponse.ok, false);
    const payloadRow = rowsResponse.rows.find((row) => row.pathKey === pathKey(['payload']));
    assert.equal(payloadRow.hasParsed, false);
    assert.equal(payloadRow.parseError, null);
  } finally {
    await worker.terminate();
  }
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

test('worker searches a parsed string subtree instead of its raw string value', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });

  try {
    await send({
      id: 'parse-root-for-parsed-search',
      type: 'parse-root',
      text: JSON.stringify({ payload: JSON.stringify({ nested: { target: 'found' } }) }),
    });
    await send({
      id: 'parse-string-for-parsed-search',
      type: 'parse-string',
      path: ['payload'],
    });

    const response = await send({
      id: 'search-parsed-string-subtree',
      type: 'search-tree',
      query: 'target',
    });

    assert.equal(response.ok, true);
    assert.deepEqual(
      response.result.matches.map((match) => [match.path, match.source]),
      [[['payload', 'nested', 'target'], 'key']],
    );
  } finally {
    await worker.terminate();
  }
});

test('worker searches one retained string and returns offsets with line locations', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });

  try {
    await send({
      id: 'parse-root-for-string-search',
      type: 'parse-root',
      text: JSON.stringify({ message: 'first hit\nsecond hit' }),
    });

    const response = await send({
      id: 'search-string-value',
      type: 'search-string',
      path: ['message'],
      query: 'hit',
      maxResults: 10,
    });

    assert.equal(response.ok, true);
    assert.deepEqual(
      response.result.matches.map((match) => ({
        valueIndex: match.valueIndex,
        lineNumber: match.lineNumber,
        lineStart: match.lineStart,
      })),
      [
        { valueIndex: 6, lineNumber: 1, lineStart: 0 },
        { valueIndex: 17, lineNumber: 2, lineStart: 10 },
      ],
    );
  } finally {
    await worker.terminate();
  }
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

test('worker scopes visible rows and search to an isolated root path', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });

  try {
    await send({
      id: 'parse-root-for-isolated-view',
      type: 'parse-root',
      text: JSON.stringify({
        outside: 'target',
        scope: { inside: 'target', nested: { value: 1 } },
      }),
    });

    const rowsResponse = await send({
      id: 'collect-isolated-rows',
      type: 'collect-visible-rows',
      rootPath: ['scope'],
      expandedKeys: [pathKey(['scope'])],
      maxRows: 10,
    });
    const searchResponse = await send({
      id: 'search-isolated-tree',
      type: 'search-tree',
      rootPath: ['scope'],
      query: 'target',
      maxResults: 10,
    });

    assert.equal(rowsResponse.ok, true);
    assert.deepEqual(
      rowsResponse.rows.map((row) => [row.depth, row.key, row.path]),
      [
        [0, '$', ['scope']],
        [1, 'inside', ['scope', 'inside']],
        [1, 'nested', ['scope', 'nested']],
      ],
    );
    assert.deepEqual(
      searchResponse.result.matches.map((match) => match.path),
      [['scope', 'inside']],
    );
  } finally {
    await worker.terminate();
  }
});

test('a parsed-string tab keeps its parsed root mode after the source row returns to raw', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const payloadText = '{"nested":{"value":1}}';
  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });

  try {
    await send({
      id: 'parse-root-for-mode-snapshot',
      type: 'parse-root',
      text: JSON.stringify({ payload: payloadText }),
    });
    await send({
      id: 'parse-string-for-mode-snapshot',
      type: 'parse-string',
      path: ['payload'],
    });
    await send({
      id: 'return-source-row-to-raw',
      type: 'toggle-parsed-display',
      path: ['payload'],
    });

    const response = await send({
      id: 'collect-parsed-mode-snapshot',
      type: 'collect-visible-rows',
      rootPath: ['payload'],
      rootMode: 'parsed',
      expandedKeys: [pathKey(['payload'])],
      maxRows: 10,
    });

    assert.equal(response.ok, true);
    assert.equal(response.rows[0].parsedKind, 'object');
    assert.equal(response.rows[0].valueLength, payloadText.length);
    assert.deepEqual(
      response.rows.map((row) => [row.key, row.path, row.effectiveKind]),
      [
        ['$', ['payload'], 'object'],
        ['nested', ['payload', 'nested'], 'object'],
      ],
    );
  } finally {
    await worker.terminate();
  }
});

test('an isolated tab keeps parsed ancestor modes needed to resolve its nested path', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });
  const displayModeOverrides = [{ path: ['payload'], mode: 'parsed' }];

  try {
    await send({
      id: 'parse-root-for-nested-tab-snapshot',
      type: 'parse-root',
      text: JSON.stringify({
        payload: JSON.stringify({ nested: { text: 'hello' } }),
      }),
    });
    await send({
      id: 'parse-string-for-nested-tab-snapshot',
      type: 'parse-string',
      path: ['payload'],
    });
    await send({
      id: 'return-nested-tab-source-to-raw',
      type: 'toggle-parsed-display',
      path: ['payload'],
    });

    const rowsResponse = await send({
      id: 'collect-nested-mode-snapshot',
      type: 'collect-visible-rows',
      rootPath: ['payload', 'nested'],
      displayModeOverrides,
      expandedKeys: [pathKey(['payload', 'nested'])],
      maxRows: 10,
    });
    const stringResponse = await send({
      id: 'read-nested-mode-snapshot-string',
      type: 'read-string-range',
      path: ['payload', 'nested', 'text'],
      displayModeOverrides,
      offset: 0,
      length: 100,
    });

    assert.deepEqual(
      rowsResponse.rows.map((row) => [row.key, row.path]),
      [
        ['$', ['payload', 'nested']],
        ['text', ['payload', 'nested', 'text']],
      ],
    );
    assert.equal(stringResponse.text, 'hello');
  } finally {
    await worker.terminate();
  }
});

test('a raw string tab copies the original string after the source row becomes parsed', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });
  const rawValue = JSON.stringify({ nested: true });

  try {
    await send({
      id: 'parse-root-for-raw-tab-copy',
      type: 'parse-root',
      text: JSON.stringify({ payload: rawValue }),
    });
    await send({
      id: 'parse-source-after-raw-tab-opened',
      type: 'parse-string',
      path: ['payload'],
    });
    const response = await send({
      id: 'copy-raw-tab-string',
      type: 'copy-node',
      path: ['payload'],
      format: 'raw-string',
    });

    assert.equal(response.ok, true);
    assert.equal(response.text, rawValue);
  } finally {
    await worker.terminate();
  }
});

test('a parsed string tab reads and copies the effective inner string', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });
  const displayModeOverrides = [{ path: ['payload'], mode: 'parsed' }];

  try {
    await send({
      id: 'parse-root-for-parsed-string-tab',
      type: 'parse-root',
      text: JSON.stringify({ payload: JSON.stringify('inner text') }),
    });
    await send({
      id: 'parse-string-for-parsed-string-tab',
      type: 'parse-string',
      path: ['payload'],
    });

    const rangeResponse = await send({
      id: 'read-parsed-string-tab',
      type: 'read-string-range',
      path: ['payload'],
      displayModeOverrides,
      effective: true,
      offset: 0,
      length: 100,
    });
    const copyResponse = await send({
      id: 'copy-parsed-string-tab',
      type: 'copy-node',
      path: ['payload'],
      displayModeOverrides,
      format: 'value',
    });

    assert.equal(rangeResponse.text, 'inner text');
    assert.equal(copyResponse.text, 'inner text');
  } finally {
    await worker.terminate();
  }
});

test('worker marks truncated string summaries without returning the complete value', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });

  try {
    await send({
      id: 'parse-root-for-long-string-summary',
      type: 'parse-root',
      text: JSON.stringify({
        short: 'kept whole',
        fits: 'y'.repeat(238),
        long: 'x'.repeat(1000),
      }),
    });

    const response = await send({
      id: 'collect-long-string-summary',
      type: 'collect-visible-rows',
      expandedKeys: [pathKey([])],
      maxRows: 10,
    });
    const shortRow = response.rows.find((row) => row.key === 'short');
    const fittingRow = response.rows.find((row) => row.key === 'fits');
    const longRow = response.rows.find((row) => row.key === 'long');

    assert.equal(shortRow.valueTruncated, false);
    assert.equal(shortRow.valueLength, 10);
    assert.equal(fittingRow.valueTruncated, false);
    assert.equal(fittingRow.displayValue.length, 240);
    assert.equal(longRow.valueTruncated, true);
    assert.equal(longRow.valueLength, 1000);
    assert.ok(longRow.displayValue.length <= 240);
    assert.equal('value' in longRow, false);
    assert.equal('text' in longRow, false);
  } finally {
    await worker.terminate();
  }
});

test('worker reads an exact string range by path without normalizing whitespace', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });
  const value = `  alpha  \n${'x'.repeat(20)}😀omega`;

  try {
    await send({
      id: 'parse-root-for-string-range',
      type: 'parse-root',
      text: JSON.stringify({ value }),
    });

    const first = await send({
      id: 'read-string-range-first',
      type: 'read-string-range',
      path: ['value'],
      offset: 0,
      length: 10,
    });
    const second = await send({
      id: 'read-string-range-second',
      type: 'read-string-range',
      path: ['value'],
      offset: first.nextOffset,
      length: 100,
    });

    assert.deepEqual(first, {
      id: 'read-string-range-first',
      type: 'read-string-range-result',
      ok: true,
      path: ['value'],
      text: '  alpha  \n',
      offset: 0,
      nextOffset: 10,
      totalLength: value.length,
      hasPrevious: false,
      hasNext: true,
    });
    assert.equal(second.text, value.slice(10));
    assert.equal(second.offset, 10);
    assert.equal(second.nextOffset, value.length);
    assert.equal(second.hasPrevious, true);
    assert.equal(second.hasNext, false);
  } finally {
    await worker.terminate();
  }
});

test('worker string ranges do not split surrogate pairs or CRLF', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });
  const value = 'A😀B\r\nC';

  try {
    await send({
      id: 'parse-root-for-string-boundaries',
      type: 'parse-root',
      text: JSON.stringify({ value }),
    });

    const emoji = await send({
      id: 'read-emoji-range',
      type: 'read-string-range',
      path: ['value'],
      offset: 1,
      length: 1,
    });
    const lineBreak = await send({
      id: 'read-crlf-range',
      type: 'read-string-range',
      path: ['value'],
      offset: 4,
      length: 1,
    });

    assert.equal(emoji.text, '😀');
    assert.equal(emoji.offset, 1);
    assert.equal(emoji.nextOffset, 3);
    assert.equal(lineBreak.text, '\r\n');
    assert.equal(lineBreak.offset, 4);
    assert.equal(lineBreak.nextOffset, 6);
  } finally {
    await worker.terminate();
  }
});

test('worker caps a string page by line breaks as well as character count', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });
  const lineDenseValue = `${'line\n'.repeat(2500)}tail`;
  const wideValue = 'x'.repeat(300 * 1024);

  try {
    await send({
      id: 'parse-root-for-line-bounded-page',
      type: 'parse-root',
      text: JSON.stringify({ lineDenseValue, wideValue }),
    });

    const lineDenseResponse = await send({
      id: 'read-line-bounded-page',
      type: 'read-string-range',
      path: ['lineDenseValue'],
      offset: 0,
      length: lineDenseValue.length,
    });
    const wideResponse = await send({
      id: 'read-character-bounded-page',
      type: 'read-string-range',
      path: ['wideValue'],
      offset: 0,
      length: wideValue.length,
    });

    assert.equal(lineDenseResponse.text.match(/\n/g)?.length, 2000);
    assert.equal(lineDenseResponse.hasNext, true);
    assert.equal(lineDenseResponse.nextOffset, lineDenseResponse.text.length);
    assert.equal(wideResponse.text.length, 256 * 1024);
    assert.equal(wideResponse.hasNext, true);
  } finally {
    await worker.terminate();
  }
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
  let nestedStringReadResponse;
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

    nestedStringReadResponse = await send({
      id: 'read-extra-inside-parsed-payload',
      type: 'read-string-range',
      path: ['payload', 'items', 0, 'extra'],
      offset: 0,
      length: 100,
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
  assert.equal(nestedStringReadResponse.ok, true);
  assert.equal(nestedStringReadResponse.text, '{"deep":true}');
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

test('worker expands all containers with collapsed exceptions and enforces max rows', async () => {
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
  let rowsResponse;

  try {
    parseResponse = await send({
      id: 'parse-root-for-expand-all',
      type: 'parse-root',
      text: JSON.stringify({
        open: { deep: { value: 1 } },
        closed: { hidden: 2 },
        tail: 3,
      }),
    });

    rowsResponse = await send({
      id: 'collect-expand-all-rows',
      type: 'collect-visible-rows',
      expansionMode: 'all',
      expandedKeys: [],
      collapsedKeys: [pathKey(['closed'])],
      maxRows: 5,
      yieldEvery: 2,
    });
  } finally {
    await worker.terminate();
  }

  assert.equal(parseResponse.ok, true);
  assert.equal(rowsResponse.ok, true);
  assert.equal(rowsResponse.truncated, true);
  assert.deepEqual(
    rowsResponse.rows.map((row) => [row.pathKey, row.expanded]),
    [
      [pathKey([]), true],
      [pathKey(['open']), true],
      [pathKey(['open', 'deep']), true],
      [pathKey(['open', 'deep', 'value']), false],
      [pathKey(['closed']), false],
    ],
  );
});

test('worker prepares copy text for retained values without adding values to row summaries', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });

  try {
    await send({
      id: 'parse-root-for-copy',
      type: 'parse-root',
      text: JSON.stringify({
        object: { nested: true },
        text: `line 1\nIt's "quoted"`,
        payload: '{"deep":true}',
      }),
    });

    const objectValue = await send({
      id: 'copy-object-value',
      type: 'copy-node',
      path: ['object'],
      format: 'value',
    });
    const jsLiteral = await send({
      id: 'copy-js-string',
      type: 'copy-node',
      path: ['text'],
      format: 'javascript-string-literal',
    });
    const jsonLiteral = await send({
      id: 'copy-json-string',
      type: 'copy-node',
      path: ['text'],
      format: 'json-string-literal',
    });

    await send({ id: 'parse-copy-payload', type: 'parse-string', path: ['payload'] });
    const parsedValue = await send({
      id: 'copy-parsed-value',
      type: 'copy-node',
      path: ['payload'],
      format: 'value',
    });

    assert.deepEqual(objectValue, {
      id: 'copy-object-value',
      type: 'copy-node-result',
      ok: true,
      path: ['object'],
      text: '{\n  "nested": true\n}',
    });
    assert.equal(jsLiteral.text, `'line 1\\nIt\\'s "quoted"'`);
    assert.equal(jsonLiteral.text, `"line 1\\nIt's \\"quoted\\""`);
    assert.equal(parsedValue.text, '{\n  "deep": true\n}');
  } finally {
    await worker.terminate();
  }
});

test('worker applies compact recursive subtree expansion with collapsed exceptions', async () => {
  const worker = new Worker(new URL('../src/worker/jsonWorker.js', import.meta.url), {
    type: 'module',
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage(message);
    });

  try {
    await send({
      id: 'parse-root-for-recursive-expansion',
      type: 'parse-root',
      text: '{"open":{"deep":{"value":1}},"closed":{"hidden":2}}',
    });
    const response = await send({
      id: 'collect-recursive-expansion',
      type: 'collect-visible-rows',
      expandedKeys: [pathKey([])],
      recursiveExpandedKeys: [pathKey(['open'])],
      collapsedKeys: [pathKey(['open', 'deep'])],
      maxRows: 20,
    });

    assert.deepEqual(
      response.rows.map((row) => [row.pathKey, row.expanded, row.recursivelyExpanded]),
      [
        [pathKey([]), true, false],
        [pathKey(['open']), true, true],
        [pathKey(['open', 'deep']), false, true],
        [pathKey(['closed']), false, false],
      ],
    );
  } finally {
    await worker.terminate();
  }
});
