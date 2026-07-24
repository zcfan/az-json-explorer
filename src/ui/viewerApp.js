import { formatJsonText } from '../core/jsonFormat.js';
import {
  getParseShortcutLabel,
  getPasteShortcutLabel,
  getSearchNavigationDelta,
  isParseShortcut,
  isSearchShortcut,
  shouldRedirectPaste,
} from '../core/inputShortcuts.js';
import {
  dismissStandalonePerformanceHint,
  isStandalonePerformanceHintDismissed,
} from '../core/standalonePerformanceHint.js';
import { formatPath, pathKey } from '../core/treeModel.js';
import {
  createAllExpansionState,
  createExplicitExpansionState,
  createInitialExpansionState,
  ensureExpanded,
  expandRecursively,
  revealExpansionPaths,
  toggleExpansion,
} from './expansionState.js';
import { getRowSearchState, splitHighlightedText } from './searchHighlight.js';
import { createStringSearchSegments } from './stringSearchHighlight.js';
import {
  activateViewTabParsedMode,
  closeViewTab,
  createViewTabsState,
  getIsolationViewType,
  openIsolatedView,
  setViewTabPathMode,
} from './viewTabs.js';

const ROW_HEIGHT = 28;
const OVERSCAN_ROWS = 14;
const MAX_VISIBLE_ROWS = 100000;
const AUTO_EXPAND_MAX_ROWS = 5000;
const MAX_SEARCH_RESULTS = 500;
const SEARCH_DEBOUNCE_MS = 250;
const STRING_VIEW_PAGE_LENGTH = 128 * 1024;
const SAMPLE_JSON = JSON.stringify(
  {
    name: 'AZ JSON Explorer sample',
    count: 3,
    payload: '{"nested":true,"items":[{"id":1},{"id":2}]}',
    records: [
      { id: 1, status: 'open' },
      { id: 2, status: 'closed', extra: '[1,2,3]' },
    ],
  },
  null,
  2,
);

export function mountJsonViewer(host, options = {}) {
  const app = new JsonViewerApp(host, options);
  app.mount();
  return app;
}

class JsonViewerApp {
  constructor(host, options) {
    this.host = host;
    this.options = options;
    this.worker = null;
    this.pending = new Map();
    this.nextRequestId = 1;
    this.hasParsedRoot = false;
    this.rows = [];
    this.expansion = createExplicitExpansionState();
    this.renderToken = 0;
    this.scrollFrame = 0;
    this.hasRowLimit = false;
    this.searchTimer = 0;
    this.searchToken = 0;
    this.searchResults = [];
    this.selectedSearchIndex = -1;
    this.searchResultsTruncated = false;
    this.searchResultsReady = false;
    this.contextMenuRow = null;
    this.viewTabs = createViewTabsState();
    this.treeViewStates = new Map();
    this.tabSearchStates = new Map();
    this.stringViewState = null;
    this.stringViewRequestToken = 0;
    this.parsingViewTabIds = new Set();
  }

  mount() {
    this.shadow = this.host.shadowRoot || this.host.attachShadow({ mode: 'open' });
    this.shadow.replaceChildren(this.createShell());
    this.bindElements();
    this.bindEvents();
    this.createWorker();

    if (this.options.embedded) {
      this.elements.loader.hidden = true;
      this.setStatus('Waiting for JSON page...');
    }

    if (this.options.initialText && this.options.autoParse) {
      this.parseText(this.options.initialText);
    } else if (!this.options.embedded) {
      this.setStatus('Open a JSON file to start.');
    }
  }

  createShell() {
    const fragment = document.createDocumentFragment();
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = this.options.styleUrl || new URL('./styles.css', import.meta.url).href;
    fragment.append(style);

    const shell = document.createElement('main');
    shell.className = 'jt-app';
    shell.innerHTML = `
      <div class="jt-direct-file-banner" role="note" hidden>
        <span class="jt-performance-banner-message">
          For very large JSON files, use Standalone Viewer > Open file for better performance.
        </span>
        <button
          class="jt-performance-banner-close"
          data-action="dismiss-performance-hint"
          type="button"
          aria-label="Dismiss performance hint"
          hidden
        >×</button>
      </div>
      <header class="jt-toolbar">
        <div class="jt-title">
          <strong>AZ JSON Explorer</strong>
          <span class="jt-source"></span>
        </div>
      </header>
      <section class="jt-loader">
        <textarea class="jt-manual-input" spellcheck="false" placeholder="Paste JSON"></textarea>
        <div class="jt-loader-actions">
          <button class="jt-button jt-button-primary" data-action="parse-manual" type="button">Parse input</button>
          <button class="jt-button jt-button-secondary" data-action="format-manual" type="button">Format JSON</button>
          <label class="jt-file-button">
            Open file
            <input class="jt-file-input" type="file" accept=".json,application/json,text/plain">
          </label>
          <button class="jt-button jt-button-secondary" data-action="load-sample" type="button">Sample</button>
        </div>
      </section>
      <nav class="jt-tabs" role="tablist" aria-label="Open JSON views" hidden></nav>
      <section class="jt-view-controls">
        <div class="jt-expansion-controls">
          <button class="jt-button jt-button-secondary" data-action="collapse-all" type="button">Collapse</button>
          <button class="jt-button jt-button-secondary" data-action="expand-root" type="button">Expand root</button>
          <button class="jt-button jt-button-secondary" data-action="expand-all" type="button">Expand all</button>
        </div>
        <div class="jt-string-controls" hidden>
          <button class="jt-button jt-copy-all-button" data-action="string-view-copy-all" type="button">Copy all</button>
        </div>
        <div class="jt-search-controls">
          <label class="jt-search">
            <span>Search</span>
            <input class="jt-search-input" type="search" placeholder="Full text" autocomplete="off">
          </label>
          <button class="jt-button jt-button-secondary jt-search-prev" data-action="search-prev" type="button" disabled>Prev</button>
          <button class="jt-button jt-button-secondary jt-search-next" data-action="search-next" type="button" disabled>Next</button>
          <span class="jt-search-count">0 matches</span>
        </div>
      </section>
      <div class="jt-status" role="status"></div>
      <div class="jt-search-preview" hidden></div>
      <div class="jt-error" hidden></div>
      <section class="jt-tree" tabindex="0" aria-label="JSON tree">
        <div class="jt-spacer"></div>
        <div class="jt-row-layer"></div>
      </section>
      <section class="jt-string-view" aria-label="String value" hidden>
        <div
          class="jt-string-view-text"
          tabindex="0"
          role="region"
          aria-label="Full string value with line numbers"
        ></div>
      </section>
      <div class="jt-context-menu" role="menu" hidden>
        <button class="jt-context-menu-item" data-action="copy-value" type="button" role="menuitem">Copy value</button>
        <button class="jt-context-menu-item" data-action="copy-path" type="button" role="menuitem">Copy path</button>
        <button class="jt-context-menu-item" data-action="copy-javascript-string-literal" type="button" role="menuitem">Copy string as JavaScript literal</button>
        <button class="jt-context-menu-item" data-action="copy-json-string-literal" type="button" role="menuitem">Copy string as JSON literal</button>
        <button class="jt-context-menu-item" data-action="open-isolated-view" type="button" role="menuitem">View in isolated view</button>
        <div class="jt-context-menu-separator" role="separator"></div>
        <button class="jt-context-menu-item" data-action="expand-recursively" type="button" role="menuitem">Expand recursively</button>
      </div>
    `;
    fragment.append(shell);
    return fragment;
  }

