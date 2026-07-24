import { findTextMatches } from './textSearch.js';
import { formatPath, pathKey } from './path.js';
import { getChildNodes, getNodeKind } from './treeModel.js';

const DEFAULT_MAX_RESULTS = 500;
const DEFAULT_LONG_STRING_THRESHOLD = 16 * 1024;
const DEFAULT_STRING_CHUNK_SIZE = 128 * 1024;
const DEFAULT_YIELD_EVERY = 500;

function waitForNextTurn() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function normalizeText(value, caseSensitive) {
  return caseSensitive ? value : value.toLowerCase();
}

function createPreview(text, index, length) {
  const start = Math.max(0, index - 36);
  const end = Math.min(text.length, index + length + 36);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function primitiveToSearchText(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return String(value);
  }

  return null;
}

function getEffectiveValue(value, path, parseCache) {
  if (
    typeof value === 'string' &&
    parseCache?.hasParsed(path) &&
    parseCache.getDisplayMode(path) === 'parsed'
  ) {
    return parseCache.getParsed(path);
  }

  return value;
}

function collectInlineTextMatches({
  text,
  query,
  caseSensitive,
  maxResults,
  createMatch,
}) {
  const normalizedText = normalizeText(text, caseSensitive);
  const normalizedQuery = normalizeText(query, caseSensitive);
  const matches = [];
  let index = normalizedText.indexOf(normalizedQuery);

  while (index !== -1 && matches.length < maxResults) {
    matches.push(createMatch(index));
    index = normalizedText.indexOf(normalizedQuery, index + Math.max(normalizedQuery.length, 1));
  }

  return {
    matches,
    truncated: index !== -1,
  };
}

function appendMatches(target, additions, maxResults) {
  for (const match of additions) {
    if (target.length >= maxResults) {
      return false;
    }

    target.push(match);
  }

  return target.length < maxResults;
}

export async function searchJsonTree(rootValue, query, options = {}) {
  const rawQuery = String(query || '');
  const maxResults = Math.max(0, options.maxResults ?? DEFAULT_MAX_RESULTS);
  const caseSensitive = options.caseSensitive === true;
  const longStringThreshold = Math.max(
    1,
    options.longStringThreshold ?? DEFAULT_LONG_STRING_THRESHOLD,
  );
  const stringChunkSize = Math.max(1, options.stringChunkSize ?? DEFAULT_STRING_CHUNK_SIZE);
  const yieldEvery = Math.max(1, options.yieldEvery ?? DEFAULT_YIELD_EVERY);
  const parseCache = options.parseCache ?? null;
  const rootPath = options.rootPath ?? [];
  const matches = [];
  let searchedNodes = 0;
  let truncated = false;

  if (!rawQuery || maxResults === 0) {
    return {
      query: rawQuery,
      matches,
      truncated: false,
      searchedNodes,
    };
  }

  async function searchValueText(value, path) {
    const text = primitiveToSearchText(value);
    if (text === null) {
      return true;
    }

    if (typeof value === 'string' && value.length >= longStringThreshold) {
      const result = await findTextMatches(text, rawQuery, {
        caseSensitive,
        chunkSize: stringChunkSize,
        maxResults: maxResults - matches.length,
      });
      const valueMatches = result.matches.map((match) => ({
        path,
        pathKey: pathKey(path),
        pathLabel: formatPath(path),
        source: 'value',
        kind: getNodeKind(value),
        preview: match.preview,
        valueIndex: match.index,
      }));

      appendMatches(matches, valueMatches, maxResults);
      truncated = result.truncated || matches.length >= maxResults;
      return matches.length < maxResults;
    }

    const result = collectInlineTextMatches({
      text,
      query: rawQuery,
      caseSensitive,
      maxResults: maxResults - matches.length,
      createMatch: (index) => ({
        path,
        pathKey: pathKey(path),
        pathLabel: formatPath(path),
        source: 'value',
        kind: getNodeKind(value),
        preview: createPreview(text, index, rawQuery.length),
        valueIndex: index,
      }),
    });

    appendMatches(matches, result.matches, maxResults);
    truncated = result.truncated || matches.length >= maxResults;
    return matches.length < maxResults;
  }

  function searchKeyText(key, path, value) {
    if (typeof key !== 'string') {
      return true;
    }

    const result = collectInlineTextMatches({
      text: key,
      query: rawQuery,
      caseSensitive,
      maxResults: maxResults - matches.length,
      createMatch: (index) => ({
        path,
        pathKey: pathKey(path),
        pathLabel: formatPath(path),
        source: 'key',
        kind: getNodeKind(value),
        preview: createPreview(key, index, rawQuery.length),
        keyIndex: index,
      }),
    });

    appendMatches(matches, result.matches, maxResults);
    truncated = result.truncated || matches.length >= maxResults;
    return matches.length < maxResults;
  }

  const stack = [{ key: '$', path: rootPath, value: rootValue }];

  while (stack.length > 0 && matches.length < maxResults) {
    const current = stack.pop();
    const effectiveValue = getEffectiveValue(current.value, current.path, parseCache);
    searchedNodes += 1;

    if (!searchKeyText(current.key, current.path, effectiveValue)) {
      break;
    }

    if (!(await searchValueText(effectiveValue, current.path))) {
      break;
    }

    const children = getChildNodes(effectiveValue, current.path);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }

    if (searchedNodes % yieldEvery === 0) {
      await waitForNextTurn();
    }
  }

  if (stack.length > 0 && matches.length >= maxResults) {
    truncated = true;
  }

  return {
    query: rawQuery,
    matches,
    truncated,
    searchedNodes,
  };
}
