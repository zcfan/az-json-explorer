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

function cloneTabForSession(tab) {
  return {
    id: tab.id,
    title: tab.title,
    path: [...tab.path],
    type: tab.type,
    closable: tab.closable,
    ...(tab.mode ? { mode: tab.mode } : {}),
    ...(tab.parsedType ? { parsedType: tab.parsedType } : {}),
    ...(tab.displayModeOverrides
      ? {
          displayModeOverrides: tab.displayModeOverrides.map((entry) => ({
            path: [...entry.path],
            mode: entry.mode,
          })),
        }
      : {}),
    ...(Number.isFinite(tab.valueLength) ? { valueLength: tab.valueLength } : {}),
  };
}

export function createViewSessionSnapshot(viewTabs, tabSearchStates) {
  return {
    version: 1,
    activeTabId: viewTabs.activeTabId,
    nextTabId: viewTabs.nextTabId,
    tabs: viewTabs.tabs.map((tab) => ({
      ...cloneTabForSession(tab),
      searchQuery: tabSearchStates.get(tab.id)?.query || '',
    })),
  };
}

function isValidPath(path) {
  return (
    Array.isArray(path) &&
    path.every(
      (segment) => typeof segment === 'string' || Number.isInteger(segment),
    )
  );
}

function restoreSessionTab(tab, index) {
  if (
    !tab ||
    typeof tab.id !== 'string' ||
    typeof tab.title !== 'string' ||
    !isValidPath(tab.path) ||
    (tab.type !== 'tree' && tab.type !== 'string') ||
    (index === 0 &&
      (tab.id !== 'root' ||
        tab.closable !== false ||
        tab.type !== 'tree' ||
        tab.path.length !== 0))
  ) {
    return null;
  }

  const restored = {
    id: tab.id,
    title: tab.title,
    path: [...tab.path],
    type: tab.type,
    closable: index === 0 ? false : true,
  };
  if (tab.mode === 'raw' || tab.mode === 'parsed') {
    restored.mode = tab.mode;
  }
  if (tab.parsedType === 'tree' || tab.parsedType === 'string') {
    restored.parsedType = tab.parsedType;
  }
  if (Array.isArray(tab.displayModeOverrides)) {
    restored.displayModeOverrides = tab.displayModeOverrides
      .filter(
        (entry) =>
          isValidPath(entry?.path) &&
          (entry.mode === 'raw' || entry.mode === 'parsed'),
      )
      .map((entry) => ({
        path: [...entry.path],
        mode: entry.mode,
      }));
  }
  if (Number.isFinite(tab.valueLength)) {
    restored.valueLength = tab.valueLength;
  }
  return restored;
}

export function restoreViewSessionSnapshot(session) {
  if (session?.version !== 1 || !Array.isArray(session.tabs)) {
    return {
      viewTabs: createViewTabsState(),
      tabSearchStates: new Map(),
    };
  }

  const tabs = session.tabs.map(restoreSessionTab);
  if (tabs.length === 0 || tabs.some((tab) => !tab)) {
    return {
      viewTabs: createViewTabsState(),
      tabSearchStates: new Map(),
    };
  }

  const uniqueIds = new Set(tabs.map((tab) => tab.id));
  if (uniqueIds.size !== tabs.length) {
    return {
      viewTabs: createViewTabsState(),
      tabSearchStates: new Map(),
    };
  }

  const activeTabId = uniqueIds.has(session.activeTabId)
    ? session.activeTabId
    : 'root';
  const nextTabId = Math.max(
    Number.isInteger(session.nextTabId) ? session.nextTabId : 1,
    ...tabs.map((tab) => {
      const match = /^view:(\d+)$/.exec(tab.id);
      return match ? Number(match[1]) + 1 : 1;
    }),
  );
  const tabSearchStates = new Map(
    session.tabs.map((tab) => [
      tab.id,
      {
        query: typeof tab.searchQuery === 'string' ? tab.searchQuery : '',
        results: [],
        selectedIndex: -1,
        truncated: false,
        ready: false,
      },
    ]),
  );

  return {
    viewTabs: {
      activeTabId,
      nextTabId,
      tabs,
    },
    tabSearchStates,
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
    ...(row.kind === 'string' && Number.isFinite(row.valueLength)
      ? { valueLength: row.valueLength }
      : {}),
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