  bindElements() {
    this.elements = {
      directFileBanner: this.shadow.querySelector('.jt-direct-file-banner'),
      performanceBannerMessage: this.shadow.querySelector('.jt-performance-banner-message'),
      performanceBannerClose: this.shadow.querySelector(
        '[data-action="dismiss-performance-hint"]',
      ),
      source: this.shadow.querySelector('.jt-source'),
      loader: this.shadow.querySelector('.jt-loader'),
      manualInput: this.shadow.querySelector('.jt-manual-input'),
      parseManualButton: this.shadow.querySelector('[data-action="parse-manual"]'),
      formatManualButton: this.shadow.querySelector('[data-action="format-manual"]'),
      fileInput: this.shadow.querySelector('.jt-file-input'),
      viewControls: this.shadow.querySelector('.jt-view-controls'),
      expansionControls: this.shadow.querySelector('.jt-expansion-controls'),
      stringControls: this.shadow.querySelector('.jt-string-controls'),
      searchInput: this.shadow.querySelector('.jt-search-input'),
      searchPrevButton: this.shadow.querySelector('[data-action="search-prev"]'),
      searchNextButton: this.shadow.querySelector('[data-action="search-next"]'),
      searchCount: this.shadow.querySelector('.jt-search-count'),
      searchPreview: this.shadow.querySelector('.jt-search-preview'),
      tabs: this.shadow.querySelector('.jt-tabs'),
      status: this.shadow.querySelector('.jt-status'),
      error: this.shadow.querySelector('.jt-error'),
      tree: this.shadow.querySelector('.jt-tree'),
      spacer: this.shadow.querySelector('.jt-spacer'),
      rowLayer: this.shadow.querySelector('.jt-row-layer'),
      loadSampleButton: this.shadow.querySelector('[data-action="load-sample"]'),
      collapseAllButton: this.shadow.querySelector('[data-action="collapse-all"]'),
      expandRootButton: this.shadow.querySelector('[data-action="expand-root"]'),
      expandAllButton: this.shadow.querySelector('[data-action="expand-all"]'),
      contextMenu: this.shadow.querySelector('.jt-context-menu'),
      openIsolatedViewButton: this.shadow.querySelector('[data-action="open-isolated-view"]'),
      copyValueButton: this.shadow.querySelector('[data-action="copy-value"]'),
      copyPathButton: this.shadow.querySelector('[data-action="copy-path"]'),
      copyJavaScriptStringLiteralButton: this.shadow.querySelector(
        '[data-action="copy-javascript-string-literal"]',
      ),
      copyJsonStringLiteralButton: this.shadow.querySelector(
        '[data-action="copy-json-string-literal"]',
      ),
      contextMenuSeparator: this.shadow.querySelector('.jt-context-menu-separator'),
      expandRecursivelyButton: this.shadow.querySelector('[data-action="expand-recursively"]'),
      stringView: this.shadow.querySelector('.jt-string-view'),
      stringViewText: this.shadow.querySelector('.jt-string-view-text'),
      stringViewCopyAllButton: this.shadow.querySelector(
        '[data-action="string-view-copy-all"]',
      ),
    };

    this.elements.source.textContent = this.options.sourceLabel || '';
    const parseShortcut = getParseShortcutLabel();
    const pasteShortcut = getPasteShortcutLabel();
    this.elements.parseManualButton.textContent = `Parse input (${parseShortcut})`;
    this.elements.manualInput.placeholder =
      `Paste JSON, or press ${pasteShortcut} anywhere to paste here`;
  }

