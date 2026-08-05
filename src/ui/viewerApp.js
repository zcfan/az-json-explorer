import { formatJsonText } from '../core/jsonFormat.js';
import {
  getLocalizedChangelogUrl,
  getLocalizedIntegrationGuideUrl,
  localizeUi,
  translate,
} from '../core/i18n.js';
import {
  getPasteAction,
  getParseShortcutLabel,
  getPasteShortcutLabel,
  getSearchNavigationDelta,
  isManualInputToggleShortcut,
  isParseShortcut,
  isSearchShortcut,
  isSelectAllShortcut,
  shouldRedirectSelectAll,
} from '../core/inputShortcuts.js';
import {
  dismissStandalonePerformanceHint,
  isStandalonePerformanceHintDismissed,
} from '../core/standalonePerformanceHint.js';
import { claimVersionUpdateNotice } from '../core/versionUpdateNotice.js';
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
  MAX_HISTORY_PANEL_WIDTH,
  MIN_HISTORY_PANEL_WIDTH,
  resizeHistoryPanelWidth,
} from './historyPanelResize.js';
import {
  hasExceededManualInputDragThreshold,
  resolveManualInputDrag,
  resizeManualInputHeight,
  shouldToggleManualInputAfterPointerGesture,
} from './manualInputResize.js';
import {
  DEFAULT_VIEWER_UI_STATE,
  loadViewerUiState,
  saveViewerUiState,
} from './viewerUiState.js';
import {
  activateViewTabParsedMode,
  closeViewTab,
  createViewSessionSnapshot,
  createViewTabsState,
  getIsolationViewType,
  openIsolatedView,
  restoreViewSessionSnapshot,
  setViewTabPathMode,
} from './viewTabs.js';

const ROW_HEIGHT = 20;
const INDENT_WIDTH = 28;
const OVERSCAN_ROWS = 14;
const MAX_VISIBLE_ROWS = 100000;
const AUTO_EXPAND_MAX_ROWS = 5000;
const MAX_SEARCH_RESULTS = 500;
const SEARCH_DEBOUNCE_MS = 250;
const HISTORY_SESSION_SAVE_DEBOUNCE_MS = 300;
const VERSION_UPDATE_NOTICE_DURATION_MS = 10000;
const HISTORY_PAGE_SIZE = 50;
const HISTORY_ENGAGEMENT_SELECTOR = [
  '.jt-tabs',
  '.jt-view-controls',
  '.jt-status',
  '.jt-search-preview',
  '.jt-error',
  '.jt-tree',
  '.jt-string-view',
  '.jt-context-menu',
].join(',');
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

