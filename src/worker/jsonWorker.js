import { canParseStringAsJson } from '../core/parseCache.js';
import { formatCopyPath, formatPath, pathKey, collectVisibleRows } from '../core/treeModel.js';
import { searchJsonTree } from '../core/treeSearch.js';
import { countJsonNodesUpTo } from '../core/treeStats.js';
import {
  formatJavaScriptStringLiteral,
  formatJsonStringLiteral,
  formatValueForClipboard,
} from '../core/clipboard.js';

let retainedRootValue;
let retainedParseCache = new Map();
const MAX_DISPLAY_VALUE_LENGTH = 240;
const MAX_STRING_RANGE_LENGTH = 256 * 1024;
const MAX_STRING_RANGE_LINE_BREAKS = 2000;

function parseJson(text) {
  return JSON.parse(text);
}

async function readMessageText(message) {
  if (typeof message.text === 'string') {
    return message.text;
  }

  const fileLike = message.file ?? message.blob;
  if (fileLike && typeof fileLike.text === 'function') {
    return fileLike.text();
  }

  throw new Error('No JSON text or file was provided.');
}

function summarizeContainer(value) {
  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value).length} keys}`;
  }

  return formatJsonValue(value);
}

function summarizeString(value) {
  const completeValueBudget = MAX_DISPLAY_VALUE_LENGTH - 2;
  const truncatedValueBudget = MAX_DISPLAY_VALUE_LENGTH - 5;
  const encodedCharacters = [];
  let encodedLength = 0;
  let consumedLength = 0;

  for (const character of value) {
    const encodedCharacter = JSON.stringify(character).slice(1, -1);
    if (encodedLength + encodedCharacter.length > completeValueBudget) {
      break;
    }

    encodedCharacters.push(encodedCharacter);
    encodedLength += encodedCharacter.length;
    consumedLength += character.length;
  }

  const valueTruncated = consumedLength < value.length;
  while (valueTruncated && encodedLength > truncatedValueBudget) {
    encodedLength -= encodedCharacters.pop().length;
  }

  const escaped = encodedCharacters.join('');
  return {
    displayValue: valueTruncated ? `"${escaped}..."` : `"${escaped}"`,
    valueTruncated,
    valueLength: value.length,
  };
}

function formatJsonValue(value) {
  if (typeof value === 'string') {
    return summarizeString(value).displayValue;
  }

  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value).length} keys}`;
  }

  return String(value);
}

function createRootSummary(value) {
  return {
    kind: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value,
    displayValue: summarizeContainer(value),
    expandable:
      Array.isArray(value) ? value.length > 0 : Boolean(value && typeof value === 'object'),
  };
}

function getVisibleValueAtPath(rootValue, path) {
  let value = rootValue;
  let currentPath = [];

  for (const segment of path) {
    const parsedEntry = retainedParseCache.get(pathKey(currentPath));
    if (parsedEntry?.parsedValue !== undefined && parsedEntry.displayMode === 'parsed') {
      value = parsedEntry.parsedValue;
    }

    if (value == null) {
      return undefined;
    }

    value = value[segment];
    currentPath = [...currentPath, segment];
  }

  return value;
}

function getEffectiveValueAtPath(rootValue, path) {
  const value = getVisibleValueAtPath(rootValue, path);
  const parsedEntry = retainedParseCache.get(pathKey(path));
  return parsedEntry?.parsedValue !== undefined && parsedEntry.displayMode === 'parsed'
    ? parsedEntry.parsedValue
    : value;
}

function createCopyNodeResult(message) {
  if (retainedRootValue === undefined) {
    return {
      id: message.id,
      type: 'copy-node-result',
      ok: false,
      path: message.path,
      error: 'No parsed JSON is available to copy.',
    };
  }

  const sourceValue = getVisibleValueAtPath(retainedRootValue, message.path);
  const effectiveValue = getEffectiveValueAtPath(retainedRootValue, message.path);
  let text;

  if (message.format === 'value') {
    text = formatValueForClipboard(effectiveValue);
  } else if (typeof sourceValue !== 'string') {
    return {
      id: message.id,
      type: 'copy-node-result',
      ok: false,
      path: message.path,
      error: `Value at ${formatPath(message.path)} is not a string.`,
    };
  } else if (message.format === 'javascript-string-literal') {
    text = formatJavaScriptStringLiteral(sourceValue);
  } else if (message.format === 'json-string-literal') {
    text = formatJsonStringLiteral(sourceValue);
  } else {
    return {
      id: message.id,
      type: 'copy-node-result',
      ok: false,
      path: message.path,
      error: `Unknown copy format: ${message.format}`,
    };
  }

  return {
    id: message.id,
    type: 'copy-node-result',
    ok: true,
    path: message.path,
    text,
  };
}

function isHighSurrogate(code) {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code) {
  return code >= 0xdc00 && code <= 0xdfff;
}

