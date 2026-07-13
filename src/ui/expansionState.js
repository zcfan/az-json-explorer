const EXPLICIT_MODE = 'explicit';
const ALL_MODE = 'all';

function cloneState(state) {
  return {
    mode: state.mode,
    expandedKeys: new Set(state.expandedKeys),
    collapsedKeys: new Set(state.collapsedKeys),
  };
}

function markExpanded(state, pathKey) {
  if (state.mode === ALL_MODE) {
    state.collapsedKeys.delete(pathKey);
  } else {
    state.expandedKeys.add(pathKey);
  }
}

export function createExplicitExpansionState(expandedKeys = []) {
  return {
    mode: EXPLICIT_MODE,
    expandedKeys: new Set(expandedKeys),
    collapsedKeys: new Set(),
  };
}

export function createAllExpansionState(collapsedKeys = []) {
  return {
    mode: ALL_MODE,
    expandedKeys: new Set(),
    collapsedKeys: new Set(collapsedKeys),
  };
}

export function toggleExpansion(state, pathKey) {
  const nextState = cloneState(state);
  const keys = nextState.mode === ALL_MODE ? nextState.collapsedKeys : nextState.expandedKeys;

  if (keys.has(pathKey)) {
    keys.delete(pathKey);
  } else {
    keys.add(pathKey);
  }

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
