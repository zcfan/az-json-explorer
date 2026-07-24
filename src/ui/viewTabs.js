import { formatPath, pathKey } from '../core/path.js';

export function createViewTabsState() {
  return {
    activeTabId: 'root',
    nextTabId: 1,
    tabs: [
      {
        id: 'root',
        title: '$',
        path: [],
        type: 'tree',
        closable: false,
      },
    ],
  };
}

export function getIsolationViewType(row, viewRootPath = []) {
  if (pathKey(row.path) === pathKey(viewRootPath)) {
    return null;
  }

  return getViewTypeForKind(row.effectiveKind);
}

function getViewTypeForKind(kind) {
  if (kind === 'object' || kind === 'array') {
    return 'tree';
  }

  return kind === 'string' ? 'string' : null;
}

export function openIsolatedView(state, row, viewRootPath = []) {
  const type = getIsolationViewType(row, viewRootPath);
  if (!type) {
    return state;
  }

  const id = `view:${state.nextTabId}`;
  const baseTitle = formatPath(row.path);
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  const displayModeOverrides = [...(activeTab?.displayModeOverrides || [])];
  if (row.kind === 'string' && (row.parsed || row.hasParsed || row.canParseAsJson)) {
    const mode = row.parsed ? 'parsed' : 'raw';
    const ownPathKey = pathKey(row.path);
    const existingIndex = displayModeOverrides.findIndex(
      (entry) => pathKey(entry.path) === ownPathKey,
    );
    const ownOverride = { path: [...row.path], mode };
    if (existingIndex === -1) {
      displayModeOverrides.push(ownOverride);
    } else {
      displayModeOverrides[existingIndex] = ownOverride;
    }
  }
  const duplicateCount = state.tabs.filter(
    (tab) => tab.closable && pathKey(tab.path) === pathKey(row.path),
  ).length;
  const parsedType = getViewTypeForKind(
    row.parsedKind || (row.parsed ? row.effectiveKind : null),
  );
  const nextTab = {
    id,
    title: `${baseTitle}${duplicateCount > 0 ? ` (${duplicateCount})` : ''}`,
    path: [...row.path],
    type,
    ...(row.kind === 'string' && (row.parsed || row.hasParsed || row.canParseAsJson)
      ? { mode: row.parsed ? 'parsed' : 'raw' }
      : {}),
    ...(parsedType ? { parsedType } : {}),
    ...(displayModeOverrides.length > 0 ? { displayModeOverrides } : {}),
    closable: true,
    ...(row.kind === 'string' ? { valueLength: row.valueLength } : {}),
  };

  return {
    activeTabId: id,
    nextTabId: state.nextTabId + 1,
    tabs: [...state.tabs, nextTab],
  };
}

export function setViewTabPathMode(state, tabId, path, mode) {
  if (mode !== 'raw' && mode !== 'parsed') {
    return state;
  }

  const tabIndex = state.tabs.findIndex((tab) => tab.id === tabId);
  const tab = state.tabs[tabIndex];
  if (!tab?.closable || (mode === 'parsed' && pathKey(path) === pathKey(tab.path) && !tab.parsedType)) {
    return state;
  }

  const targetPathKey = pathKey(path);
  const displayModeOverrides = [...(tab.displayModeOverrides || [])];
  const existingIndex = displayModeOverrides.findIndex(
    (entry) => pathKey(entry.path) === targetPathKey,
  );
  const override = { path: [...path], mode };
  if (existingIndex === -1) {
    displayModeOverrides.push(override);
  } else {
    displayModeOverrides[existingIndex] = override;
  }

  const isViewRoot = targetPathKey === pathKey(tab.path);
  const nextTab = {
    ...tab,
    ...(isViewRoot
      ? {
          mode,
          type: mode === 'raw' ? 'string' : tab.parsedType,
        }
      : {}),
    displayModeOverrides,
  };
  const tabs = [...state.tabs];
  tabs[tabIndex] = nextTab;
  return { ...state, tabs };
}

export function activateViewTabParsedMode(state, tabId, parsedKind) {
  const parsedType = getViewTypeForKind(parsedKind);
  const tabIndex = state.tabs.findIndex((tab) => tab.id === tabId);
  const tab = state.tabs[tabIndex];
  if (!parsedType || !tab?.closable) {
    return state;
  }

  const tabs = [...state.tabs];
  tabs[tabIndex] = { ...tab, parsedType };
  return setViewTabPathMode({ ...state, tabs }, tabId, tab.path, 'parsed');
}

export function closeViewTab(state, tabId) {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index <= 0 || !state.tabs[index].closable) {
    return state;
  }

  const tabs = state.tabs.filter((tab) => tab.id !== tabId);
  const activeTabId =
    state.activeTabId === tabId
      ? tabs[Math.max(0, index - 1)].id
      : state.activeTabId;

  return { ...state, activeTabId, tabs };
}