function normalizeStringRangeStart(value, requestedOffset) {
  let offset = Math.max(0, Math.min(value.length, requestedOffset));

  if (
    offset > 0 &&
    offset < value.length &&
    isHighSurrogate(value.charCodeAt(offset - 1)) &&
    isLowSurrogate(value.charCodeAt(offset))
  ) {
    offset -= 1;
  }

  if (offset > 0 && value[offset - 1] === '\r' && value[offset] === '\n') {
    offset -= 1;
  }

  return offset;
}

function extendStringRangeEnd(value, requestedEnd) {
  let end = Math.max(0, Math.min(value.length, requestedEnd));

  if (
    end > 0 &&
    end < value.length &&
    isHighSurrogate(value.charCodeAt(end - 1)) &&
    isLowSurrogate(value.charCodeAt(end))
  ) {
    end += 1;
  }

  if (end > 0 && end < value.length && value[end - 1] === '\r' && value[end] === '\n') {
    end += 1;
  }

  return end;
}

function limitStringRangeByLineBreaks(value, offset, requestedEnd) {
  let lineBreaks = 0;

  for (let index = offset; index < requestedEnd; index += 1) {
    const character = value[index];
    if (character === '\r' && value[index + 1] === '\n') {
      lineBreaks += 1;
      index += 1;
    } else if (
      character === '\r' ||
      character === '\n' ||
      character === '\u2028' ||
      character === '\u2029'
    ) {
      lineBreaks += 1;
    }

    if (lineBreaks >= MAX_STRING_RANGE_LINE_BREAKS) {
      return index + 1;
    }
  }

  return requestedEnd;
}

function createReadStringRangeResult(message) {
  if (retainedRootValue === undefined) {
    return {
      id: message.id,
      type: 'read-string-range-result',
      ok: false,
      path: message.path,
      error: 'No parsed JSON is available to read.',
    };
  }

  const value = getVisibleValueAtPath(retainedRootValue, message.path);
  if (typeof value !== 'string') {
    return {
      id: message.id,
      type: 'read-string-range-result',
      ok: false,
      path: message.path,
      error: `Value at ${formatPath(message.path)} is not a string.`,
    };
  }

  const requestedOffset = Number.isFinite(message.offset) ? Math.trunc(message.offset) : 0;
  const requestedLength = Number.isFinite(message.length)
    ? Math.trunc(message.length)
    : MAX_STRING_RANGE_LENGTH;
  const offset = normalizeStringRangeStart(value, requestedOffset);
  const length = Math.max(1, Math.min(MAX_STRING_RANGE_LENGTH, requestedLength));
  const requestedEnd = Math.min(value.length, offset + length);
  const lineBoundedEnd = limitStringRangeByLineBreaks(value, offset, requestedEnd);
  const nextOffset = extendStringRangeEnd(value, lineBoundedEnd);

  return {
    id: message.id,
    type: 'read-string-range-result',
    ok: true,
    path: message.path,
    text: value.slice(offset, nextOffset),
    offset,
    nextOffset,
    totalLength: value.length,
    hasPrevious: offset > 0,
    hasNext: nextOffset < value.length,
  };
}

function createParseCacheAdapter() {
  return {
    hasParsed(path) {
      return retainedParseCache.get(pathKey(path))?.parsedValue !== undefined;
    },
    getParsed(path) {
      return retainedParseCache.get(pathKey(path))?.parsedValue;
    },
    getDisplayMode(path) {
      return retainedParseCache.get(pathKey(path))?.displayMode ?? 'raw';
    },
    getError(path) {
      return retainedParseCache.get(pathKey(path))?.error ?? null;
    },
  };
}

function createDisplayRow(row, parseCache) {
  const valueSummary =
    row.parsed || typeof row.value !== 'string'
      ? {
          displayValue: row.parsed
            ? summarizeContainer(row.effectiveValue)
            : formatJsonValue(row.value),
          valueTruncated: false,
          valueLength: null,
        }
      : summarizeString(row.value);

  return {
    key: row.key,
    path: row.path,
    pathKey: row.pathKey,
    labelPath: row.labelPath,
    copyPath: formatCopyPath(row.path, parseCache),
    depth: row.depth,
    kind: row.kind,
    effectiveKind: row.effectiveKind,
    expandable: row.expandable,
    expanded: row.expanded,
    recursivelyExpanded: row.recursivelyExpanded,
    parsed: row.parsed,
    hasParsed: parseCache.hasParsed(row.path),
    canParseAsJson: typeof row.value === 'string' && canParseStringAsJson(row.value),
    parseError: row.parseError,
    ...valueSummary,
  };
}

