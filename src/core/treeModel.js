import { appendPath, formatCopyPath, formatPath, pathKey } from './path.js';

export { formatCopyPath, formatPath, pathKey };

export function getNodeKind(value) {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  return typeof value;
}

export function getChildNodes(value, basePath = []) {
  if (Array.isArray(value)) {
    return value.map((childValue, index) => ({
      key: index,
      path: appendPath(basePath, index),
      value: childValue,
      kind: getNodeKind(childValue),
    }));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).map((key) => {
      const childValue = value[key];
      return {
        key,
        path: appendPath(basePath, key),
        value: childValue,
        kind: getNodeKind(childValue),
      };
    });
  }

  return [];
}

export function isExpandableValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
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

function createRow({
  key,
  path,
  value,
  depth,
  expansionMode,
  expandedKeys,
  collapsedKeys,
  recursivelyExpanded,
  parseCache,
}) {
  const effectiveValue = getEffectiveValue(value, path, parseCache);
  const rowPathKey = pathKey(path);
  const parsed = effectiveValue !== value;
  const expandable = isExpandableValue(effectiveValue);
  const expanded =
    expandable &&
    !collapsedKeys.has(rowPathKey) &&
    (expansionMode === 'all' || recursivelyExpanded || expandedKeys.has(rowPathKey));

  return {
    key,
    path,
    pathKey: rowPathKey,
    labelPath: formatPath(path),
    value,
    effectiveValue,
    depth,
    kind: getNodeKind(value),
    effectiveKind: getNodeKind(effectiveValue),
    expandable,
    expanded,
    recursivelyExpanded,
    parsed,
    parseError: parseCache?.getError(path) ?? null,
  };
}

function waitForNextTurn() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export async function collectVisibleRows(rootValue, options = {}) {
  const {
    expansionMode = 'explicit',
    expandedKeys = new Set(),
    collapsedKeys = new Set(),
    recursiveExpandedKeys = new Set(),
    parseCache = null,
    yieldEvery = 500,
    maxRows = Number.POSITIVE_INFINITY,
  } = options;
  const rows = [];
  let visitedSinceYield = 0;

  async function visit({ key, path, value, depth, withinRecursiveExpansion = false }) {
    if (rows.length >= maxRows) {
      return;
    }

    const recursivelyExpanded = withinRecursiveExpansion || recursiveExpandedKeys.has(pathKey(path));
    const row = createRow({
      key,
      path,
      value,
      depth,
      expansionMode,
      expandedKeys,
      collapsedKeys,
      recursivelyExpanded,
      parseCache,
    });
    rows.push(row);
    visitedSinceYield += 1;

    if (visitedSinceYield >= yieldEvery) {
      visitedSinceYield = 0;
      await waitForNextTurn();
    }

    if (!row.expanded || rows.length >= maxRows) {
      return;
    }

    const children = getChildNodes(row.effectiveValue, path);
    for (const child of children) {
      await visit({
        key: child.key,
        path: child.path,
        value: child.value,
        depth: depth + 1,
        withinRecursiveExpansion: recursivelyExpanded,
      });

      if (rows.length >= maxRows) {
        return;
      }
    }
  }

  await visit({ key: '$', path: [], value: rootValue, depth: 0 });
  return rows;
}