  bindEvents() {
    this.elements.performanceBannerClose.addEventListener('click', () => {
      this.dismissStandalonePerformanceBanner();
    });

    this.elements.parseManualButton.addEventListener('click', () => {
      this.parseManualInput();
    });

    this.elements.manualInput.addEventListener('keydown', (event) => {
      if (!isParseShortcut(event)) {
        return;
      }

      event.preventDefault();
      this.parseManualInput();
    });

    this.host.ownerDocument.addEventListener('keydown', (event) => {
      if (!isSearchShortcut(event)) {
        return;
      }

      event.preventDefault();
      this.elements.searchInput.focus();
    });

    if (!this.options.embedded) {
      this.host.ownerDocument.addEventListener('paste', (event) => {
        const target = event.composedPath?.()[0] || event.target;
        if (!shouldRedirectPaste(target)) {
          return;
        }

        const text = event.clipboardData?.getData('text/plain');
        if (typeof text !== 'string') {
          return;
        }

        event.preventDefault();
        const { manualInput } = this.elements;
        manualInput.focus();
        const start = manualInput.selectionStart ?? manualInput.value.length;
        const end = manualInput.selectionEnd ?? manualInput.value.length;
        manualInput.setRangeText(text, start, end, 'end');
        manualInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      });
    }

    this.elements.formatManualButton.addEventListener('click', () => {
      this.formatManualInput();
    });

    this.elements.loadSampleButton.addEventListener('click', () => {
      this.parseText(SAMPLE_JSON);
    });

    this.elements.fileInput.addEventListener('change', async (event) => {
      const [file] = event.currentTarget.files || [];
      if (!file) {
        return;
      }

      this.parseFile(file);
      event.currentTarget.value = '';
    });

    this.elements.searchInput.addEventListener('input', () => {
      this.scheduleSearch();
    });

    this.elements.searchInput.addEventListener('keydown', (event) => {
      const delta = getSearchNavigationDelta(event);
      if (delta === 0) {
        return;
      }

      event.preventDefault();
      this.selectSearchResult(delta);
    });

    this.elements.searchPrevButton.addEventListener('click', () => {
      this.selectSearchResult(-1);
    });

    this.elements.searchNextButton.addEventListener('click', () => {
      this.selectSearchResult(1);
    });

    this.elements.collapseAllButton.addEventListener('click', () => {
      this.expansion = createExplicitExpansionState();
      this.refreshRows();
    });

    this.elements.expandRootButton.addEventListener('click', () => {
      this.expansion = createExplicitExpansionState([pathKey(this.getActiveTab().path)]);
      this.refreshRows();
    });

    this.elements.expandAllButton.addEventListener('click', () => {
      this.expansion = createAllExpansionState();
      this.refreshRows({ pendingStatus: 'Expanding all...' });
    });

    this.elements.copyValueButton.addEventListener('click', () => {
      this.copyContextMenuNode('value', 'value');
    });

    this.elements.copyPathButton.addEventListener('click', () => {
      this.copyContextMenuPath();
    });

    this.elements.copyJavaScriptStringLiteralButton.addEventListener('click', () => {
      this.copyContextMenuNode('javascript-string-literal', 'JavaScript string literal');
    });

    this.elements.copyJsonStringLiteralButton.addEventListener('click', () => {
      this.copyContextMenuNode('json-string-literal', 'JSON string literal');
    });

    this.elements.expandRecursivelyButton.addEventListener('click', () => {
      this.expandContextMenuRowRecursively();
    });

    this.elements.openIsolatedViewButton.addEventListener('click', () => {
      const row = this.contextMenuRow;
      this.closeContextMenu();
      if (row) {
        this.openRowInIsolatedView(row);
      }
    });

    this.elements.stringViewText.addEventListener('scroll', () => {
      this.handleStringViewScroll();
    });

    this.elements.stringViewCopyAllButton.addEventListener('click', () => {
      this.copyFullStringViewValue();
    });

    this.shadow.addEventListener('click', (event) => {
      if (this.elements.contextMenu.hidden) {
        return;
      }

      if (!event.composedPath().includes(this.elements.contextMenu)) {
        this.closeContextMenu();
      }
    });

    this.shadow.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeContextMenu();
      }
    });

    this.elements.tree.addEventListener('scroll', () => {
      this.closeContextMenu();

      if (this.scrollFrame) {
        return;
      }

      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = 0;
        this.renderVisibleRows();
      });
    });
  }

  parseManualInput() {
    const text = this.elements.manualInput.value;
    if (!text.trim()) {
      this.clearError();
      this.setStatus('Paste JSON input to parse.');
      return;
    }

    this.setSourceLabel('Manual input');
    this.parseText(text);
  }

  formatManualInput() {
    const text = this.elements.manualInput.value;
    if (!text.trim()) {
      this.clearError();
      this.setStatus('Paste JSON input to format.');
      return;
    }

    try {
      this.elements.manualInput.value = formatJsonText(text);
      this.clearError();
      this.setStatus('Formatted JSON input.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(`JSON format failed: ${message}`);
    }
  }

  createWorker() {
    this.worker = new Worker(this.options.workerUrl, { type: 'module' });
    this.worker.addEventListener('message', (event) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }

      this.pending.delete(response.id);
      pending.resolve(response);
    });
    this.worker.addEventListener('error', (event) => {
      for (const pending of this.pending.values()) {
        pending.reject(event.error || new Error(event.message));
      }
      this.pending.clear();
    });
  }

  requestWorker(type, payload) {
    const id = `${type}-${this.nextRequestId++}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, ...payload });
    });
  }

  async parseText(text) {
    const rawText = String(text || '');
    this.resetViewTabs();
    this.clearSearchResults();
    this.clearError();
    this.setStatus('Parsing in worker...');
    this.elements.rowLayer.replaceChildren();
    this.elements.spacer.style.height = '0px';

    const response = await this.requestWorker('parse-root', {
      text: rawText,
      nodeCountLimit: AUTO_EXPAND_MAX_ROWS,
    });
    if (!response.ok) {
      this.hasParsedRoot = false;
      this.rows = [];
      this.showError(response.error);
      this.setStatus('JSON parse failed.');
      return;
    }

    this.hasParsedRoot = true;
    this.expansion = createInitialExpansionState(response.nodeCount, pathKey([]));
    await this.refreshRowsAndSearch();
  }

  async parseFile(file, sourceLabel = '') {
    this.resetViewTabs();
    this.clearSearchResults();
    this.clearError();
    this.setSourceLabel(sourceLabel || file.name || 'Local file');
    this.setStatus('Reading and parsing file in worker...');
    this.elements.rowLayer.replaceChildren();
    this.elements.spacer.style.height = '0px';

    const response = await this.requestWorker('parse-root', {
      file,
      nodeCountLimit: AUTO_EXPAND_MAX_ROWS,
    });
    if (!response.ok) {
      this.hasParsedRoot = false;
      this.rows = [];
      this.showError(response.error);
      this.setStatus('JSON parse failed.');
      return;
    }

    this.hasParsedRoot = true;
    this.expansion = createInitialExpansionState(response.nodeCount, pathKey([]));
    await this.refreshRowsAndSearch();
  }

  async refreshRows(options = {}) {
    if (!this.hasParsedRoot) {
      return;
    }

    const activeTabId = this.viewTabs.activeTabId;
    const token = ++this.renderToken;
    this.setStatus(options.pendingStatus || 'Preparing visible rows...');
    const response = await this.requestWorker('collect-visible-rows', {
      rootPath: this.getActiveTab().path,
      rootMode: this.getActiveTab().mode,
      displayModeOverrides: this.getActiveTab().displayModeOverrides,
      expansionMode: this.expansion.mode,
      expandedKeys: Array.from(this.expansion.expandedKeys),
      collapsedKeys: Array.from(this.expansion.collapsedKeys),
      recursiveExpandedKeys: Array.from(this.expansion.recursiveExpandedKeys),
      maxRows: MAX_VISIBLE_ROWS,
      yieldEvery: 500,
    });

    if (token !== this.renderToken || activeTabId !== this.viewTabs.activeTabId) {
      return;
    }

    if (!response.ok) {
      this.showError(response.error);
      this.setStatus('Visible row preparation failed.');
      return;
    }

    this.rows = response.rows;
    this.hasRowLimit = response.truncated;
    this.elements.spacer.style.height = `${this.rows.length * ROW_HEIGHT}px`;
    this.renderVisibleRows();
    this.setStatus(this.createStatusText());
  }

  async refreshRowsAndSearch() {
    const query = this.elements.searchInput.value.trim();
    if (query) {
      this.clearSearchResults('Searching...');
    }

    await this.refreshRows();
    if (query) {
      await this.runFullTextSearch(query);
    }
  }

  createStatusText() {
    const suffix = this.hasRowLimit
      ? ` Showing first ${MAX_VISIBLE_ROWS.toLocaleString()} visible rows.`
      : '';
    return `${this.rows.length.toLocaleString()} visible rows.${suffix}`;
  }

  renderVisibleRows() {
    const { tree } = this.elements;
    const viewportHeight = tree.clientHeight || 600;
    const first = Math.max(0, Math.floor(tree.scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
    const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN_ROWS * 2;
    const last = Math.min(this.rows.length, first + visibleCount);
    const fragment = document.createDocumentFragment();

    for (let index = first; index < last; index += 1) {
      fragment.append(this.createRowElement(this.rows[index], index));
    }

    this.elements.rowLayer.replaceChildren(fragment);
  }

  createRowElement(row, index) {
    const element = document.createElement('div');
    const searchState = getRowSearchState(row, this.searchResults, this.selectedSearchIndex);
    element.className = [
      'jt-row',
      `jt-kind-${row.kind}`,
      row.expandable ? 'jt-row-expandable' : '',
      searchState.highlighted ? 'jt-row-search-hit' : '',
      searchState.current ? 'jt-row-search-current' : '',
    ]
      .filter(Boolean)
      .join(' ');
    element.style.transform = `translateY(${index * ROW_HEIGHT}px)`;
    element.title = formatPath(row.path);
    element.addEventListener('contextmenu', (event) => this.openRowContextMenu(event, row));
    if (row.expandable) {
      element.addEventListener('click', (event) => {
        const clickedEmptyArea =
          event.target === element || event.target.classList.contains('jt-indent');
        const hasTextSelection = window.getSelection()?.isCollapsed === false;
        if (!clickedEmptyArea || hasTextSelection) {
          return;
        }

        this.toggleExpanded(row);
      });
    }

    const indent = document.createElement('span');
    indent.className = 'jt-indent';
    indent.style.width = `${row.depth * 18}px`;
    element.append(indent);

    const toggle = document.createElement('button');
    const toggleClasses = [
      'jt-toggle',
      row.expandable ? '' : 'jt-toggle-empty',
      row.expanded ? 'jt-toggle-expanded' : '',
    ];
    toggle.className = toggleClasses.filter(Boolean).join(' ');
    toggle.type = 'button';
    toggle.disabled = !row.expandable;
    if (row.expandable) {
      toggle.setAttribute('aria-label', row.expanded ? 'Collapse' : 'Expand');
      toggle.title = row.expanded ? 'Collapse' : 'Expand';

      const chevron = document.createElement('span');
      chevron.className = 'jt-toggle-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      toggle.append(chevron);

      toggle.addEventListener('click', () => this.toggleExpanded(row));
    } else {
      toggle.setAttribute('aria-hidden', 'true');
    }
    element.append(toggle);

    const key = document.createElement('span');
    key.className = row.key === '$' ? 'jt-key' : 'jt-key jt-key-copyable';
    if (row.key !== '$') {
      key.title = `Copy path: ${row.copyPath}`;
    }
    this.appendHighlightedText(key, row.key === '$' ? '$' : JSON.stringify(row.key), {
      active: searchState.keyMatched,
    });
    element.append(key);

    if (row.key !== '$') {
      const colon = document.createElement('span');
      colon.className = 'jt-colon';
      colon.textContent = ':';
      element.append(colon);
    }

    if (row.canParseAsJson && !row.hasParsed) {
      const parseButton = document.createElement('button');
      parseButton.className = 'jt-parse-button';
      parseButton.type = 'button';
      parseButton.textContent = 'Parse as JSON';
      parseButton.addEventListener('click', () => this.parseStringRow(row));
      element.append(parseButton);
    }

    if (row.hasParsed) {
      const activeTab = this.getActiveTab();
      const badge = document.createElement('button');
      badge.className = row.parsed ? 'jt-badge jt-badge-parsed' : 'jt-badge jt-badge-raw';
      badge.type = 'button';
      badge.textContent = row.parsed ? 'parsed' : 'raw';
      const nextModeLabel = row.parsed ? 'original string' : 'cached parsed value';
      badge.title = activeTab.closable
        ? `Show ${nextModeLabel} in this tab`
        : `Show ${nextModeLabel}`;
      badge.addEventListener('click', () => {
        if (activeTab.closable) {
          this.toggleTabParsedDisplay(row);
        } else {
          this.toggleParsedDisplay(row);
        }
      });
      element.append(badge);
    }

    const value = document.createElement('span');
    value.className = `jt-value jt-effective-${row.effectiveKind}`;
    this.appendHighlightedText(value, this.formatRowValue(row), {
      active: searchState.valueMatched,
    });
    element.append(value);

    if (row.valueTruncated) {
      const viewAllButton = document.createElement('button');
      viewAllButton.className = 'jt-view-all-button';
      viewAllButton.type = 'button';
      viewAllButton.textContent = 'View all';
      viewAllButton.addEventListener('click', (event) => {
        event.stopPropagation();
        this.openRowInIsolatedView(row);
      });
      element.append(viewAllButton);
    }

    if (row.parseError) {
      const error = document.createElement('span');
      error.className = 'jt-inline-error';
      error.textContent = row.parseError;
      element.append(error);
    }

    return element;
  }

  appendHighlightedText(parent, text, options = {}) {
    if (!options.active) {
      parent.textContent = text;
      return;
    }

    const query = this.elements.searchInput.value.trim();
    const parts = splitHighlightedText(text, query);
    const fragment = document.createDocumentFragment();

    for (const part of parts) {
      const child = document.createElement(part.highlighted ? 'mark' : 'span');
      if (part.highlighted) {
        child.className = 'jt-search-mark';
      }
      child.textContent = part.text;
      fragment.append(child);
    }

    parent.replaceChildren(fragment);
  }

  formatRowValue(row) {
    return row.displayValue;
  }

  async openStringView(tab) {
    this.stringViewState = {
      tabId: tab.id,
      path: [...tab.path],
      mode: tab.mode,
      displayModeOverrides: tab.displayModeOverrides,
      offset: 0,
      nextOffset: 0,
      lineNumber: 1,
      nextLineNumber: 1,
      totalLength: tab.valueLength,
      hasNext: false,
      history: [],
      pageText: '',
      pageHasNext: false,
      loading: true,
    };
    this.elements.stringViewText.textContent = '';
    this.elements.stringViewCopyAllButton.disabled = true;
    this.elements.stringViewCopyAllButton.textContent = 'Copy all';
    this.elements.stringViewCopyAllButton.title = '';
    this.setStatus(`${tab.title} · length ${tab.valueLength.toLocaleString()}`);

    await this.loadStringViewPage(0, 1);
  }

  async loadStringViewPage(offset, lineNumber, position = 'start') {
    const state = this.stringViewState;
    if (!state) {
      return;
    }

    state.loading = true;
    const token = ++this.stringViewRequestToken;

    try {
      const response = await this.requestWorker('read-string-range', {
        path: state.path,
        displayModeOverrides: state.displayModeOverrides,
        effective: state.mode === 'parsed',
        offset,
        length: STRING_VIEW_PAGE_LENGTH,
      });
      if (
        token !== this.stringViewRequestToken ||
        state !== this.stringViewState ||
        state.tabId !== this.viewTabs.activeTabId
      ) {
        return;
      }

      if (!response.ok) {
        this.elements.stringViewText.textContent =
          response.error || 'Unable to read string.';
        state.loading = false;
        return;
      }

      state.offset = response.offset;
      state.nextOffset = response.nextOffset;
      state.lineNumber = lineNumber;
      state.pageText = response.text;
      state.pageHasNext = response.hasNext;
      state.nextLineNumber = this.renderStringViewLines(
        response.text,
        lineNumber,
        response.hasNext,
      );
      state.totalLength = response.totalLength;
      state.hasNext = response.hasNext;
      const maxScrollTop = Math.max(
        0,
        this.elements.stringViewText.scrollHeight -
          this.elements.stringViewText.clientHeight,
      );
      if (position === 'end') {
        this.elements.stringViewText.scrollTop = Math.max(0, maxScrollTop - 1);
      } else {
        this.elements.stringViewText.scrollTop =
          state.history.length > 0 && maxScrollTop > 0 ? 1 : 0;
      }
      this.elements.stringViewCopyAllButton.disabled = false;
      requestAnimationFrame(() => {
        if (state === this.stringViewState) {
          state.loading = false;
        }
      });
    } catch (error) {
      if (token !== this.stringViewRequestToken || state !== this.stringViewState) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.elements.stringViewText.textContent = `Unable to read string: ${message}`;
      state.loading = false;
    }
  }

  renderStringViewLines(text, firstLineNumber, hasNext) {
    const lines = [];
    const lineBreakPattern = /\r\n|[\n\r\u2028\u2029]/g;
    let lineStart = 0;
    let lineBreak;

    while ((lineBreak = lineBreakPattern.exec(text)) !== null) {
      lines.push({
        text: text.slice(lineStart, lineBreak.index),
        offset: lineStart,
      });
      lineStart = lineBreak.index + lineBreak[0].length;
    }
    lines.push({
      text: text.slice(lineStart),
      offset: lineStart,
    });

    const lineBreakCount = lines.length - 1;
    if (hasNext && lineBreakCount > 0 && lines.at(-1).text === '') {
      lines.pop();
    }

    const fragment = document.createDocumentFragment();
    const lastLineNumber = firstLineNumber + Math.max(0, lines.length - 1);
    this.elements.stringViewText.style.setProperty(
      '--jt-line-number-digits',
      Math.max(2, String(lastLineNumber).length),
    );

    lines.forEach((line, index) => {
      const row = document.createElement('div');
      row.className = 'jt-string-view-line';

      const number = document.createElement('span');
      number.className = 'jt-string-view-line-number';
      number.setAttribute('aria-hidden', 'true');
      number.textContent = String(firstLineNumber + index);

      const content = document.createElement('span');
      content.className = 'jt-string-view-line-text';
      const absoluteOffset = (this.stringViewState?.offset || 0) + line.offset;
      const segments = createStringSearchSegments(
        line.text,
        absoluteOffset,
        this.searchResults,
        this.selectedSearchIndex,
      );
      for (const segment of segments) {
        const child = document.createElement(segment.highlighted ? 'mark' : 'span');
        if (segment.highlighted) {
          child.className = segment.current
            ? 'jt-search-mark jt-string-search-current'
            : 'jt-search-mark';
        }
        child.textContent = segment.text;
        content.append(child);
      }

      row.append(number, content);
      fragment.append(row);
    });

    this.elements.stringViewText.replaceChildren(fragment);
    return firstLineNumber + lineBreakCount;
  }

  rerenderStringViewPage() {
    const state = this.stringViewState;
    if (!state) {
      return;
    }

    const scrollTop = this.elements.stringViewText.scrollTop;
    state.nextLineNumber = this.renderStringViewLines(
      state.pageText,
      state.lineNumber,
      state.pageHasNext,
    );
    this.elements.stringViewText.scrollTop = scrollTop;
  }

  handleStringViewScroll() {
    const state = this.stringViewState;
    const viewport = this.elements.stringViewText;
    if (!state || state.loading || viewport.scrollHeight <= viewport.clientHeight) {
      return;
    }

    if (
      state.hasNext &&
      viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 1
    ) {
      this.showNextStringViewPage();
      return;
    }

    if (state.history.length > 0 && viewport.scrollTop <= 0) {
      this.showPreviousStringViewPage();
    }
  }

  showNextStringViewPage() {
    const state = this.stringViewState;
    if (!state?.hasNext) {
      return;
    }

    state.history.push({
      offset: state.offset,
      lineNumber: state.lineNumber,
    });
    this.loadStringViewPage(state.nextOffset, state.nextLineNumber, 'start');
  }

  showPreviousStringViewPage() {
    const state = this.stringViewState;
    const page = state?.history.pop();
    if (!page) {
      return;
    }

    this.loadStringViewPage(page.offset, page.lineNumber, 'end');
  }

  async copyFullStringViewValue() {
    const state = this.stringViewState;
    if (!state) {
      return;
    }

    this.elements.stringViewCopyAllButton.disabled = true;
    try {
      const response = await this.requestWorker('copy-node', {
        path: state.path,
        displayModeOverrides: state.displayModeOverrides,
        format: state.mode === 'parsed' ? 'value' : 'raw-string',
      });
      if (state !== this.stringViewState) {
        return;
      }

      if (!response.ok) {
        this.elements.stringViewCopyAllButton.textContent = 'Copy failed';
        this.elements.stringViewCopyAllButton.title =
          response.error || 'Unable to copy full value.';
        return;
      }

      await navigator.clipboard.writeText(response.text);
      if (state === this.stringViewState) {
        this.elements.stringViewCopyAllButton.textContent = 'Copied';
      }
    } catch (error) {
      if (state !== this.stringViewState) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.elements.stringViewCopyAllButton.textContent = 'Copy failed';
      this.elements.stringViewCopyAllButton.title = message;
    } finally {
      if (state === this.stringViewState) {
        this.elements.stringViewCopyAllButton.disabled = false;
      }
    }
  }

  clearStringView() {
    this.stringViewRequestToken += 1;
    this.stringViewState = null;
    this.elements.stringViewText.textContent = '';
    this.elements.stringViewCopyAllButton.disabled = true;
    this.elements.stringViewCopyAllButton.textContent = 'Copy all';
    this.elements.stringViewCopyAllButton.title = '';
  }

  getActiveTab() {
    return (
      this.viewTabs.tabs.find((tab) => tab.id === this.viewTabs.activeTabId) ||
      this.viewTabs.tabs[0]
    );
  }

  resetViewTabs() {
    this.clearStringView();
    this.parsingViewTabIds.clear();
    this.viewTabs = createViewTabsState();
    this.treeViewStates.clear();
    this.tabSearchStates.clear();
    this.renderTabs();
    this.elements.viewControls.hidden = false;
    this.elements.expansionControls.hidden = false;
    this.elements.stringControls.hidden = true;
    this.elements.tree.hidden = false;
    this.elements.stringView.hidden = true;
  }

  saveActiveViewState() {
    const tab = this.getActiveTab();
    this.tabSearchStates.set(tab.id, {
      query: this.elements.searchInput.value,
      results: [...this.searchResults],
      selectedIndex: this.selectedSearchIndex,
      truncated: this.searchResultsTruncated,
      ready: this.searchResultsReady,
    });

    if (tab.type !== 'tree') {
      return;
    }

    this.treeViewStates.set(tab.id, {
      expansion: this.expansion,
      scrollTop: this.elements.tree.scrollTop,
    });
  }

  renderTabs() {
    const fragment = document.createDocumentFragment();
    this.elements.tabs.hidden = this.viewTabs.tabs.length < 2;

    for (const tab of this.viewTabs.tabs) {
      const isActive = tab.id === this.viewTabs.activeTabId;
      const item = document.createElement('div');
      item.className = `jt-tab${isActive ? ' jt-tab-active' : ''}`;
      item.setAttribute('role', 'presentation');
      item.title = tab.title;

      const select = document.createElement('button');
      select.className = 'jt-tab-select';
      select.type = 'button';
      select.disabled = isActive;
      select.setAttribute('role', 'tab');
      select.setAttribute('aria-selected', String(isActive));
      select.addEventListener('click', () => this.activateViewTab(tab.id));

      const title = document.createElement('span');
      title.className = 'jt-tab-title';
      const titleText = document.createElement('span');
      titleText.className = 'jt-tab-title-text';
      titleText.textContent = tab.title;
      title.append(titleText);
      select.append(title);
      item.append(select);

      if (tab.mode) {
        const mode = document.createElement('button');
        mode.className = `jt-tab-mode jt-badge jt-badge-${tab.mode}`;
        mode.type = 'button';
        mode.disabled = this.parsingViewTabIds.has(tab.id);
        mode.textContent = tab.mode;
        mode.setAttribute(
          'aria-label',
          `Show ${tab.mode === 'parsed' ? 'raw' : 'parsed'} value in this tab`,
        );
        mode.title = `Show ${tab.mode === 'parsed' ? 'raw' : 'parsed'} value in this tab`;
        mode.addEventListener('click', () => this.toggleIsolatedTabMode(tab.id));
        item.append(mode);
      }

      if (tab.closable) {
        const close = document.createElement('button');
        close.className = 'jt-tab-close';
        close.type = 'button';
        close.textContent = '×';
        close.setAttribute('aria-label', `Close ${tab.title}`);
        close.addEventListener('click', () => this.closeViewTab(tab.id));
        item.append(close);
      }

      fragment.append(item);
    }

    this.elements.tabs.replaceChildren(fragment);
  }

  async activateViewTab(tabId) {
    if (tabId === this.viewTabs.activeTabId) {
      return;
    }

    this.saveActiveViewState();
    this.viewTabs = { ...this.viewTabs, activeTabId: tabId };
    this.renderTabs();
    await this.showActiveView();
  }

  async toggleIsolatedTabMode(tabId) {
    const tab = this.viewTabs.tabs.find((candidate) => candidate.id === tabId);
    if (!tab?.mode || this.parsingViewTabIds.has(tabId)) {
      return;
    }

    const isActive = tab.id === this.viewTabs.activeTabId;
    if (isActive) {
      this.saveActiveViewState();
    }

    if (tab.mode === 'raw' && !tab.parsedType) {
      this.parsingViewTabIds.add(tabId);
      this.renderTabs();
      if (tab.id === this.viewTabs.activeTabId) {
        this.setStatus(`Parsing ${tab.title} for this tab...`);
      }

      try {
        const response = await this.requestWorker('parse-string', {
          path: tab.path,
          displayModeOverrides: tab.displayModeOverrides,
          activateDisplay: false,
        });
        if (!response.ok) {
          this.showError(response.error);
          if (tab.id === this.viewTabs.activeTabId) {
            this.setStatus(`${tab.title} remains in raw mode.`);
          }
          return;
        }

        this.viewTabs = activateViewTabParsedMode(
          this.viewTabs,
          tab.id,
          response.parsedKind,
        );
        this.clearError();
        if (tab.id === this.viewTabs.activeTabId) {
          await this.showActiveView();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.showError(`Parse failed: ${message}`);
        if (tab.id === this.viewTabs.activeTabId) {
          this.setStatus(`${tab.title} remains in raw mode.`);
        }
      } finally {
        this.parsingViewTabIds.delete(tabId);
        this.renderTabs();
      }
      return;
    }

    const nextMode = tab.mode === 'parsed' ? 'raw' : 'parsed';
    this.viewTabs = setViewTabPathMode(this.viewTabs, tab.id, tab.path, nextMode);
    this.renderTabs();
    if (isActive) {
      await this.showActiveView();
    }
  }

  async showActiveView() {
    const tab = this.getActiveTab();
    const search = this.tabSearchStates.get(tab.id);
    this.closeContextMenu();
    this.clearSearchResults();
    this.elements.searchInput.value = search?.query || '';
    this.searchResults = [...(search?.results || [])];
    this.selectedSearchIndex = search?.selectedIndex ?? -1;
    this.searchResultsTruncated = search?.truncated ?? false;
    this.searchResultsReady = search?.ready ?? false;

    if (tab.type === 'string') {
      this.renderToken += 1;
      this.elements.viewControls.hidden = false;
      this.elements.expansionControls.hidden = true;
      this.elements.stringControls.hidden = false;
      this.elements.tree.hidden = true;
      this.elements.stringView.hidden = false;
      await this.openStringView(tab);
      if (tab.id !== this.viewTabs.activeTabId) {
        return;
      }

      if (search?.ready) {
        await this.updateSearchUi(search.truncated, {
          reveal: this.selectedSearchIndex >= 0,
        });
      } else if (search?.query) {
        this.scheduleSearch();
      }
      return;
    }

    this.clearStringView();
    this.elements.viewControls.hidden = false;
    this.elements.expansionControls.hidden = false;
    this.elements.stringControls.hidden = true;
    this.elements.tree.hidden = false;
    this.elements.stringView.hidden = true;
    const state = this.treeViewStates.get(tab.id);
    this.expansion =
      state?.expansion || createExplicitExpansionState([pathKey(tab.path)]);
    this.elements.tree.scrollTop = 0;
    await this.refreshRows();
    if (tab.id !== this.viewTabs.activeTabId) {
      return;
    }

    if (state) {
      this.elements.tree.scrollTop = state.scrollTop;
      this.renderVisibleRows();
    }

    if (search?.ready) {
      await this.updateSearchUi(search.truncated, { reveal: false });
    } else if (search?.query) {
      this.scheduleSearch();
    }
  }

  async openRowInIsolatedView(row) {
    if (!getIsolationViewType(row, this.getActiveTab().path)) {
      return;
    }

    this.saveActiveViewState();
    this.viewTabs = openIsolatedView(this.viewTabs, row, this.getActiveTab().path);
    this.renderTabs();
    await this.showActiveView();
  }

  async closeViewTab(tabId) {
    const wasActive = tabId === this.viewTabs.activeTabId;
    this.viewTabs = closeViewTab(this.viewTabs, tabId);
    this.treeViewStates.delete(tabId);
    this.tabSearchStates.delete(tabId);
    this.renderTabs();
    if (wasActive) {
      await this.showActiveView();
    }
  }

  openRowContextMenu(event, row) {
    event.preventDefault();
    event.stopPropagation();

    this.contextMenuRow = row;
    const isString = row.kind === 'string';
    this.elements.copyJavaScriptStringLiteralButton.hidden = !isString;
    this.elements.copyJsonStringLiteralButton.hidden = !isString;
    this.elements.openIsolatedViewButton.hidden =
      getIsolationViewType(row, this.getActiveTab().path) === null;
    this.elements.contextMenuSeparator.hidden = !row.expandable;
    this.elements.expandRecursivelyButton.hidden = !row.expandable;

    const menu = this.elements.contextMenu;
    menu.hidden = false;
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;

    const rect = menu.getBoundingClientRect();
    const left = Math.max(4, Math.min(event.clientX, window.innerWidth - rect.width - 4));
    const top = Math.max(4, Math.min(event.clientY, window.innerHeight - rect.height - 4));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    this.elements.copyValueButton.focus();
  }

  closeContextMenu() {
    this.elements.contextMenu.hidden = true;
    this.contextMenuRow = null;
  }

  async copyContextMenuPath() {
    const row = this.contextMenuRow;
    this.closeContextMenu();

    if (!row) {
      return;
    }

    const copyPath = row.copyPath || formatPath(row.path);
    try {
      await navigator.clipboard.writeText(copyPath);
      this.clearError();
      this.setStatus(`Copied path: ${copyPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(`Copy path failed: ${message}`);
    }
  }

  async copyContextMenuNode(format, label) {
    const row = this.contextMenuRow;
    this.closeContextMenu();

    if (!row) {
      return;
    }

    try {
      const response = await this.requestWorker('copy-node', {
        path: row.path,
        displayModeOverrides: this.getActiveTab().displayModeOverrides,
        format,
      });
      if (!response.ok) {
        this.showError(`Copy ${label} failed: ${response.error}`);
        return;
      }

      await navigator.clipboard.writeText(response.text);
      this.clearError();
      this.setStatus(`Copied ${label} at ${formatPath(row.path)}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(`Copy ${label} failed: ${message}`);
    }
  }

  expandContextMenuRowRecursively() {
    const row = this.contextMenuRow;
    this.closeContextMenu();

    if (!row?.expandable) {
      return;
    }

    this.expansion = expandRecursively(this.expansion, row.pathKey);
    this.refreshRows({ pendingStatus: `Expanding ${formatPath(row.path)} recursively...` });
  }

  toggleExpanded(row) {
    if (!row.expandable) {
      return;
    }

    this.expansion = toggleExpansion(this.expansion, row.pathKey, {
      recursivelyExpanded: row.recursivelyExpanded,
    });
    this.refreshRows();
  }

  async parseStringRow(row) {
    this.setStatus(`Parsing string at ${formatPath(row.path)}...`);
    const response = await this.requestWorker('parse-string', {
      path: row.path,
      displayModeOverrides: this.getActiveTab().displayModeOverrides,
    });

    if (response.ok) {
      this.expansion = ensureExpanded(this.expansion, row.pathKey);
      this.clearError();
      await this.refreshRowsAndSearch();
    } else {
      this.showError(response.error);
      await this.refreshRows();
    }
  }

  async toggleParsedDisplay(row) {
    const response = await this.requestWorker('toggle-parsed-display', {
      path: row.path,
    });

    if (!response.ok) {
      this.showError(response.error);
      return;
    }

    if (response.displayMode === 'parsed') {
      this.expansion = ensureExpanded(this.expansion, row.pathKey);
    }

    await this.refreshRowsAndSearch();
  }

  async toggleTabParsedDisplay(row) {
    const tab = this.getActiveTab();
    if (!tab.closable) {
      return;
    }

    const isViewRoot = pathKey(row.path) === pathKey(tab.path);
    if (isViewRoot && tab.type === 'tree') {
      this.saveActiveViewState();
    }

    const nextMode = row.parsed ? 'raw' : 'parsed';
    const nextState = setViewTabPathMode(
      this.viewTabs,
      tab.id,
      row.path,
      nextMode,
    );
    if (nextState === this.viewTabs) {
      return;
    }

    this.viewTabs = nextState;
    this.renderTabs();
    if (isViewRoot) {
      await this.showActiveView();
      return;
    }

    if (nextMode === 'parsed') {
      this.expansion = ensureExpanded(this.expansion, row.pathKey);
    }
    await this.refreshRowsAndSearch();
  }

  scheduleSearch() {
    window.clearTimeout(this.searchTimer);
    const query = this.elements.searchInput.value.trim();

    if (!query) {
      this.clearSearchResults();
      return;
    }

    if (!this.hasParsedRoot) {
      this.clearSearchResults('No JSON loaded');
      return;
    }

    this.clearSearchResults('Searching...');
    this.searchTimer = window.setTimeout(() => {
      this.runFullTextSearch(query);
    }, SEARCH_DEBOUNCE_MS);
  }

  async runFullTextSearch(query) {
    const token = ++this.searchToken;
    const tab = this.getActiveTab();
    const response =
      tab.type === 'string'
        ? await this.requestWorker('search-string', {
            query,
            maxResults: MAX_SEARCH_RESULTS,
            path: tab.path,
            effective: tab.mode === 'parsed',
            displayModeOverrides: tab.displayModeOverrides,
          })
        : await this.requestWorker('search-tree', {
            query,
            maxResults: MAX_SEARCH_RESULTS,
            rootPath: tab.path,
            rootMode: tab.mode,
            displayModeOverrides: tab.displayModeOverrides,
          });

    if (
      token !== this.searchToken ||
      tab.id !== this.viewTabs.activeTabId ||
      this.elements.searchInput.value.trim() !== query
    ) {
      return;
    }

    if (!response.ok) {
      this.clearSearchResults(response.error || 'Search failed');
      return;
    }

    this.searchResults = response.result.matches;
    this.selectedSearchIndex = this.searchResults.length > 0 ? 0 : -1;
    this.searchResultsTruncated = response.result.truncated;
    this.searchResultsReady = true;
    await this.updateSearchUi(response.result.truncated, { reveal: true });
  }

  clearSearchResults(message = '0 matches') {
    window.clearTimeout(this.searchTimer);
    this.searchToken += 1;
    this.searchResults = [];
    this.selectedSearchIndex = -1;
    this.searchResultsTruncated = false;
    this.searchResultsReady = false;
    this.elements.searchCount.textContent = message;
    this.elements.searchPrevButton.disabled = true;
    this.elements.searchNextButton.disabled = true;
    this.elements.searchPreview.hidden = true;
    this.elements.searchPreview.textContent = '';
    if (this.getActiveTab()?.type === 'string') {
      this.rerenderStringViewPage();
    } else {
      this.renderVisibleRows();
    }
  }

  async selectSearchResult(delta) {
    if (this.searchResults.length === 0) {
      return;
    }

    const nextIndex =
      (this.selectedSearchIndex + delta + this.searchResults.length) % this.searchResults.length;
    this.selectedSearchIndex = nextIndex;
    await this.updateSearchUi(this.searchResultsTruncated, { reveal: true });
  }

  async updateSearchUi(truncated = false, options = {}) {
    this.searchResultsTruncated = truncated;
    const total = this.searchResults.length;
    const selected = this.selectedSearchIndex;
    const suffix = truncated ? '+' : '';
    this.elements.searchCount.textContent =
      total > 0 ? `${selected + 1}/${total}${suffix} matches` : '0 matches';
    this.elements.searchPrevButton.disabled = total === 0;
    this.elements.searchNextButton.disabled = total === 0;

    if (selected < 0) {
      this.elements.searchPreview.hidden = true;
      this.elements.searchPreview.textContent = '';
      return;
    }

    const match = this.searchResults[selected];
    this.elements.searchPreview.hidden = false;
    this.elements.searchPreview.textContent = `${match.pathLabel} ${match.source}: ${match.preview}`;

    if (options.reveal) {
      if (this.getActiveTab().type === 'string') {
        await this.revealStringSearchMatch(match);
      } else {
        await this.revealSearchMatch(match);
      }
    }
  }

  async revealStringSearchMatch(match) {
    const state = this.stringViewState;
    if (!state || !Number.isFinite(match.valueIndex)) {
      return;
    }

    const offset = Math.max(match.lineStart || 0, match.valueIndex - 8 * 1024);
    await this.loadStringViewPage(offset, match.lineNumber || 1);
    if (state !== this.stringViewState) {
      return;
    }

    this.elements.stringViewText
      .querySelector('.jt-string-search-current')
      ?.scrollIntoView({ block: 'center' });
  }

  async revealSearchMatch(match) {
    const rootDepth = this.getActiveTab().path.length;
    const ancestorPathKeys = Array.from(
      { length: Math.max(0, match.path.length - rootDepth) },
      (_, index) => pathKey(match.path.slice(0, rootDepth + index)),
    );
    this.expansion = revealExpansionPaths(this.expansion, ancestorPathKeys);

    await this.refreshRows();
    const rowIndex = this.rows.findIndex((row) => row.pathKey === match.pathKey);
    if (rowIndex !== -1) {
      this.elements.tree.scrollTop = Math.max(0, rowIndex * ROW_HEIGHT - ROW_HEIGHT * 2);
      this.renderVisibleRows();
    }
  }

  setStatus(message) {
    this.elements.status.textContent = message;
  }

  showDirectFileBanner() {
    this.elements.performanceBannerMessage.textContent =
      'For very large JSON files, use Standalone Viewer > Open file for better performance.';
    this.elements.performanceBannerClose.hidden = true;
    this.elements.directFileBanner.hidden = false;
  }

  showStandalonePerformanceBanner() {
    if (isStandalonePerformanceHintDismissed()) {
      return;
    }

    this.elements.performanceBannerMessage.textContent =
      'For very large JSON files, use Open file instead of pasting JSON for better performance.';
    this.elements.performanceBannerClose.hidden = false;
    this.elements.directFileBanner.hidden = false;
  }

  dismissStandalonePerformanceBanner() {
    this.elements.directFileBanner.hidden = true;
    dismissStandalonePerformanceHint();
  }

  setSourceLabel(sourceLabel) {
    this.elements.source.textContent = sourceLabel;
  }

  showError(message) {
    this.elements.error.hidden = false;
    this.elements.error.textContent = message;
  }

  clearError() {
    this.elements.error.hidden = true;
    this.elements.error.textContent = '';
  }
}