function formatHistorySize(size) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatHistoryTime(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function isHistoryEngagementClick(event) {
  return event
    .composedPath()
    .some((node) => node?.matches?.(HISTORY_ENGAGEMENT_SELECTOR));
}

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
    this.currentHistoryId = null;
    this.pendingHistoryViewId = null;
    this.historySessionTimer = 0;
    this.historyItems = [];
    this.historyCursor = null;
    this.historyLoaded = false;
    this.historyLoading = false;
    this.historySavePromise = Promise.resolve();
    this.manualInputResizeState = null;
    this.historyResizeState = null;
    this.versionUpdateNoticeTimer = 0;
  }

  mount() {
    this.shadow = this.host.shadowRoot || this.host.attachShadow({ mode: 'open' });
    this.shadow.replaceChildren(this.createShell());
    this.bindElements();
    this.bindEvents();
    this.showVersionUpdateNoticeIfNeeded();
    this.createWorker();
    this.restoreViewerUiState();
    this.elements.emptyHistoryLoadButton.hidden = Boolean(this.options.embedded);

    if (this.options.embedded) {
      this.elements.loader.hidden = true;
      this.setStatus(translate('waitingForJsonPage', 'Waiting for JSON page...'));
    }

    if (this.options.initialText && this.options.autoParse) {
      this.parseText(this.options.initialText);
    } else if (!this.options.embedded) {
      this.setStatus(
        translate(
          'gettingStarted',
          'Paste JSON, open a file, or choose an item from History to get started.',
        ),
      );
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
      <div class="jt-version-update-notice" role="status" aria-live="polite" hidden>
        <span>
          AZ JSON Explorer <strong class="jt-version-update-version"></strong>
          <span data-i18n="versionUpdateSuffix">keeps paste in the focused search or other editable control.</span>
        </span>
        <a
          class="jt-version-update-link"
          data-action="view-update-notes"
          href="https://github.com/zcfan/az-json-explorer/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noreferrer"
          data-i18n="seeWhatsNew"
        >See what’s new</a>
      </div>
      <div class="jt-direct-file-banner" role="note" hidden>
        <span class="jt-performance-banner-message" data-i18n="largeFileDirectHint">
          For very large JSON files, use Standalone Viewer > Open file for better performance.
        </span>
        <button
          class="jt-performance-banner-close"
          data-action="dismiss-performance-hint"
          type="button"
          aria-label="Dismiss performance hint"
          data-i18n-aria-label="dismissPerformanceHint"
          hidden
        >×</button>
      </div>
      <header class="jt-toolbar">
        <div class="jt-title">
          <strong>AZ JSON Explorer</strong>
          <span class="jt-source"></span>
        </div>
        <div class="jt-help">
          <button
            class="jt-help-button"
            data-action="toggle-help"
            type="button"
            aria-haspopup="menu"
            aria-expanded="false"
            data-i18n="help"
          >Help</button>
          <div class="jt-help-menu" role="menu" hidden>
            <button
              class="jt-help-menu-item"
              data-action="show-pro-tips"
              type="button"
              role="menuitem"
              data-i18n="proTips"
            >Pro Tips</button>
            <button
              class="jt-help-menu-item"
              data-action="show-shortcuts"
              type="button"
              role="menuitem"
              data-i18n="keyboardShortcuts"
            >Keyboard shortcuts</button>
            <a
              class="jt-help-menu-item"
              data-action="open-changelog"
              href="https://github.com/zcfan/az-json-explorer/blob/main/CHANGELOG.md"
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              data-i18n="changeLog"
            >Change log</a>
          </div>
        </div>
      </header>
      <section class="jt-loader">
        <div class="jt-manual-input-region">
          <textarea class="jt-manual-input" id="jt-manual-input" spellcheck="false" placeholder="Paste JSON"></textarea>
          <div class="jt-manual-input-card">
            <div class="jt-loader-actions" id="jt-manual-input-actions">
              <button class="jt-button jt-button-primary" data-action="parse-manual" type="button" data-i18n="parseInput">Parse input</button>
              <button class="jt-button jt-button-secondary" data-action="format-manual" type="button" data-i18n="formatJson">Format JSON</button>
              <label class="jt-file-button">
                <span data-i18n="openFile">Open file</span>
                <input class="jt-file-input" type="file" accept=".json,application/json,text/plain">
              </label>
              <button class="jt-button jt-button-secondary" data-action="load-sample" type="button" data-i18n="sample">Sample</button>
              <button class="jt-button jt-button-secondary jt-history-button" data-action="toggle-history" type="button" aria-expanded="false" data-i18n="history">History</button>
            </div>
            <div class="jt-manual-input-resizer">
              <button
                class="jt-manual-input-toggle"
                data-action="toggle-manual-input"
                type="button"
                aria-controls="jt-manual-input jt-manual-input-actions"
                aria-expanded="true"
                aria-label="Collapse JSON input"
                data-i18n-aria-label="collapseJsonInput"
              >
                <span class="jt-manual-input-toggle-content" aria-hidden="true">
                  <span class="jt-manual-input-toggle-label"><kbd>Ctrl+&#96;</kbd> <span data-i18n="toggleJsonInput">Toggle JSON input · Drag to resize</span></span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>
      <nav class="jt-tabs" role="tablist" aria-label="Open JSON views" data-i18n-aria-label="openJsonViews" hidden></nav>
      <section class="jt-view-controls">
        <div class="jt-expansion-controls">
          <button class="jt-button jt-button-secondary" data-action="collapse-all" type="button" data-i18n="collapse">Collapse</button>
          <button class="jt-button jt-button-secondary" data-action="expand-root" type="button" data-i18n="expandRoot">Expand root</button>
          <button class="jt-button jt-button-secondary" data-action="expand-all" type="button" data-i18n="expandAll">Expand all</button>
        </div>
        <div class="jt-string-controls" hidden>
          <button class="jt-button jt-copy-all-button" data-action="string-view-copy-all" type="button" data-i18n="copyAll">Copy all</button>
        </div>
        <div class="jt-search-controls">
          <label class="jt-search">
            <span data-i18n="search">Search</span>
            <input class="jt-search-input" type="search" placeholder="Full text" data-i18n-placeholder="fullText" autocomplete="off">
          </label>
          <button class="jt-button jt-button-secondary jt-search-prev" data-action="search-prev" type="button" data-i18n="previous" disabled>Prev</button>
          <button class="jt-button jt-button-secondary jt-search-next" data-action="search-next" type="button" data-i18n="next" disabled>Next</button>
          <span class="jt-search-count" data-i18n="zeroMatches">0 matches</span>
        </div>
      </section>
      <div class="jt-status" role="status"></div>
      <div class="jt-search-preview" hidden></div>
      <div class="jt-error" hidden></div>
      <section class="jt-tree" tabindex="0" aria-label="JSON tree" data-i18n-aria-label="jsonTree">
        <div class="jt-spacer"></div>
        <div class="jt-row-layer"></div>
        <button
          class="jt-empty-history-load"
          data-action="open-latest-history"
          type="button"
          data-i18n="loadLatestHistory"
          hidden
        >Click to load the most recent history entry</button>
      </section>
      <section class="jt-string-view" aria-label="String value" data-i18n-aria-label="stringValue" hidden>
        <div
          class="jt-string-view-text"
          tabindex="0"
          role="region"
          aria-label="Full string value with line numbers"
          data-i18n-aria-label="fullStringWithLineNumbers"
        ></div>
      </section>
      <div class="jt-context-menu" role="menu" hidden>
        <button class="jt-context-menu-item" data-action="copy-value" type="button" role="menuitem" data-i18n="copyValue">Copy value</button>
        <button class="jt-context-menu-item" data-action="copy-path" type="button" role="menuitem" data-i18n="copyPath">Copy path</button>
        <button class="jt-context-menu-item" data-action="copy-javascript-string-literal" type="button" role="menuitem" data-i18n="copyStringAsJavaScriptLiteral">Copy string as JavaScript literal</button>
        <button class="jt-context-menu-item" data-action="copy-json-string-literal" type="button" role="menuitem" data-i18n="copyStringAsJsonLiteral">Copy string as JSON literal</button>
        <button class="jt-context-menu-item" data-action="open-isolated-view" type="button" role="menuitem" data-i18n="viewInIsolatedView">View in isolated view</button>
        <div class="jt-context-menu-separator" role="separator"></div>
        <button class="jt-context-menu-item" data-action="expand-recursively" type="button" role="menuitem" data-i18n="expandRecursively">Expand recursively</button>
      </div>
      <dialog class="jt-shortcuts-dialog" aria-labelledby="jt-shortcuts-title">
        <header class="jt-shortcuts-header">
          <div>
            <h2 id="jt-shortcuts-title" data-i18n="keyboardShortcuts">Keyboard shortcuts</h2>
            <p data-i18n="shortcutsDescription">Open the viewer and move through JSON faster.</p>
          </div>
          <button
            class="jt-shortcuts-close"
            data-action="close-shortcuts"
            type="button"
            aria-label="Close keyboard shortcuts"
            data-i18n-aria-label="closeKeyboardShortcuts"
          >×</button>
        </header>
        <div class="jt-shortcuts-body">
          <section class="jt-shortcut-group">
            <h3 data-i18n="chromeRunningInBackground">Chrome running in the background</h3>
            <div class="jt-shortcut-row">
              <kbd data-shortcut="open-viewer"></kbd>
              <span data-i18n="openNewStandaloneViewer">Open a new standalone viewer.</span>
            </div>
          </section>
          <section class="jt-shortcut-group">
            <h3 data-i18n="chromeInFocus">Chrome in focus</h3>
            <div class="jt-shortcut-settings">
              <span data-i18n="customizeOpenShortcut">Customize the shortcut that opens AZ JSON Explorer.</span>
              <button data-action="open-shortcut-settings" type="button" data-i18n="openShortcutSettings">
                Open shortcut settings
              </button>
              <code>chrome://extensions/shortcuts</code>
            </div>
          </section>
          <section class="jt-shortcut-group" data-standalone-shortcuts>
            <h3 data-i18n="jsonInputNotFocused">Non-editable viewer area focused</h3>
            <div class="jt-shortcut-row">
              <kbd data-shortcut="paste"></kbd>
              <span data-i18n="shortcutPasteFromAnywhere">Show the input, clear it, paste clipboard text, and parse.</span>
            </div>
            <div class="jt-shortcut-row">
              <kbd data-shortcut="select-all"></kbd>
              <span data-i18n="shortcutSelectAll">Show the input, focus it, and select all content.</span>
            </div>
            <div class="jt-shortcut-row">
              <kbd>Ctrl+&#96;</kbd>
              <span data-i18n="shortcutToggleInput">Show or hide the JSON input.</span>
            </div>
          </section>
          <section class="jt-shortcut-group" data-standalone-shortcuts>
            <h3 data-i18n="jsonInputFocused">JSON input focused</h3>
            <div class="jt-shortcut-row">
              <kbd data-shortcut="parse"></kbd>
              <span data-i18n="shortcutParseCurrent">Parse the current input.</span>
            </div>
            <div class="jt-shortcut-row">
              <kbd data-shortcut="paste"></kbd>
              <span data-i18n="shortcutPasteSelection">Paste at the selection and parse the updated input.</span>
            </div>
          </section>
          <section class="jt-shortcut-group">
            <h3 data-i18n="viewerFocused">Viewer focused</h3>
            <div class="jt-shortcut-row">
              <kbd data-shortcut="search"></kbd>
              <span data-i18n="shortcutFocusSearch">Focus full-text search.</span>
            </div>
          </section>
          <section class="jt-shortcut-group">
            <h3 data-i18n="searchFocused">Search focused</h3>
            <div class="jt-shortcut-row">
              <kbd>Enter</kbd>
              <span data-i18n="shortcutNextResult">Move to the next result.</span>
            </div>
            <div class="jt-shortcut-row">
              <kbd>Shift+Enter</kbd>
              <span data-i18n="shortcutPreviousResult">Move to the previous result.</span>
            </div>
          </section>
        </div>
      </dialog>
      <dialog class="jt-pro-tips-dialog" aria-labelledby="jt-pro-tips-title">
        <header class="jt-pro-tips-header">
          <div>
            <h2 id="jt-pro-tips-title" data-i18n="proTips">Pro Tips</h2>
            <p data-i18n="proTipsDescription">Small workflows that make JSON work faster.</p>
          </div>
          <button
            class="jt-pro-tips-close"
            data-action="close-pro-tips"
            type="button"
            aria-label="Close Pro Tips"
            data-i18n-aria-label="closeProTips"
          >×</button>
        </header>
        <div class="jt-pro-tips-body">
          <section class="jt-pro-tips-group">
            <h3 data-i18n="proTipsViewJsonFaster">View JSON faster</h3>
            <ul>
              <li>
                <span data-i18n="proTipQuickOpenIntro">Copy JSON in any app, then press</span>
                <kbd data-shortcut="open-viewer"></kbd><span data-i18n="proTipThen">, followed by</span>
                <kbd data-shortcut="paste"></kbd><span data-i18n="proTipPeriod">.</span>
                <span data-i18n="proTipQuickOpenOutcome">As long as Chrome is running in the background, AZ JSON Explorer opens, comes to the front, and parses it.</span>
              </li>
              <li>
                <span data-i18n="proTipCustomizeShortcutIntro">Prefer something other than</span>
                <kbd data-shortcut="open-viewer"></kbd><span data-i18n="proTipQuestionMark">?</span>
                <button
                  class="jt-pro-tips-action"
                  data-action="open-shortcut-settings"
                  type="button"
                  data-i18n="proTipCustomizeShortcutAction"
                >Customize it in Chrome</button><span data-i18n="proTipPeriod">.</span>
                <span data-i18n="proTipCustomShortcutForeground">Custom shortcuts work only while Chrome is in the foreground.</span>
              </li>
              <li>
                <span data-i18n="proTipPasteAnywhereIntro">No need to click the input. Press</span>
                <kbd data-shortcut="paste"></kbd>
                <span data-i18n="proTipPasteAnywhereOutcome">in a non-editable area of the viewer to paste and parse immediately.</span>
              </li>
              <li>
                <span data-i18n="proTipReplaceInputIntro">Outside editable controls,</span>
                <kbd data-shortcut="paste"></kbd>
                <span data-i18n="proTipReplaceInputOutcome">replaces all existing content. When focused, paste behaves like normal editing: it inserts at the cursor or replaces the selection.</span>
              </li>
              <li>
                <span data-i18n="proTipResizeInput">JSON input taking too much space? Drag the divider to resize it, or press</span>
                <kbd>Ctrl+&#96;</kbd>
                <span data-i18n="proTipToggleInputOutcome">to show or hide it.</span>
              </li>
            </ul>
          </section>
          <section class="jt-pro-tips-group">
            <h3 data-i18n="proTipsIsolatedViews">Isolated views</h3>
            <ul>
              <li data-i18n="proTipIsolateSubtree">Want to focus on one subtree? Right-click it and choose “View in isolated view.” You can open the same subtree in multiple tabs.</li>
              <li data-i18n="proTipIsolateLongString">Need the full, untruncated text of a long string? Open it in an isolated view. If the string contains JSON, switch between raw and parsed directly on its tab.</li>
            </ul>
          </section>
          <section class="jt-pro-tips-group">
            <h3 data-i18n="proTipsOther">Other</h3>
            <p>
              <span data-i18n="proTipIntegrationIntro">Want to integrate AZ JSON Explorer into your own project?</span>
              <a
                class="jt-pro-tips-integration-link"
                href="https://github.com/zcfan/az-json-explorer/blob/main/docs/integrations/open-in-az-json-explorer.md"
                target="_blank"
                rel="noreferrer"
                data-i18n="proTipIntegrationLink"
              >Read the integration guide</a><span data-i18n="proTipPeriod">.</span>
            </p>
          </section>
        </div>
      </dialog>
      <aside class="jt-history-panel" aria-label="Parse history" data-i18n-aria-label="parseHistory" hidden>
        <div
          class="jt-history-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize history panel"
          data-i18n-aria-label="resizeHistoryPanel"
          aria-valuemin="${MIN_HISTORY_PANEL_WIDTH}"
          aria-valuemax="${MAX_HISTORY_PANEL_WIDTH}"
          aria-valuenow="320"
          tabindex="0"
        ></div>
        <header class="jt-history-header">
          <h2 data-i18n="history">History</h2>
          <button class="jt-history-close" data-action="close-history" type="button" aria-label="Close history" data-i18n-aria-label="closeHistory">
            <svg class="jt-history-close-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M3.5 3.5 12.5 12.5 M12.5 3.5 3.5 12.5"></path>
            </svg>
          </button>
        </header>
        <div class="jt-history-list" role="list"></div>
        <div class="jt-history-empty" data-i18n="noHistoryYet">No history yet.</div>
        <button class="jt-button jt-button-secondary jt-history-more" data-action="load-more-history" type="button" data-i18n="loadMore" hidden>Load more</button>
        <form class="jt-history-retention">
          <label>
            <span data-i18n="keepLatest">Keep latest</span>
            <input class="jt-history-keep-count" data-action="history-keep-count" type="number" min="0" step="1" value="10">
            <span data-i18n="records">records</span>
          </label>
          <button class="jt-button jt-history-clean-button" data-action="cleanup-history" type="submit" data-i18n="cleanHistory">Clean history</button>
        </form>
      </aside>
    `;
    localizeUi(shell);
    fragment.append(shell);
    return fragment;
  }

  bindElements() {
    this.elements = {
      versionUpdateNotice: this.shadow.querySelector('.jt-version-update-notice'),
      versionUpdateVersion: this.shadow.querySelector('.jt-version-update-version'),
      versionUpdateLink: this.shadow.querySelector(
        '[data-action="view-update-notes"]',
      ),
      directFileBanner: this.shadow.querySelector('.jt-direct-file-banner'),
      performanceBannerMessage: this.shadow.querySelector('.jt-performance-banner-message'),
      performanceBannerClose: this.shadow.querySelector(
        '[data-action="dismiss-performance-hint"]',
      ),
      source: this.shadow.querySelector('.jt-source'),
      help: this.shadow.querySelector('.jt-help'),
      helpButton: this.shadow.querySelector('[data-action="toggle-help"]'),
      helpMenu: this.shadow.querySelector('.jt-help-menu'),
      shortcutsMenuItem: this.shadow.querySelector('[data-action="show-shortcuts"]'),
      proTipsMenuItem: this.shadow.querySelector('[data-action="show-pro-tips"]'),
      changeLogLink: this.shadow.querySelector('[data-action="open-changelog"]'),
      shortcutsDialog: this.shadow.querySelector('.jt-shortcuts-dialog'),
      shortcutsCloseButton: this.shadow.querySelector('[data-action="close-shortcuts"]'),
      openShortcutSettingsButtons: this.shadow.querySelectorAll(
        '[data-action="open-shortcut-settings"]',
      ),
      proTipsDialog: this.shadow.querySelector('.jt-pro-tips-dialog'),
      proTipsCloseButton: this.shadow.querySelector('[data-action="close-pro-tips"]'),
      integrationGuideLink: this.shadow.querySelector('.jt-pro-tips-integration-link'),
      shortcutLabels: this.shadow.querySelectorAll('[data-shortcut]'),
      standaloneShortcutGroups: this.shadow.querySelectorAll(
        '[data-standalone-shortcuts]',
      ),
      loader: this.shadow.querySelector('.jt-loader'),
      manualInputRegion: this.shadow.querySelector('.jt-manual-input-region'),
      manualInput: this.shadow.querySelector('.jt-manual-input'),
      manualInputActions: this.shadow.querySelector('.jt-loader-actions'),
      manualInputResizer: this.shadow.querySelector('.jt-manual-input-resizer'),
      manualInputToggle: this.shadow.querySelector(
        '[data-action="toggle-manual-input"]',
      ),
      parseManualButton: this.shadow.querySelector('[data-action="parse-manual"]'),
      formatManualButton: this.shadow.querySelector('[data-action="format-manual"]'),
      fileInput: this.shadow.querySelector('.jt-file-input'),
      historyButton: this.shadow.querySelector('[data-action="toggle-history"]'),
      historyPanel: this.shadow.querySelector('.jt-history-panel'),
      historyResizer: this.shadow.querySelector('.jt-history-resizer'),
      historyCloseButton: this.shadow.querySelector('[data-action="close-history"]'),
      historyList: this.shadow.querySelector('.jt-history-list'),
      historyEmpty: this.shadow.querySelector('.jt-history-empty'),
      historyMoreButton: this.shadow.querySelector('[data-action="load-more-history"]'),
      historyRetention: this.shadow.querySelector('.jt-history-retention'),
      historyKeepCount: this.shadow.querySelector('[data-action="history-keep-count"]'),
      historyCleanupButton: this.shadow.querySelector('[data-action="cleanup-history"]'),
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
      emptyHistoryLoadButton: this.shadow.querySelector(
        '[data-action="open-latest-history"]',
      ),
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

    const changelogUrl = getLocalizedChangelogUrl();
    this.elements.versionUpdateLink.href = changelogUrl;
    this.elements.changeLogLink.href = changelogUrl;
    this.elements.integrationGuideLink.href = getLocalizedIntegrationGuideUrl();
    this.elements.source.textContent = this.options.sourceLabel || '';
    const parseShortcut = getParseShortcutLabel();
    const pasteShortcut = getPasteShortcutLabel();
    this.elements.parseManualButton.textContent = translate(
      'parseInputWithShortcut',
      `Parse input (${parseShortcut})`,
      parseShortcut,
    );
    this.elements.manualInput.placeholder = translate(
      'pasteJsonWithShortcut',
      `Paste JSON, or press ${pasteShortcut} anywhere to paste here`,
      pasteShortcut,
    );

    const primaryModifier = pasteShortcut.startsWith('cmd') ? 'Cmd' : 'Ctrl';
    const shortcutLabels = {
      'open-viewer': `${primaryModifier}+Shift+6`,
      paste: `${primaryModifier}+V`,
      'select-all': `${primaryModifier}+A`,
      parse: `${primaryModifier}+Enter`,
      search: `${primaryModifier}+F`,
    };
    for (const shortcut of this.elements.shortcutLabels) {
      shortcut.textContent = shortcutLabels[shortcut.dataset.shortcut] || '';
    }
    for (const group of this.elements.standaloneShortcutGroups) {
      group.hidden = Boolean(this.options.embedded);
    }
  }

  bindEvents() {
    this.shadow.addEventListener('click', (event) => {
      if (isHistoryEngagementClick(event)) {
        this.markCurrentHistoryViewed();
      }
    });

    this.elements.performanceBannerClose.addEventListener('click', () => {
      this.dismissStandalonePerformanceBanner();
    });

    this.elements.versionUpdateLink.addEventListener('click', () => {
      this.hideVersionUpdateNotice();
    });

    this.elements.helpButton.addEventListener('click', () => {
      this.toggleHelpMenu();
    });

    this.elements.shortcutsMenuItem.addEventListener('click', () => {
      this.openShortcutsDialog();
    });

    this.elements.proTipsMenuItem.addEventListener('click', () => {
      this.openProTipsDialog();
    });

    this.elements.changeLogLink.addEventListener('click', () => {
      this.closeHelpMenu();
    });

    this.elements.shortcutsCloseButton.addEventListener('click', () => {
      this.closeShortcutsDialog();
    });

    this.elements.proTipsCloseButton.addEventListener('click', () => {
      this.closeProTipsDialog();
    });

    for (const button of this.elements.openShortcutSettingsButtons) {
      button.addEventListener('click', () => {
        this.openChromeShortcutSettings();
      });
    }

    this.elements.parseManualButton.addEventListener('click', () => {
      this.parseManualInput();
    });

    this.elements.manualInputToggle.addEventListener('click', (event) => {
      if (event.detail !== 0) {
        event.preventDefault();
        return;
      }
      this.toggleManualInput();
    });

    this.elements.manualInputResizer.addEventListener('pointerdown', (event) => {
      this.beginManualInputResize(event);
    });
    this.host.ownerDocument.addEventListener('pointermove', (event) => {
      this.continueManualInputResize(event);
    });
    this.host.ownerDocument.addEventListener('pointerup', (event) => {
      this.endManualInputResize(event);
    });
    this.host.ownerDocument.addEventListener('pointercancel', (event) => {
      this.endManualInputResize(event);
    });

    this.elements.manualInput.addEventListener('keydown', (event) => {
      if (!isParseShortcut(event)) {
        return;
      }

      event.preventDefault();
      this.parseManualInput();
    });

    this.host.ownerDocument.addEventListener('keydown', (event) => {
      const target = event.composedPath?.()[0] || event.target;
      if (
        !this.options.embedded &&
        isSelectAllShortcut(event) &&
        shouldRedirectSelectAll(target)
      ) {
        event.preventDefault();
        this.setManualInputExpanded(true);
        this.elements.manualInput.focus();
        this.elements.manualInput.select();
        return;
      }

      if (!this.options.embedded && isManualInputToggleShortcut(event)) {
        event.preventDefault();
        this.toggleManualInput();
        return;
      }

      if (isSearchShortcut(event)) {
        event.preventDefault();
        this.elements.searchInput.focus();
      }
    });

    if (!this.options.embedded) {
      this.host.ownerDocument.addEventListener('paste', (event) => {
        const target = event.composedPath?.()[0] || event.target;
        const text = event.clipboardData?.getData('text/plain');
        if (typeof text !== 'string') {
          return;
        }

        const { manualInput } = this.elements;
        const pasteAction = getPasteAction(target, manualInput);
        if (pasteAction === 'native') {
          return;
        }

        event.preventDefault();
        if (pasteAction === 'replace-and-parse') {
          this.setManualInputExpanded(true);
          manualInput.value = '';
          manualInput.setSelectionRange(0, 0);
        }

        const start = manualInput.selectionStart ?? manualInput.value.length;
        const end = manualInput.selectionEnd ?? manualInput.value.length;
        manualInput.setRangeText(text, start, end, 'end');
        manualInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        this.parseManualInput();
      });
    }

    this.elements.formatManualButton.addEventListener('click', () => {
      this.formatManualInput();
    });

    this.elements.historyButton.addEventListener('click', () => {
      this.toggleHistoryPanel();
    });

    this.elements.historyCloseButton.addEventListener('click', () => {
      this.closeHistoryPanel();
    });

    this.elements.historyMoreButton.addEventListener('click', () => {
      this.loadHistoryPage();
    });

    this.elements.emptyHistoryLoadButton.addEventListener('click', () => {
      this.openLatestHistoryEntry();
    });

    this.elements.historyRetention.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!this.elements.historyCleanupButton.disabled) {
        this.cleanupHistory();
      }
    });
    this.elements.historyKeepCount.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') {
        return;
      }

      event.preventDefault();
      this.elements.historyRetention.requestSubmit();
    });

    this.elements.historyResizer.addEventListener('pointerdown', (event) => {
      this.beginHistoryPanelResize(event);
    });
    this.host.ownerDocument.addEventListener('pointermove', (event) => {
      this.continueHistoryPanelResize(event);
    });
    this.host.ownerDocument.addEventListener('pointerup', (event) => {
      this.endHistoryPanelResize(event);
    });
    this.host.ownerDocument.addEventListener('pointercancel', (event) => {
      this.endHistoryPanelResize(event);
    });

    this.elements.loadSampleButton.addEventListener('click', () => {
      this.parseText(SAMPLE_JSON);
    });

    this.elements.fileInput.addEventListener('change', async (event) => {
      const [file] = event.currentTarget.files || [];
      if (!file) {
        return;
      }

      this.parseFile(file, '', { recordHistory: true });
      event.currentTarget.value = '';
    });

    this.elements.searchInput.addEventListener('input', () => {
      this.scheduleSearch();
      this.scheduleHistorySessionSave();
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
      this.refreshRows({
        pendingStatus: translate('expandingAll', 'Expanding all...'),
      });
    });

    this.elements.copyValueButton.addEventListener('click', () => {
      this.copyContextMenuNode(
        'value',
        translate('valueLabel', 'value'),
      );
    });

    this.elements.copyPathButton.addEventListener('click', () => {
      this.copyContextMenuPath();
    });

    this.elements.copyJavaScriptStringLiteralButton.addEventListener('click', () => {
      this.copyContextMenuNode(
        'javascript-string-literal',
        translate('javascriptStringLiteralLabel', 'JavaScript string literal'),
      );
    });

    this.elements.copyJsonStringLiteralButton.addEventListener('click', () => {
      this.copyContextMenuNode(
        'json-string-literal',
        translate('jsonStringLiteralLabel', 'JSON string literal'),
      );
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
      if (!event.composedPath().includes(this.elements.help)) {
        this.closeHelpMenu();
      }

      if (this.elements.contextMenu.hidden) {
        return;
      }

      if (!event.composedPath().includes(this.elements.contextMenu)) {
        this.closeContextMenu();
      }
    });

    this.shadow.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeHelpMenu();
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

    this.host.ownerDocument.addEventListener('visibilitychange', () => {
      if (this.host.ownerDocument.visibilityState === 'hidden') {
        this.flushHistorySessionSave();
      }
    });
  }

  parseManualInput() {
    const text = this.elements.manualInput.value;
    if (!text.trim()) {
      this.clearError();
      this.setStatus(translate('pasteJsonToParse', 'Paste JSON input to parse.'));
      return;
    }

    const manualInputLabel = translate('manualInput', 'Manual input');
    this.setSourceLabel(manualInputLabel);
    this.parseText(text, {
      historyEntry: {
        sourceType: 'manual',
        title: manualInputLabel,
      },
    });
  }

  toggleHelpMenu() {
    const shouldOpen = this.elements.helpMenu.hidden;
    this.elements.helpMenu.hidden = !shouldOpen;
    this.elements.helpButton.setAttribute('aria-expanded', String(shouldOpen));
  }

  closeHelpMenu() {
    this.elements.helpMenu.hidden = true;
    this.elements.helpButton.setAttribute('aria-expanded', 'false');
  }

  openShortcutsDialog() {
    this.closeHelpMenu();
    if (!this.elements.shortcutsDialog.open) {
      this.elements.shortcutsDialog.showModal();
    }
  }

  closeShortcutsDialog() {
    if (this.elements.shortcutsDialog.open) {
      this.elements.shortcutsDialog.close();
    }
  }

  openProTipsDialog() {
    this.closeHelpMenu();
    if (!this.elements.proTipsDialog.open) {
      this.elements.proTipsDialog.showModal();
    }
  }

  closeProTipsDialog() {
    if (this.elements.proTipsDialog.open) {
      this.elements.proTipsDialog.close();
    }
  }

  openChromeShortcutSettings() {
    const url = 'chrome://extensions/shortcuts';
    if (globalThis.chrome?.tabs?.create) {
      globalThis.chrome.tabs.create({ url });
      return;
    }

    this.setStatus(
      translate(
        'openShortcutSettingsStatus',
        `Open ${url} in Chrome to customize the shortcut.`,
        url,
      ),
    );
  }

  toggleManualInput() {
    this.setManualInputExpanded(this.elements.manualInput.hidden);
  }

  beginManualInputResize(event) {
    if (event.button !== 0) {
      return;
    }

    const { manualInputRegion, manualInputResizer } = this.elements;
    this.manualInputResizeState = {
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startHandleClientY: manualInputResizer.getBoundingClientRect().top,
      regionClientY: manualInputRegion.getBoundingClientRect().top,
      expandedHandleOffset: this.measureManualInputExpandedHandleOffset(),
      dragging: false,
    };
    manualInputResizer.setPointerCapture(event.pointerId);
  }

  continueManualInputResize(event) {
    const state = this.manualInputResizeState;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    if (!state.dragging) {
      if (!hasExceededManualInputDragThreshold({
        ...state,
        clientX: event.clientX,
        clientY: event.clientY,
      })) {
        return;
      }
      state.dragging = true;
      this.elements.manualInputResizer.classList.add(
        'jt-manual-input-resizer-active',
      );
    }

    const viewportHeight =
      this.host.ownerDocument.defaultView?.innerHeight || window.innerHeight;
    const layout = resolveManualInputDrag({
      ...state,
      clientY: event.clientY,
      viewportHeight,
    });
    this.applyManualInputDragLayout(layout);
    event.preventDefault();
  }

  endManualInputResize(event) {
    const state = this.manualInputResizeState;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    const { manualInputResizer } = this.elements;
    if (manualInputResizer.hasPointerCapture(event.pointerId)) {
      manualInputResizer.releasePointerCapture(event.pointerId);
    }
    manualInputResizer.style.transform = '';
    this.manualInputResizeState = null;
    manualInputResizer.classList.remove('jt-manual-input-resizer-active');

    if (state.dragging) {
      this.persistViewerUiState();
    }

    if (
      event.type === 'pointerup' &&
      shouldToggleManualInputAfterPointerGesture(state)
    ) {
      this.toggleManualInput();
    }
  }

  measureManualInputExpandedHandleOffset() {
    const {
      manualInputRegion,
      manualInput,
      manualInputActions,
      manualInputResizer,
      manualInputToggle,
    } = this.elements;
    const inputWasHidden = manualInput.hidden;
    const actionsWereHidden = manualInputActions.hidden;
    const expandedAttribute = manualInputToggle.getAttribute('aria-expanded');
    const resizerTransform = manualInputResizer.style.transform;

    manualInputResizer.style.transform = '';
    manualInput.hidden = false;
    manualInputActions.hidden = false;
    manualInputToggle.setAttribute('aria-expanded', 'true');

    const regionClientY = manualInputRegion.getBoundingClientRect().top;
    const inputHeight = manualInput.getBoundingClientRect().height;
    const handleClientY = manualInputResizer.getBoundingClientRect().top;

    manualInput.hidden = inputWasHidden;
    manualInputActions.hidden = actionsWereHidden;
    manualInputToggle.setAttribute('aria-expanded', expandedAttribute);
    manualInputResizer.style.transform = resizerTransform;

    return handleClientY - regionClientY - inputHeight;
  }

  applyManualInputDragLayout(layout) {
    const {
      manualInput,
      manualInputResizer,
    } = this.elements;
    manualInputResizer.style.transform = '';

    if (manualInput.hidden === layout.expanded) {
      this.setManualInputExpanded(layout.expanded);
    }
    if (!layout.expanded) {
      return;
    }
    manualInput.style.height = `${Math.round(layout.height)}px`;

    const handleTranslation =
      layout.handleClientY - manualInputResizer.getBoundingClientRect().top;
    if (Math.abs(handleTranslation) < 0.5) {
      return;
    }

    const transform = `translateY(${handleTranslation}px)`;
    manualInputResizer.style.transform = transform;
  }

  setManualInputExpanded(expanded) {
    const { manualInput, manualInputActions, manualInputToggle } = this.elements;
    manualInput.hidden = !expanded;
    manualInputActions.hidden = !expanded;
    manualInputToggle.setAttribute('aria-expanded', String(expanded));
    manualInputToggle.setAttribute(
      'aria-label',
      expanded
        ? translate('collapseJsonInput', 'Collapse JSON input')
        : translate('expandJsonInput', 'Expand JSON input'),
    );
  }

  formatManualInput() {
    const text = this.elements.manualInput.value;
    if (!text.trim()) {
      this.clearError();
      this.setStatus(translate('pasteJsonToFormat', 'Paste JSON input to format.'));
      return;
    }

    try {
      this.elements.manualInput.value = formatJsonText(text);
      this.clearError();
      this.setStatus(translate('formattedJsonInput', 'Formatted JSON input.'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(
        translate('jsonFormatFailed', `JSON format failed: ${message}`, message),
      );
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

  getLocalStorage() {
    try {
      return this.host.ownerDocument.defaultView?.localStorage || null;
    } catch {
      return null;
    }
  }

  restoreViewerUiState() {
    if (this.options.embedded) {
      return;
    }

    const state = loadViewerUiState(this.getLocalStorage());
    const viewportHeight =
      this.host.ownerDocument.defaultView?.innerHeight || 800;
    const manualInputHeight = resizeManualInputHeight({
      startHeight: state.manualInputHeight,
      startClientY: 0,
      clientY: 0,
      viewportHeight,
    });
    this.elements.manualInput.style.height = `${manualInputHeight}px`;

    const viewportWidth =
      this.host.ownerDocument.defaultView?.innerWidth || 1280;
    const historyPanelWidth = resizeHistoryPanelWidth({
      startWidth: state.historyPanelWidth,
      startClientX: 0,
      clientX: 0,
      viewportWidth,
    });
    this.elements.historyPanel.style.setProperty(
      '--jt-history-panel-width',
      `${historyPanelWidth}px`,
    );
    this.elements.historyResizer.setAttribute(
      'aria-valuenow',
      String(historyPanelWidth),
    );

    if (state.historyPanelOpen) {
      this.elements.historyPanel.hidden = false;
      this.elements.historyButton.setAttribute('aria-expanded', 'true');
      void this.loadHistoryPage({ reset: true });
    }
  }

  persistViewerUiState() {
    if (this.options.embedded) {
      return;
    }

    const historyPanelWidth =
      Number(this.elements.historyResizer.getAttribute('aria-valuenow')) ||
      DEFAULT_VIEWER_UI_STATE.historyPanelWidth;
    const manualInputHeight =
      Number.parseFloat(this.elements.manualInput.style.height) ||
      this.elements.manualInput.getBoundingClientRect().height ||
      DEFAULT_VIEWER_UI_STATE.manualInputHeight;
    const state = {
      historyPanelOpen: !this.elements.historyPanel.hidden,
      historyPanelWidth: historyPanelWidth,
      manualInputHeight: manualInputHeight,
    };
    saveViewerUiState(this.getLocalStorage(), state);
  }

  async toggleHistoryPanel() {
    if (this.elements.historyPanel.hidden) {
      this.elements.historyPanel.hidden = false;
      this.elements.historyButton.setAttribute('aria-expanded', 'true');
      this.persistViewerUiState();
      await this.loadHistoryPage({ reset: true });
      return;
    }

    this.closeHistoryPanel();
  }

  closeHistoryPanel() {
    this.elements.historyPanel.hidden = true;
    this.elements.historyButton.setAttribute('aria-expanded', 'false');
    this.persistViewerUiState();
  }

  beginHistoryPanelResize(event) {
    if (event.button !== 0) {
      return;
    }

    this.historyResizeState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startWidth: this.elements.historyPanel.getBoundingClientRect().width,
    };
    this.elements.historyResizer.setPointerCapture(event.pointerId);
    this.elements.historyResizer.classList.add('jt-history-resizer-active');
    event.preventDefault();
  }

  continueHistoryPanelResize(event) {
    const state = this.historyResizeState;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    const viewportWidth =
      this.host.ownerDocument.defaultView?.innerWidth || window.innerWidth;
    const width = resizeHistoryPanelWidth({
      ...state,
      clientX: event.clientX,
      viewportWidth,
    });
    this.elements.historyPanel.style.setProperty(
      '--jt-history-panel-width',
      `${width}px`,
    );
    this.elements.historyResizer.setAttribute('aria-valuenow', String(width));
  }

  endHistoryPanelResize(event) {
    if (this.historyResizeState?.pointerId !== event.pointerId) {
      return;
    }

    if (this.elements.historyResizer.hasPointerCapture(event.pointerId)) {
      this.elements.historyResizer.releasePointerCapture(event.pointerId);
    }
    this.historyResizeState = null;
    this.elements.historyResizer.classList.remove('jt-history-resizer-active');
    this.persistViewerUiState();
  }

  async loadHistoryPage({ reset = false } = {}) {
    if (this.historyLoading) {
      return;
    }

    if (reset) {
      this.historyItems = [];
      this.historyCursor = null;
      this.renderHistoryItems();
    } else if (this.historyLoaded && !this.historyCursor) {
      return;
    }

    this.historyLoading = true;
    this.elements.historyMoreButton.disabled = true;
    this.elements.historyMoreButton.textContent = translate('loading', 'Loading...');
    const response = await this.requestWorker('list-history', {
      cursor: this.historyCursor,
      limit: HISTORY_PAGE_SIZE,
    });
    this.historyLoading = false;
    this.historyLoaded = true;
    this.elements.historyMoreButton.disabled = false;
    this.elements.historyMoreButton.textContent = translate('loadMore', 'Load more');

    if (!response.ok) {
      this.elements.historyEmpty.hidden = false;
      this.elements.historyEmpty.textContent = translate(
        'historyUnavailable',
        `History unavailable: ${response.error}`,
        response.error,
      );
      this.elements.historyMoreButton.hidden = true;
      return;
    }

    this.historyItems = reset
      ? response.items
      : [...this.historyItems, ...response.items];
    this.historyCursor = response.nextCursor;
    this.renderHistoryItems();
  }

  refreshLoadedHistory() {
    if (this.historyLoaded || !this.elements.historyPanel.hidden) {
      this.loadHistoryPage({ reset: true });
    }
  }

  renderHistoryItems() {
    const fragment = document.createDocumentFragment();
    for (const item of this.historyItems) {
      const listItem = document.createElement('div');
      listItem.className = 'jt-history-list-item';
      listItem.setAttribute('role', 'listitem');
      const button = document.createElement('button');
      button.className = `jt-history-item${
        item.id === this.currentHistoryId ? ' jt-history-item-active' : ''
      }`;
      button.type = 'button';
      button.addEventListener('click', () => this.openHistoryEntry(item.id));

      const title = document.createElement('span');
      title.className = 'jt-history-item-title';
      title.textContent = item.title;
      const preview = document.createElement('span');
      preview.className = 'jt-history-item-preview';
      preview.textContent = item.preview;
      const metadata = document.createElement('span');
      metadata.className = 'jt-history-item-metadata';
      const size = formatHistorySize(item.size);
      const time = formatHistoryTime(item.lastViewedAt);
      metadata.textContent = translate(
        'historyMetadata',
        `${size} · Viewed ${time}`,
        [size, time],
      );
      button.append(title, preview, metadata);
      listItem.append(button);
      fragment.append(listItem);
    }

    this.elements.historyList.replaceChildren(fragment);
    this.elements.historyList.hidden = this.historyItems.length === 0;
    this.elements.historyEmpty.hidden = this.historyItems.length > 0;
    this.elements.historyEmpty.textContent = translate(
      'noHistoryYet',
      'No history yet.',
    );
    this.elements.historyMoreButton.hidden = !this.historyCursor;
  }

  async openHistoryEntry(historyId) {
    await this.flushHistorySessionSave();
    this.clearError();
    this.setStatus(translate('loadingHistory', 'Loading history in worker...'));
    const response = await this.requestWorker('open-history', {
      historyId,
      nodeCountLimit: AUTO_EXPAND_MAX_ROWS,
    });
    if (!response.ok) {
      this.showError(
        translate(
          'historyLoadFailedDetails',
          `History load failed: ${response.error}`,
          response.error,
        ),
      );
      this.setStatus(translate('historyLoadFailed', 'History load failed.'));
      return;
    }

    this.resetViewTabs();
    this.hasParsedRoot = true;
    this.elements.emptyHistoryLoadButton.hidden = true;
    this.currentHistoryId = response.historyId;
    this.pendingHistoryViewId = response.historyId;
    this.setSourceLabel(response.title);
    const initialExpansion = createInitialExpansionState(
      response.nodeCount,
      pathKey([]),
    );
    const restored = restoreViewSessionSnapshot(response.session);
    this.viewTabs = restored.viewTabs;
    this.tabSearchStates = restored.tabSearchStates;
    this.treeViewStates.clear();
    this.treeViewStates.set('root', {
      expansion: initialExpansion,
      scrollTop: 0,
    });
    this.renderTabs();
    await this.showActiveView();
    await this.loadHistoryPage({ reset: true });
  }

  async openLatestHistoryEntry() {
    const button = this.elements.emptyHistoryLoadButton;
    if (this.hasParsedRoot || button.disabled) {
      return;
    }

    button.disabled = true;
    this.clearError();
    this.setStatus(translate('loadingHistory', 'Loading history in worker...'));

    try {
      const response = await this.requestWorker('list-history', {
        cursor: null,
        limit: 1,
      });
      if (!response.ok) {
        this.showError(
          translate(
            'historyUnavailable',
            `History unavailable: ${response.error}`,
            response.error,
          ),
        );
        this.setStatus(translate('historyLoadFailed', 'History load failed.'));
        return;
      }

      const latestHistoryEntry = response.items[0];
      if (!latestHistoryEntry) {
        this.setStatus(translate('noHistoryYet', 'No history yet.'));
        return;
      }

      await this.openHistoryEntry(latestHistoryEntry.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(
        translate(
          'historyUnavailable',
          `History unavailable: ${message}`,
          message,
        ),
      );
      this.setStatus(translate('historyLoadFailed', 'History load failed.'));
    } finally {
      button.disabled = false;
      button.hidden = this.hasParsedRoot || Boolean(this.options.embedded);
    }
  }

  async markCurrentHistoryViewed() {
    const historyId = this.pendingHistoryViewId;
    if (!historyId || historyId !== this.currentHistoryId) {
      return;
    }

    this.pendingHistoryViewId = null;
    const response = await this.requestWorker('mark-history-viewed', {
      historyId,
    });
    if (!response.ok) {
      if (historyId === this.currentHistoryId) {
        this.pendingHistoryViewId = historyId;
      }
      return;
    }

    if (historyId === this.currentHistoryId) {
      await this.loadHistoryPage({ reset: true });
    }
  }

  async cleanupHistory() {
    const keepCount = Math.max(
      0,
      Math.floor(Number(this.elements.historyKeepCount.value) || 0),
    );
    this.elements.historyKeepCount.value = String(keepCount);
    this.elements.historyCleanupButton.disabled = true;
    this.elements.historyCleanupButton.textContent = translate(
      'cleaning',
      'Cleaning...',
    );

    try {
      await this.flushHistorySessionSave();
      const response = await this.requestWorker('cleanup-history', {
        keep: keepCount,
      });
      if (!response.ok) {
        this.showError(
          translate(
            'historyCleanupFailed',
            `History cleanup failed: ${response.error}`,
            response.error,
          ),
        );
        return;
      }

      if (!response.activeHistoryRetained) {
        this.currentHistoryId = null;
        this.pendingHistoryViewId = null;
      }
      const deletedCount = response.deletedCount.toLocaleString();
      this.setStatus(
        response.deletedCount === 1
          ? translate('historyCleanupResultOne', 'Cleaned 1 history record.')
          : translate(
              'historyCleanupResultMany',
              `Cleaned ${deletedCount} history records.`,
              deletedCount,
            ),
      );
      await this.loadHistoryPage({ reset: true });
    } finally {
      this.elements.historyCleanupButton.disabled = false;
      this.elements.historyCleanupButton.textContent = translate(
        'cleanHistory',
        'Clean history',
      );
    }
  }

  scheduleHistorySessionSave() {
    if (!this.currentHistoryId || !this.hasParsedRoot) {
      return;
    }

    window.clearTimeout(this.historySessionTimer);
    this.historySessionTimer = window.setTimeout(() => {
      this.historySessionTimer = 0;
      this.persistHistorySession();
    }, HISTORY_SESSION_SAVE_DEBOUNCE_MS);
  }

  persistHistorySession() {
    if (!this.currentHistoryId || !this.hasParsedRoot) {
      return this.historySavePromise;
    }

    this.saveActiveViewState();
    const historyId = this.currentHistoryId;
    const session = createViewSessionSnapshot(
      this.viewTabs,
      this.tabSearchStates,
    );
    this.historySavePromise = this.historySavePromise
      .catch(() => {})
      .then(() =>
        this.requestWorker('save-history-session', {
          historyId,
          session,
        }),
      );
    return this.historySavePromise;
  }

  async flushHistorySessionSave() {
    window.clearTimeout(this.historySessionTimer);
    this.historySessionTimer = 0;
    if (this.currentHistoryId && this.hasParsedRoot) {
      await this.persistHistorySession();
    } else {
      await this.historySavePromise.catch(() => {});
    }
  }

  async parseText(text, options = {}) {
    const rawText = String(text || '');
    this.elements.emptyHistoryLoadButton.hidden = true;
    await this.flushHistorySessionSave();
    this.currentHistoryId = null;
    this.pendingHistoryViewId = null;
    this.resetViewTabs();
    this.clearSearchResults();
    this.clearError();
    this.setStatus(translate('parsingInWorker', 'Parsing in worker...'));
    this.elements.rowLayer.replaceChildren();
    this.elements.spacer.style.height = '0px';

    const response = await this.requestWorker('parse-root', {
      text: rawText,
      nodeCountLimit: AUTO_EXPAND_MAX_ROWS,
      ...(options.historyEntry ? { historyEntry: options.historyEntry } : {}),
    });
    if (!response.ok) {
      this.hasParsedRoot = false;
      this.rows = [];
      this.showError(response.error);
      this.setStatus(translate('jsonParseFailed', 'JSON parse failed.'));
      return;
    }

    this.hasParsedRoot = true;
    this.currentHistoryId = response.historyId || null;
    this.expansion = createInitialExpansionState(response.nodeCount, pathKey([]));
    await this.refreshRowsAndSearch();
    if (response.historyError) {
      this.showError(
        translate(
          'historySaveFailed',
          `JSON parsed, but history could not be saved: ${response.historyError}`,
          response.historyError,
        ),
      );
    }
    if (this.currentHistoryId) {
      this.scheduleHistorySessionSave();
      this.refreshLoadedHistory();
    }
  }

  async parseFile(file, sourceLabel = '', options = {}) {
    this.elements.emptyHistoryLoadButton.hidden = true;
    await this.flushHistorySessionSave();
    this.currentHistoryId = null;
    this.pendingHistoryViewId = null;
    this.resetViewTabs();
    this.clearSearchResults();
    this.clearError();
    this.setSourceLabel(
      sourceLabel || file.name || translate('localFile', 'Local file'),
    );
    this.setStatus(
      translate(
        'readingAndParsingFile',
        'Reading and parsing file in worker...',
      ),
    );
    this.elements.rowLayer.replaceChildren();
    this.elements.spacer.style.height = '0px';

    const response = await this.requestWorker('parse-root', {
      file,
      nodeCountLimit: AUTO_EXPAND_MAX_ROWS,
      ...(options.recordHistory
        ? {
            historyEntry: {
              sourceType: 'file',
              title: file.name || sourceLabel || 'Local file',
            },
          }
        : {}),
    });
    if (!response.ok) {
      this.hasParsedRoot = false;
      this.rows = [];
      this.showError(response.error);
      this.setStatus(translate('jsonParseFailed', 'JSON parse failed.'));
      return;
    }

    this.hasParsedRoot = true;
    this.currentHistoryId = response.historyId || null;
    this.expansion = createInitialExpansionState(response.nodeCount, pathKey([]));
    await this.refreshRowsAndSearch();
    if (response.historyError) {
      this.showError(
        translate(
          'historySaveFailed',
          `JSON parsed, but history could not be saved: ${response.historyError}`,
          response.historyError,
        ),
      );
    }
    if (this.currentHistoryId) {
      this.scheduleHistorySessionSave();
      this.refreshLoadedHistory();
    }
  }

  async refreshRows(options = {}) {
    if (!this.hasParsedRoot) {
      return;
    }

    const activeTabId = this.viewTabs.activeTabId;
    const token = ++this.renderToken;
    this.setStatus(
      options.pendingStatus ||
        translate('preparingVisibleRows', 'Preparing visible rows...'),
    );
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
      this.setStatus(
        translate(
          'visibleRowPreparationFailed',
          'Visible row preparation failed.',
        ),
      );
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
      this.clearSearchResults(translate('searching', 'Searching...'));
    }

    await this.refreshRows();
    if (query) {
      await this.runFullTextSearch(query);
    }
  }

  createStatusText() {
    const count = this.rows.length.toLocaleString();
    if (!this.hasRowLimit) {
      return translate('visibleRows', `${count} visible rows.`, count);
    }

    const limit = MAX_VISIBLE_ROWS.toLocaleString();
    return translate(
      'visibleRowsTruncated',
      `${count} visible rows. Showing first ${limit} visible rows.`,
      [count, limit],
    );
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
    indent.className = row.depth > 0 ? 'jt-indent jt-indent-guided' : 'jt-indent';
    indent.style.width = `${row.depth * INDENT_WIDTH}px`;
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
      const toggleLabel = row.expanded
        ? translate('collapse', 'Collapse')
        : translate('expand', 'Expand');
      toggle.setAttribute('aria-label', toggleLabel);
      toggle.title = toggleLabel;

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
      key.title = translate(
        'copyPathTitle',
        `Copy path: ${row.copyPath}`,
        row.copyPath,
      );
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
      parseButton.textContent = translate('parseAsJson', 'Parse as JSON');
      parseButton.addEventListener('click', () => this.parseStringRow(row));
      element.append(parseButton);
    }

    if (row.hasParsed) {
      const activeTab = this.getActiveTab();
      const badge = document.createElement('button');
      badge.className = row.parsed ? 'jt-badge jt-badge-parsed' : 'jt-badge jt-badge-raw';
      badge.type = 'button';
      badge.textContent = row.parsed
        ? translate('parsed', 'parsed')
        : translate('raw', 'raw');
      const nextModeLabel = row.parsed
        ? translate('originalString', 'original string')
        : translate('cachedParsedValue', 'cached parsed value');
      badge.title = activeTab.closable
        ? translate(
            'showValueInTab',
            `Show ${nextModeLabel} in this tab`,
            nextModeLabel,
          )
        : translate('showValue', `Show ${nextModeLabel}`, nextModeLabel);
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
      viewAllButton.textContent = translate('viewAll', 'View all');
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
    this.elements.stringViewCopyAllButton.textContent = translate(
      'copyAll',
      'Copy all',
    );
    this.elements.stringViewCopyAllButton.title = '';
    const length = tab.valueLength.toLocaleString();
    this.setStatus(
      translate(
        'stringLength',
        `${tab.title} · length ${length}`,
        [tab.title, length],
      ),
    );

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
          response.error ||
          translate('unableToReadString', 'Unable to read string.');
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
      this.elements.stringViewText.textContent = translate(
        'unableToReadStringDetails',
        `Unable to read string: ${message}`,
        message,
      );
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
        this.elements.stringViewCopyAllButton.textContent = translate(
          'copyFailed',
          'Copy failed',
        );
        this.elements.stringViewCopyAllButton.title =
          response.error ||
          translate('unableToCopyFullValue', 'Unable to copy full value.');
        return;
      }

      await navigator.clipboard.writeText(response.text);
      if (state === this.stringViewState) {
        this.elements.stringViewCopyAllButton.textContent = translate(
          'copied',
          'Copied',
        );
      }
    } catch (error) {
      if (state !== this.stringViewState) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.elements.stringViewCopyAllButton.textContent = translate(
        'copyFailed',
        'Copy failed',
      );
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
    this.elements.stringViewCopyAllButton.textContent = translate(
      'copyAll',
      'Copy all',
    );
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
      const rootClass = tab.id === 'root' ? ' jt-tab-root' : '';
      item.className = `jt-tab${rootClass}${isActive ? ' jt-tab-active' : ''}`;
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
        mode.textContent =
          tab.mode === 'parsed'
            ? translate('parsed', 'parsed')
            : translate('raw', 'raw');
        const nextMode = tab.mode === 'parsed'
          ? translate('raw', 'raw')
          : translate('parsed', 'parsed');
        const modeLabel = translate(
          'showModeInTab',
          `Show ${nextMode} value in this tab`,
          nextMode,
        );
        mode.setAttribute(
          'aria-label',
          modeLabel,
        );
        mode.title = modeLabel;
        mode.addEventListener('click', () => this.toggleIsolatedTabMode(tab.id));
        item.append(mode);
      }

      if (tab.closable) {
        const close = document.createElement('button');
        close.className = 'jt-tab-close';
        close.type = 'button';
        close.textContent = '×';
        close.setAttribute(
          'aria-label',
          translate('closeTab', `Close ${tab.title}`, tab.title),
        );
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
    this.scheduleHistorySessionSave();
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
        this.setStatus(
          translate(
            'parsingTab',
            `Parsing ${tab.title} for this tab...`,
            tab.title,
          ),
        );
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
            this.setStatus(
              translate(
                'tabRemainsRaw',
                `${tab.title} remains in raw mode.`,
                tab.title,
              ),
            );
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
        this.scheduleHistorySessionSave();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.showError(
          translate('parseFailed', `Parse failed: ${message}`, message),
        );
        if (tab.id === this.viewTabs.activeTabId) {
          this.setStatus(
            translate(
              'tabRemainsRaw',
              `${tab.title} remains in raw mode.`,
              tab.title,
            ),
          );
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
    this.scheduleHistorySessionSave();
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
    this.scheduleHistorySessionSave();
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
    this.scheduleHistorySessionSave();
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
      this.setStatus(
        translate('copiedPath', `Copied path: ${copyPath}`, copyPath),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(
        translate('copyPathFailed', `Copy path failed: ${message}`, message),
      );
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
        this.showError(
          translate(
            'copyLabelFailed',
            `Copy ${label} failed: ${response.error}`,
            [label, response.error],
          ),
        );
        return;
      }

      await navigator.clipboard.writeText(response.text);
      this.clearError();
      const path = formatPath(row.path);
      this.setStatus(
        translate(
          'copiedLabelAtPath',
          `Copied ${label} at ${path}.`,
          [label, path],
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(
        translate(
          'copyLabelFailed',
          `Copy ${label} failed: ${message}`,
          [label, message],
        ),
      );
    }
  }

  expandContextMenuRowRecursively() {
    const row = this.contextMenuRow;
    this.closeContextMenu();

    if (!row?.expandable) {
      return;
    }

    this.expansion = expandRecursively(this.expansion, row.pathKey);
    const path = formatPath(row.path);
    this.refreshRows({
      pendingStatus: translate(
        'expandingRecursivelyAtPath',
        `Expanding ${path} recursively...`,
        path,
      ),
    });
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
    const path = formatPath(row.path);
    this.setStatus(
      translate(
        'parsingStringAtPath',
        `Parsing string at ${path}...`,
        path,
      ),
    );
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
      this.scheduleHistorySessionSave();
      return;
    }

    if (nextMode === 'parsed') {
      this.expansion = ensureExpanded(this.expansion, row.pathKey);
    }
    await this.refreshRowsAndSearch();
    this.scheduleHistorySessionSave();
  }

  scheduleSearch() {
    window.clearTimeout(this.searchTimer);
    const query = this.elements.searchInput.value.trim();

    if (!query) {
      this.clearSearchResults();
      return;
    }

    if (!this.hasParsedRoot) {
      this.clearSearchResults(translate('noJsonLoaded', 'No JSON loaded'));
      return;
    }

    this.clearSearchResults(translate('searching', 'Searching...'));
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
      this.clearSearchResults(
        response.error || translate('searchFailed', 'Search failed'),
      );
      return;
    }

    this.searchResults = response.result.matches;
    this.selectedSearchIndex = this.searchResults.length > 0 ? 0 : -1;
    this.searchResultsTruncated = response.result.truncated;
    this.searchResultsReady = true;
    await this.updateSearchUi(response.result.truncated, { reveal: true });
  }

  clearSearchResults(message = translate('zeroMatches', '0 matches')) {
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
      total > 0
        ? translate(
            'searchMatchPosition',
            `${selected + 1}/${total}${suffix} matches`,
            [selected + 1, total, suffix],
          )
        : translate('zeroMatches', '0 matches');
    this.elements.searchPrevButton.disabled = total === 0;
    this.elements.searchNextButton.disabled = total === 0;

    if (selected < 0) {
      this.elements.searchPreview.hidden = true;
      this.elements.searchPreview.textContent = '';
      return;
    }

    const match = this.searchResults[selected];
    const source =
      match.source === 'key'
        ? translate('keySource', 'key')
        : translate('valueSource', 'value');
    this.elements.searchPreview.hidden = false;
    this.elements.searchPreview.textContent = translate(
      'searchPreview',
      `${match.pathLabel} ${source}: ${match.preview}`,
      [match.pathLabel, source, match.preview],
    );

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

  showVersionUpdateNoticeIfNeeded() {
    let storage;
    try {
      storage = this.host.ownerDocument.defaultView?.localStorage;
    } catch {
      return;
    }

    const currentVersion = this.options.currentVersion;
    if (!claimVersionUpdateNotice(storage, currentVersion)) {
      return;
    }

    this.elements.versionUpdateVersion.textContent = currentVersion;
    this.elements.versionUpdateNotice.style.setProperty(
      '--jt-version-update-duration',
      `${VERSION_UPDATE_NOTICE_DURATION_MS}ms`,
    );
    this.elements.versionUpdateNotice.hidden = false;
    this.versionUpdateNoticeTimer = setTimeout(() => {
      this.hideVersionUpdateNotice();
    }, VERSION_UPDATE_NOTICE_DURATION_MS);
  }

  hideVersionUpdateNotice() {
    if (this.versionUpdateNoticeTimer) {
      clearTimeout(this.versionUpdateNoticeTimer);
      this.versionUpdateNoticeTimer = 0;
    }
    this.elements.versionUpdateNotice.hidden = true;
  }

  showDirectFileBanner() {
    this.elements.performanceBannerMessage.textContent = translate(
      'largeFileDirectHint',
      'For very large JSON files, use Standalone Viewer > Open file for better performance.',
    );
    this.elements.performanceBannerClose.hidden = true;
    this.elements.directFileBanner.hidden = false;
  }

  showStandalonePerformanceBanner() {
    if (isStandalonePerformanceHintDismissed()) {
      return;
    }

    this.elements.performanceBannerMessage.textContent = translate(
      'largeFileStandaloneHint',
      'For very large JSON files, use Open file instead of pasting JSON for better performance.',
    );
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
