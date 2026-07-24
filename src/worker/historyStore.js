const DATABASE_NAME = 'az-json-explorer';
const DATABASE_VERSION = 2;
const ENTRY_STORE = 'parse-history-entries';
const CONTENT_STORE = 'parse-history-contents';
const LAST_VIEWED_INDEX = 'last-viewed-at';

function getTimestamp() {
  return globalThis.performance
    ? globalThis.performance.timeOrigin + globalThis.performance.now()
    : Date.now();
}

function createId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getContentSize(content) {
  if (typeof content?.size === 'number') {
    return content.size;
  }

  return new TextEncoder().encode(String(content)).byteLength;
}

function toHistoryItem(entry) {
  return {
    id: entry.id,
    title: entry.title,
    sourceType: entry.sourceType,
    size: entry.size,
    preview: entry.preview || '',
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    lastViewedAt: entry.lastViewedAt,
  };
}

function compareNewestFirst(left, right) {
  return (
    right.lastViewedAt - left.lastViewedAt ||
    right.id.localeCompare(left.id)
  );
}

function isBeforeCursor(entry, cursor) {
  if (!cursor) {
    return true;
  }

  return (
    entry.lastViewedAt < cursor.lastViewedAt ||
    (entry.lastViewedAt === cursor.lastViewedAt && entry.id < cursor.id)
  );
}

function createMemoryHistoryStore() {
  const entries = new Map();
  const contents = new Map();

  return {
    async add({ title, sourceType, content, preview = '', session = null }) {
      const id = createId();
      const now = getTimestamp();
      const entry = {
        id,
        title,
        sourceType,
        size: getContentSize(content),
        preview,
        createdAt: now,
        updatedAt: now,
        lastViewedAt: now,
        session,
      };
      entries.set(id, entry);
      contents.set(id, content);
      return toHistoryItem(entry);
    },

    async list({ cursor = null, limit = 50 } = {}) {
      const pageSize = Math.max(1, Math.min(100, limit));
      const candidates = [...entries.values()]
        .filter((entry) => isBeforeCursor(entry, cursor))
        .sort(compareNewestFirst);
      const page = candidates.slice(0, pageSize);
      return {
        items: page.map(toHistoryItem),
        nextCursor:
          candidates.length > pageSize && page.length > 0
            ? {
                lastViewedAt: page.at(-1).lastViewedAt,
                id: page.at(-1).id,
              }
            : null,
      };
    },

    async get(id) {
      const entry = entries.get(id);
      if (!entry || !contents.has(id)) {
        return null;
      }

      return { ...entry, content: contents.get(id) };
    },

    async updateSession(id, session) {
      const entry = entries.get(id);
      if (!entry) {
        return false;
      }

      entries.set(id, {
        ...entry,
        session,
        updatedAt: getTimestamp(),
      });
      return true;
    },

    async markViewed(id) {
      const entry = entries.get(id);
      if (!entry) {
        return null;
      }

      const viewed = {
        ...entry,
        lastViewedAt: getTimestamp(),
      };
      entries.set(id, viewed);
      return toHistoryItem(viewed);
    },

    async cleanup(keep) {
      const keepCount = Math.max(0, Math.floor(keep));
      const ordered = [...entries.values()].sort(compareNewestFirst);
      const keptIds = ordered.slice(0, keepCount).map((entry) => entry.id);
      for (const entry of ordered.slice(keepCount)) {
        entries.delete(entry.id);
        contents.delete(entry.id);
      }
      return {
        deletedCount: Math.max(0, ordered.length - keepCount),
        keptIds,
      };
    },
  };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error || new Error('History transaction was aborted.')),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () => reject(transaction.error || new Error('History transaction failed.')),
      { once: true },
    );
  });
}

function openDatabase(indexedDb) {
  const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
  request.addEventListener('upgradeneeded', () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(ENTRY_STORE)) {
      const entries = database.createObjectStore(ENTRY_STORE, { keyPath: 'id' });
      entries.createIndex(
        LAST_VIEWED_INDEX,
        ['lastViewedAt', 'id'],
        { unique: true },
      );
    } else {
      const entries = request.transaction.objectStore(ENTRY_STORE);
      if (!entries.indexNames.contains(LAST_VIEWED_INDEX)) {
        entries.createIndex(
          LAST_VIEWED_INDEX,
          ['lastViewedAt', 'id'],
          { unique: true },
        );
        const cursorRequest = entries.openCursor();
        cursorRequest.addEventListener('success', () => {
          const cursor = cursorRequest.result;
          if (!cursor) {
            return;
          }
          if (!Number.isFinite(cursor.value.lastViewedAt)) {
            cursor.update({
              ...cursor.value,
              lastViewedAt:
                cursor.value.updatedAt || cursor.value.createdAt || getTimestamp(),
            });
          }
          cursor.continue();
        });
      }
    }
    if (!database.objectStoreNames.contains(CONTENT_STORE)) {
      database.createObjectStore(CONTENT_STORE, { keyPath: 'id' });
    }
  });
  return requestResult(request);
}

