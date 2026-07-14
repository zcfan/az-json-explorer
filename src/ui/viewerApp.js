import { formatJsonText } from '../core/jsonFormat.js';
import {
  dismissStandalonePerformanceHint,
  isStandalonePerformanceHintDismissed,
} from '../core/standalonePerformanceHint.js';
import { formatPath, pathKey } from '../core/treeModel.js';
import {
  createAllExpansionState,
  createExplicitExpansionState,
  ensureExpanded,
  revealExpansionPaths,
  toggleExpansion,
} from './expansionState.js';
import { getRowSearchState, splitHighlightedText } from './searchHighlight.js';

const ROW_HEIGHT = 28;
const OVERSCAN_ROWS = 14;
const MAX_VISIBLE_ROWS = 100000;
const MAX_SEARCH_RESULTS = 500;
const SEARCH_DEBOUNCE_MS = 250;
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
    this.contextMenuCopyPath = '';
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
        <div class="jt-toolbar-actions">
          <label class="jt-search">
            <span>Search</span>
            <input class="jt-search-input" type="search" placeholder="Full text" autocomplete="off">
          </label>
          <button class="jt-button jt-button-secondary jt-search-prev" data-action="search-prev" type="button" disabled>Prev</button>
          <button class="jt-button jt-button-secondary jt-search-next" data-action="search-next" type="button" disabled>Next</button>
          <span class="jt-search-count">0 matches</span>
          <button class="jt-button jt-button-secondary" data-action="collapse-all" type="button">Collapse</button>
          <button class="jt-button jt-button-secondary" data-action="expand-root" type="button">Expand root</button>
          <button class="jt-button jt-button-secondary" data-action="expand-all" type="button">Expand all</button>
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
      <div class="jt-status" role="status"></div>
      <div class="jt-search-preview" hidden></div>
      <div class="jt-error" hidden></div>
      <section class="jt-tree" tabindex="0" aria-label="JSON tree">
        <div class="jt-spacer"></div>
        <div class="jt-row-layer"></div>
      </section>
      <div class="jt-context-menu" role="menu" hidden>
        <button class="jt-context-menu-item" data-action="copy-path" type="button" role="menuitem">Copy path</button>
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
      searchInput: this.shadow.querySelector('.jt-search-input'),
      searchPrevButton: this.shadow.querySelector('[data-action="search-prev"]'),
      searchNextButton: this.shadow.querySelector('[data-action="search-next"]'),
      searchCount: this.shadow.querySelector('.jt-search-count'),
      searchPreview: this.shadow.querySelector('.jt-search-preview'),
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
      copyPathButton: this.shadow.querySelector('[data-action="copy-path"]'),
    };

    this.elements.source.textContent = this.options.sourceLabel || '';
  }

  bindEvents() {
    this.elements.performanceBannerClose.addEventListener('click', () => {
      this.dismissStandalonePerformanceBanner();
    });

    this.elements.parseManualButton.addEventListener('click', () => {
      this.parseManualInput();
    });

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
      this.expansion = createExplicitExpansionState([pathKey([])]);
      this.refreshRows();
    });

    this.elements.expandAllButton.addEventListener('click', () => {
      this.expansion = createAllExpansionState();
      this.refreshRows({ pendingStatus: 'Expanding all...' });
    });

    this.elements.copyPathButton.addEventListener('click', () => {
      this.copyContextMenuPath();
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
    this.clearSearchResults();
    this.clearError();
    this.setStatus('Parsing in worker...');
    this.elements.rowLayer.replaceChildren();
    this.elements.spacer.style.height = '0px';

    const response = await this.requestWorker('parse-root', { text: rawText });
    if (!response.ok) {
      this.hasParsedRoot = false;
      this.rows = [];
      this.showError(response.error);
      this.setStatus('JSON parse failed.');
      return;
    }

    this.hasParsedRoot = true;
    this.expansion = createExplicitExpansionState([pathKey([])]);
    await this.refreshRows();
  }

  async parseFile(file, sourceLabel = '') {
    this.clearSearchResults();
    this.clearError();
    this.setSourceLabel(sourceLabel || file.name || 'Local file');
    this.setStatus('Reading and parsing file in worker...');
    this.elements.rowLayer.replaceChildren();
    this.elements.spacer.style.height = '0px';

    const response = await this.requestWorker('parse-root', { file });
    if (!response.ok) {
      this.hasParsedRoot = false;
      this.rows = [];
      this.showError(response.error);
      this.setStatus('JSON parse failed.');
      return;
    }

    this.hasParsedRoot = true;
    this.expansion = createExplicitExpansionState([pathKey([])]);
    await this.refreshRows();
  }

  async refreshRows(options = {}) {
    if (!this.hasParsedRoot) {
      return;
    }

    const token = ++this.renderToken;
    this.setStatus(options.pendingStatus || 'Preparing visible rows...');
    const response = await this.requestWorker('collect-visible-rows', {
      expansionMode: this.expansion.mode,
      expandedKeys: Array.from(this.expansion.expandedKeys),
      collapsedKeys: Array.from(this.expansion.collapsedKeys),
      maxRows: MAX_VISIBLE_ROWS,
      yieldEvery: 500,
    });

    if (token !== this.renderToken) {
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
    if (row.expandable) {
      element.addEventListener('click', (event) => {
        if (event.target.closest('button')) {
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
      key.addEventListener('contextmenu', (event) => this.openKeyContextMenu(event, row));
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
      const badge = document.createElement('button');
      badge.className = row.parsed ? 'jt-badge jt-badge-parsed' : 'jt-badge jt-badge-raw';
      badge.type = 'button';
      badge.textContent = row.parsed ? 'parsed' : 'raw';
      badge.title = row.parsed ? 'Show original string' : 'Show cached parsed value';
      badge.addEventListener('click', () => this.toggleParsedDisplay(row));
      element.append(badge);
    }

    const value = document.createElement('span');
    value.className = `jt-value jt-effective-${row.effectiveKind}`;
    this.appendHighlightedText(value, this.formatRowValue(row), {
      active: searchState.valueMatched,
    });
    element.append(value);

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

  openKeyContextMenu(event, row) {
    event.preventDefault();
    event.stopPropagation();

    this.contextMenuCopyPath = row.copyPath || formatPath(row.path);
    const menu = this.elements.contextMenu;
    menu.hidden = false;
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;

    const rect = menu.getBoundingClientRect();
    const left = Math.max(4, Math.min(event.clientX, window.innerWidth - rect.width - 4));
    const top = Math.max(4, Math.min(event.clientY, window.innerHeight - rect.height - 4));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    this.elements.copyPathButton.focus();
  }

  closeContextMenu() {
    this.elements.contextMenu.hidden = true;
    this.contextMenuCopyPath = '';
  }

  async copyContextMenuPath() {
    const copyPath = this.contextMenuCopyPath;
    this.closeContextMenu();

    if (!copyPath) {
      return;
    }

    try {
      await navigator.clipboard.writeText(copyPath);
      this.clearError();
      this.setStatus(`Copied path: ${copyPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(`Copy path failed: ${message}`);
    }
  }

  toggleExpanded(row) {
    if (!row.expandable) {
      return;
    }

    this.expansion = toggleExpansion(this.expansion, row.pathKey);
    this.refreshRows();
  }

  async parseStringRow(row) {
    this.setStatus(`Parsing string at ${formatPath(row.path)}...`);
    const response = await this.requestWorker('parse-string', {
      path: row.path,
    });

    if (response.ok) {
      this.expansion = ensureExpanded(this.expansion, row.pathKey);
      this.clearError();
    } else {
      this.showError(response.error);
    }

    await this.refreshRows();
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

    await this.refreshRows();
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

    this.elements.searchCount.textContent = 'Searching...';
    this.searchTimer = window.setTimeout(() => {
      this.runFullTextSearch(query);
    }, SEARCH_DEBOUNCE_MS);
  }

  async runFullTextSearch(query) {
    const token = ++this.searchToken;
    const response = await this.requestWorker('search-tree', {
      query,
      maxResults: MAX_SEARCH_RESULTS,
    });

    if (token !== this.searchToken || this.elements.searchInput.value.trim() !== query) {
      return;
    }

    if (!response.ok) {
      this.clearSearchResults(response.error || 'Search failed');
      return;
    }

    this.searchResults = response.result.matches;
    this.selectedSearchIndex = this.searchResults.length > 0 ? 0 : -1;
    await this.updateSearchUi(response.result.truncated, { reveal: true });
  }

  clearSearchResults(message = '0 matches') {
    window.clearTimeout(this.searchTimer);
    this.searchToken += 1;
    this.searchResults = [];
    this.selectedSearchIndex = -1;
    this.elements.searchCount.textContent = message;
    this.elements.searchPrevButton.disabled = true;
    this.elements.searchNextButton.disabled = true;
    this.elements.searchPreview.hidden = true;
    this.elements.searchPreview.textContent = '';
  }

  async selectSearchResult(delta) {
    if (this.searchResults.length === 0) {
      return;
    }

    const nextIndex =
      (this.selectedSearchIndex + delta + this.searchResults.length) % this.searchResults.length;
    this.selectedSearchIndex = nextIndex;
    await this.updateSearchUi(this.searchResults.length >= MAX_SEARCH_RESULTS, { reveal: true });
  }

  async updateSearchUi(truncated = false, options = {}) {
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
      await this.revealSearchMatch(match);
    }
  }

  async revealSearchMatch(match) {
    const ancestorPathKeys = Array.from({ length: match.path.length }, (_, index) =>
      pathKey(match.path.slice(0, index)),
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
