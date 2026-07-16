const EXPLICIT_MODE = 'explicit';
const ALL_MODE = 'all';

function cloneState(state) {
  return {
    mode: state.mode,
    expandedKeys: new Set(state.expandedKeys),
    collapsedKeys: new Set(state.collapsedKeys),
    recursiveExpandedKeys: new Set(state.recursiveExpandedKeys || []),
  };
}

function isPathWithin(candidateKey, ancestorKey) {
  const candidate = JSON.parse(candidateKey);
  const ancestor = JSON.parse(ancestorKey);
  return (
    ancestor.length <= candidate.length &&
    ancestor.every((segment, index) => segment === candidate[index])
  );
}

function markExpanded(state, pathKey) {
  state.collapsedKeys.delete(pathKey);
  if (state.mode !== ALL_MODE) {
    state.expandedKeys.add(pathKey);
  }
}

export function createExplicitExpansionState(expandedKeys = []) {
  return {
    mode: EXPLICIT_MODE,
    expandedKeys: new Set(expandedKeys),
    collapsedKeys: new Set(),
    recursiveExpandedKeys: new Set(),
  };
}

export function createAllExpansionState(collapsedKeys = []) {
  return {
    mode: ALL_MODE,
    expandedKeys: new Set(),
    collapsedKeys: new Set(collapsedKeys),
    recursiveExpandedKeys: new Set(),
  };
}

export function createInitialExpansionState(nodeCount, rootPathKey) {
  return nodeCount?.truncated === false
    ? createAllExpansionState()
    : createExplicitExpansionState([rootPathKey]);
}

export function toggleExpansion(state, pathKey, options = {}) {
  const nextState = cloneState(state);

  if (nextState.mode === ALL_MODE || options.recursivelyExpanded) {
    if (nextState.collapsedKeys.has(pathKey)) {
      nextState.collapsedKeys.delete(pathKey);
    } else {
      nextState.collapsedKeys.add(pathKey);
    }
  } else if (nextState.expandedKeys.has(pathKey)) {
    nextState.expandedKeys.delete(pathKey);
  } else {
    nextState.expandedKeys.add(pathKey);
  }

  return nextState;
}

export function expandRecursively(state, pathKey) {
  const nextState = cloneState(state);

  for (const collapsedKey of nextState.collapsedKeys) {
    if (isPathWithin(collapsedKey, pathKey)) {
      nextState.collapsedKeys.delete(collapsedKey);
    }
  }

  if (nextState.mode === ALL_MODE) {
    return nextState;
  }

  const alreadyCovered = Array.from(nextState.recursiveExpandedKeys).some((recursiveKey) =>
    isPathWithin(pathKey, recursiveKey),
  );
  if (alreadyCovered) {
    return nextState;
  }

  for (const recursiveKey of nextState.recursiveExpandedKeys) {
    if (isPathWithin(recursiveKey, pathKey)) {
      nextState.recursiveExpandedKeys.delete(recursiveKey);
    }
  }
  nextState.recursiveExpandedKeys.add(pathKey);
  return nextState;
}

export function ensureExpanded(state, pathKey) {
  const nextState = cloneState(state);
  markExpanded(nextState, pathKey);
  return nextState;
}

export function revealExpansionPaths(state, pathKeys) {
  const nextState = cloneState(state);
  for (const pathKey of pathKeys) {
    markExpanded(nextState, pathKey);
  }
  return nextState;
}