function createIndexedDbHistoryStore(indexedDb) {
  let databasePromise;
  const getDatabase = () => {
    databasePromise ||= openDatabase(indexedDb);
    return databasePromise;
  };

  return {
    async add({ title, sourceType, content, preview = '', session = null }) {
      const database = await getDatabase();
      const id = createId();
      const now = getTimestamp();
      const entry = {
        id,
        title,
        sourceType,
        size: getContentSize(content),
        preview,
        createdAt: now,
        updatedAt: now,
        lastViewedAt: now,
        session,
      };
      const transaction = database.transaction(
        [ENTRY_STORE, CONTENT_STORE],
        'readwrite',
      );
      transaction.objectStore(ENTRY_STORE).add(entry);
      transaction.objectStore(CONTENT_STORE).add({ id, content });
      await transactionComplete(transaction);
      return toHistoryItem(entry);
    },

    async list({ cursor = null, limit = 50 } = {}) {
      const database = await getDatabase();
      const pageSize = Math.max(1, Math.min(100, limit));
      const transaction = database.transaction(ENTRY_STORE, 'readonly');
      const index = transaction.objectStore(ENTRY_STORE).index(LAST_VIEWED_INDEX);
      const keyRange =
        cursor && typeof globalThis.IDBKeyRange !== 'undefined'
          ? globalThis.IDBKeyRange.upperBound(
              [cursor.lastViewedAt, cursor.id],
              true,
            )
          : null;
      const request = index.openCursor(keyRange, 'prev');
      const entries = [];

      await new Promise((resolve, reject) => {
        request.addEventListener('error', () => reject(request.error), { once: true });
        request.addEventListener('success', () => {
          const itemCursor = request.result;
          if (!itemCursor || entries.length > pageSize) {
            resolve();
            return;
          }

          if (isBeforeCursor(itemCursor.value, cursor)) {
            entries.push(itemCursor.value);
          }
          itemCursor.continue();
        });
      });
      await transactionComplete(transaction);

      const page = entries.slice(0, pageSize);
      return {
        items: page.map(toHistoryItem),
        nextCursor:
          entries.length > pageSize && page.length > 0
            ? {
                lastViewedAt: page.at(-1).lastViewedAt,
                id: page.at(-1).id,
              }
            : null,
      };
    },

    async get(id) {
      const database = await getDatabase();
      const transaction = database.transaction(
        [ENTRY_STORE, CONTENT_STORE],
        'readonly',
      );
      const entryRequest = transaction.objectStore(ENTRY_STORE).get(id);
      const contentRequest = transaction.objectStore(CONTENT_STORE).get(id);
      const [entry, contentRecord] = await Promise.all([
        requestResult(entryRequest),
        requestResult(contentRequest),
      ]);
      await transactionComplete(transaction);
      return entry && contentRecord ? { ...entry, content: contentRecord.content } : null;
    },

    async updateSession(id, session) {
      const database = await getDatabase();
      const transaction = database.transaction(ENTRY_STORE, 'readwrite');
      const store = transaction.objectStore(ENTRY_STORE);
      const entry = await requestResult(store.get(id));
      if (!entry) {
        transaction.abort();
        try {
          await transactionComplete(transaction);
        } catch {
          // The explicit abort only closes the unused write transaction.
        }
        return false;
      }

      store.put({
        ...entry,
        session,
        updatedAt: getTimestamp(),
      });
      await transactionComplete(transaction);
      return true;
    },

    async markViewed(id) {
      const database = await getDatabase();
      const transaction = database.transaction(ENTRY_STORE, 'readwrite');
      const store = transaction.objectStore(ENTRY_STORE);
      const entry = await requestResult(store.get(id));
      if (!entry) {
        transaction.abort();
        try {
          await transactionComplete(transaction);
        } catch {
          // The explicit abort only closes the unused write transaction.
        }
        return null;
      }

      const viewed = {
        ...entry,
        lastViewedAt: getTimestamp(),
      };
      store.put(viewed);
      await transactionComplete(transaction);
      return toHistoryItem(viewed);
    },

    async cleanup(keep) {
      const database = await getDatabase();
      const keepCount = Math.max(0, Math.floor(keep));
      const transaction = database.transaction(
        [ENTRY_STORE, CONTENT_STORE],
        'readwrite',
      );
      const entries = transaction.objectStore(ENTRY_STORE);
      const contents = transaction.objectStore(CONTENT_STORE);
      const request = entries.index(LAST_VIEWED_INDEX).openCursor(null, 'prev');
      const keptIds = [];
      let deletedCount = 0;

      await new Promise((resolve, reject) => {
        request.addEventListener('error', () => reject(request.error), { once: true });
        request.addEventListener('success', () => {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }

          if (keptIds.length < keepCount) {
            keptIds.push(cursor.primaryKey);
          } else {
            cursor.delete();
            contents.delete(cursor.primaryKey);
            deletedCount += 1;
          }
          cursor.continue();
        });
      });
      await transactionComplete(transaction);
      return { deletedCount, keptIds };
    },
  };
}

export function createHistoryStore(indexedDb = globalThis.indexedDB) {
  return indexedDb
    ? createIndexedDbHistoryStore(indexedDb)
    : createMemoryHistoryStore();
}