async function createParseResult(message, resultType, { retainRoot = false } = {}) {
  try {
    const text = await readMessageText(message);
    const value = parseJson(text);
    if (retainRoot) {
      retainedRootValue = value;
      retainedParseCache = new Map();
    }

    const response = {
      id: message.id,
      type: resultType,
      ok: true,
      path: message.path,
    };

    if (retainRoot) {
      response.root = createRootSummary(value);
      if (Number.isFinite(message.nodeCountLimit)) {
        response.nodeCount = countJsonNodesUpTo(value, message.nodeCountLimit);
      }
    } else {
      response.value = value;
    }

    return response;
  } catch (error) {
    if (retainRoot) {
      retainedRootValue = undefined;
      retainedParseCache = new Map();
    }

    return {
      id: message.id,
      type: resultType,
      ok: false,
      path: message.path,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function createStringParseResult(message) {
  const sourceValue = getVisibleValueAtPath(retainedRootValue, message.path);
  const key = pathKey(message.path);

  if (typeof sourceValue !== 'string') {
    retainedParseCache.set(key, {
      parsedValue: retainedParseCache.get(key)?.parsedValue,
      displayMode: 'raw',
      error: `Value at ${formatPath(message.path)} is not a string.`,
    });
    return {
      id: message.id,
      type: 'parse-string-result',
      ok: false,
      path: message.path,
      error: retainedParseCache.get(key).error,
    };
  }

  try {
    const parsedValue = parseJson(sourceValue);
    retainedParseCache.set(key, {
      parsedValue,
      displayMode: 'parsed',
      error: null,
    });
    return {
      id: message.id,
      type: 'parse-string-result',
      ok: true,
      path: message.path,
      displayMode: 'parsed',
    };
  } catch (error) {
    retainedParseCache.set(key, {
      parsedValue: retainedParseCache.get(key)?.parsedValue,
      displayMode: 'raw',
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      id: message.id,
      type: 'parse-string-result',
      ok: false,
      path: message.path,
      error: retainedParseCache.get(key).error,
    };
  }
}

export async function handleWorkerMessage(message) {
  if (message?.type === 'parse-root') {
    return createParseResult(message, 'parse-root-result', { retainRoot: true });
  }

  if (message?.type === 'parse-string') {
    if (message.text !== undefined) {
      return createParseResult(message, 'parse-string-result');
    }

    return createStringParseResult(message);
  }

  if (message?.type === 'toggle-parsed-display') {
    const key = pathKey(message.path);
    const existing = retainedParseCache.get(key);
    if (!existing || existing.parsedValue === undefined) {
      return {
        id: message.id,
        type: 'toggle-parsed-display-result',
        ok: false,
        path: message.path,
        error: 'No parsed value is cached for this path.',
      };
    }

    existing.displayMode = existing.displayMode === 'parsed' ? 'raw' : 'parsed';
    existing.error = null;
    return {
      id: message.id,
      type: 'toggle-parsed-display-result',
      ok: true,
      path: message.path,
      displayMode: existing.displayMode,
    };
  }

  if (message?.type === 'copy-node') {
    return createCopyNodeResult(message);
  }

  if (message?.type === 'read-string-range') {
    return createReadStringRangeResult(message);
  }

  if (message?.type === 'collect-visible-rows') {
    if (retainedRootValue === undefined) {
      return {
        id: message.id,
        type: 'collect-visible-rows-result',
        ok: false,
        error: 'No parsed JSON is available to render.',
      };
    }

    const maxRows = message.maxRows ?? Number.POSITIVE_INFINITY;
    const parseCache = createParseCacheAdapter();
    const rows = await collectVisibleRows(retainedRootValue, {
      expansionMode: message.expansionMode ?? 'explicit',
      expandedKeys: new Set(message.expandedKeys || []),
      collapsedKeys: new Set(message.collapsedKeys || []),
      recursiveExpandedKeys: new Set(message.recursiveExpandedKeys || []),
      maxRows,
      parseCache,
      yieldEvery: message.yieldEvery ?? 500,
    });

    return {
      id: message.id,
      type: 'collect-visible-rows-result',
      ok: true,
      rows: rows.map((row) => createDisplayRow(row, parseCache)),
      truncated: rows.length >= maxRows,
    };
  }

  if (message?.type === 'search-tree') {
    if (retainedRootValue === undefined) {
      return {
        id: message.id,
        type: 'search-tree-result',
        ok: false,
        error: 'No parsed JSON is available to search.',
      };
    }

    return {
      id: message.id,
      type: 'search-tree-result',
      ok: true,
      result: await searchJsonTree(retainedRootValue, message.query, {
        caseSensitive: message.caseSensitive,
        maxResults: message.maxResults,
        longStringThreshold: message.longStringThreshold,
        stringChunkSize: message.stringChunkSize,
        parseCache: createParseCacheAdapter(),
      }),
    };
  }

  return {
    id: message?.id,
    type: 'error',
    ok: false,
    error: `Unknown worker message type: ${message?.type}`,
  };
}

function attachBrowserWorker() {
  globalThis.addEventListener('message', async (event) => {
    globalThis.postMessage(await handleWorkerMessage(event.data));
  });
}

async function attachNodeWorker() {
  const { parentPort } = await import('node:worker_threads');
  parentPort.on('message', async (message) => {
    parentPort.postMessage(await handleWorkerMessage(message));
  });
}

if (typeof globalThis.addEventListener === 'function' && typeof globalThis.postMessage === 'function') {
  attachBrowserWorker();
} else {
  await attachNodeWorker();
}
