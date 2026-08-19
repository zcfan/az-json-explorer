# Viewer UI

## Purpose

The viewer UI is the main-thread coordinator. It owns DOM rendering, user interactions, worker request lifecycle, and transient UI state.

## Key Files

- `src/ui/viewerApp.js`
- `src/ui/viewTabs.js`
- `src/ui/historyPanelResize.js`
- `src/ui/viewerUiState.js`
- `src/ui/styles.css`
- `src/core/i18n.js`
- `_locales/en/messages.json`
- `_locales/zh_CN/messages.json`
- `CHANGELOG.md`
- `src/ui/searchHighlight.js`
- `src/core/standalonePerformanceHint.js`
- `src/core/versionUpdateNotice.js`
- `src/viewer.js`
- `test/projectFiles.test.mjs`
- `test/viewTabs.test.mjs`
- `test/searchHighlight.test.mjs`
- `test/stringSearchHighlight.test.mjs`
- `test/historyPanelResize.test.mjs`
- `test/viewerUiState.test.mjs`
- `test/standalonePerformanceHint.test.mjs`
- `test/versionUpdateNotice.test.mjs`

## State Owned By `JsonViewerApp`

- Worker request map and request IDs.
- `hasParsedRoot`.
- Current visible `rows`.
- Expansion mode plus explicit keys, compact recursive subtree roots, and collapsed exceptions.
- Initial expansion selected from the worker's bounded fully-expanded row count.
- Render token for stale async row responses.
- Search query timer, matches, selected match, completion state, and truncation state.
- Context menu state for the selected row and applicable copy/expansion actions.
- Permanent whole-document tab plus closable isolated tree/string tabs.
- Per-tree-tab expansion and scroll state, plus per-tab search state for both tree and string views.
- Active full-string tab path, bounded page offsets, history, and stale-request token.
- The active parse-history record ID, paged history-list cursor, and debounced lightweight session saves.

## Rendering Model

The tree uses virtual rows:

- `ROW_HEIGHT` is fixed at 18px.
- `spacer` sets total scroll height.
- `rowLayer` contains only viewport rows plus overscan.
- Row `transform: translateY(...)` positions each visible item.
- Up to ten nearest ancestor rows remain visible in a sticky navigation layer. This limit is independent of viewport height.
- Sticky ancestor rows are navigation-only: activating one aligns and briefly highlights its original row immediately below its remaining Sticky ancestor stack, so the target itself has just left Sticky. They do not expose expansion, parsing, copying, or context-menu actions.
- Ancestor selection starts from the first row below the sticky stack. A parent row is promoted once at least 3px of it is covered by either the viewport top or existing Sticky content, avoiding flicker from subpixel contact while preventing it from disappearing behind Sticky content.
- Parsed-string ancestors retain their parsed badge in Sticky, but the badge is inert; the entire Sticky row remains a single navigation target.
- Expansion is restricted to each row's explicit chevron and the indentation before it. A row that moves out of Sticky and under the pointer therefore cannot be collapsed by a follow-up click on its key or trailing blank area.

This is why row height and row DOM layout must remain stable.

## Appearance

- The standalone and embedded viewers follow the browser's `prefers-color-scheme` setting and react to changes without reloading.
- `src/viewer.html` declares support for light and dark browser controls and supplies the initial page background before the Shadow DOM stylesheet loads.
- Component colors come from the semantic custom properties on `:host` in `src/ui/styles.css`. Light values are the default; the dark media query changes the palette rather than duplicating component rules.

## User Interactions

- Every paste into the manual JSON textarea immediately parses the resulting input.
- Embedded viewers hide the complete manual JSON input region; the textarea, actions, History button, and resize/toggle row are standalone-only controls.
- The manual JSON textarea is 300px tall by default. Dragging the row beneath it resizes the textarea vertically, with 92px as the minimum usable height and 30% of the viewport height as the maximum. Dragging below 92px immediately collapses the input; dragging from the collapsed state keeps it hidden until at least 92px of usable height is available.
- A bordered action card connects beneath the textarea and contains the complete manual-input action row plus a text-only toggle. Its copy also explains that dragging resizes the input. The complete row uses a pointer cursor until vertical movement exceeds 3px, then switches to a vertical-resize cursor and highlights its drag handle as a blue line around the text. The handle follows the pointer while the input has a usable height; below 92px it parks in the collapsed position until the drag provides enough height to expand again.
- Pressing anywhere in the resize row and moving at most 3px vertically counts as a click and toggles input visibility. Moving farther vertically starts a resize and suppresses the visibility toggle when the pointer is released.
- Using the select-all shortcut outside editable controls expands the manual input, focuses it, and selects all of its content. Search, manual-input, and other editable controls keep their native select-all behavior.
- Using the paste shortcut outside editable controls in the standalone page expands the manual input when needed, clears it, redirects the clipboard text into it, and immediately parses it without changing focus. Search and other editable controls keep their native paste behavior.
- `Parse input`: sends textarea text to `parse-root`; `cmd+enter` on macOS or `ctrl+enter` on Windows/Linux triggers it while the manual textarea has focus.
- `Help`: opens a compact menu with `Pro Tips`, `Keyboard shortcuts`, and `Change log`.
- `Pro Tips`: opens a localized modal covering the fastest copy → global shortcut → paste workflow, focused versus unfocused paste behavior, input resizing/toggling, isolated subtree and full-string tabs, shortcut customization, and the localized project-integration guide.
- `Keyboard shortcuts`: opens a modal grouped by Chrome state and focused viewer control. Platform-specific labels use `Cmd` on macOS and `Ctrl` elsewhere; standalone-only input groups are omitted in embedded mode.
- `Open shortcut settings`: opens `chrome://extensions/shortcuts` so the extension command can be reassigned without requiring an additional permission.
- `Change log`: opens the repository's published-version-only changelog on GitHub, selecting `CHANGELOG.md` or `CHANGELOG.zh-CN.md` to match the active extension language.
- On the first viewer opened for each extension version, a top notice links to that changelog. Its background fills from left to right over a 10-second countdown, then the notice closes automatically. The claimed version is stored locally and requires no extension permission.
- `Open file`: sends a File directly to `parse-root`.
- `Sample`: loads the inline sample JSON.
- `History`: opens a 320px right-side panel. The panel pages through successful manual-input and user-opened-file parses without loading their source content into the UI.
- The history panel's left divider is pointer-draggable from 240px to 720px while preserving viewer space where the viewport allows it, and its effective width never exceeds half the viewport.
- The standalone viewer stores whether History is open, the History panel width, and the manual JSON input height in local storage. Refreshing restores those values, with dimensions clamped to current safety bounds; embedded viewers do not share this preference.
- Before any JSON is loaded, the standalone tree area is a full-size button labeled `Click to load the most recent history entry`. It requests only the newest history summary, then restores that record through the existing worker-owned history path; embedded viewers never show this prompt.
- Clicking a history item asks the worker to restore it directly into the viewer; it never refills or replaces the manual-input textarea.
- Each history item renders three lines: its source title, a bounded beginning-of-content preview, and size/last-viewed metadata.
- History is ordered by most recently engaged time. Selecting an item only restores it; the first subsequent click in the tabs, viewer controls/status, or active content area updates its timestamp and moves it to the top.
- The panel footer defaults to `Keep latest 10 records`; it shares a right-aligned row with `Clean history` when space permits and wraps responsively when narrow. Clicking the button or pressing Enter in the count input submits the same cleanup action. Cleaning explicitly deletes every older entry and its stored source content. No cleanup runs automatically.
- Explicit grid-row anchors keep the panel aligned with the loader when either optional top notice is dismissed.
- The tab strip sits above the expansion/search row. Expansion controls align left; search controls share that row and align right.
- The tab strip scrolls horizontally when needed and never becomes vertically scrollable.
- New roots with at most 5,000 fully expanded rows open in `all` mode; larger roots open with only the root expanded.
- `Collapse`, `Expand root`, and `Expand all`: replace the expansion mode and refresh rows from the worker.
- Clicking an expandable row's chevron or the indentation before it expands or collapses it; the trailing blank area and row text do not change expansion state.
- `Expand all` shows `Expanding all...` while the worker prepares rows and keeps the 100,000-row truncation message on completion.
- `Expand all` never parses raw strings; already-parsed strings participate when their display mode is `parsed`.
- `Parse as JSON`: sends `parse-string` with the row path.
- In the whole-document view, a row `parsed` or `raw` badge toggles the cached source display mode.
- Search: a debounced search triggered by editing the query reveals its first result. Afterward, only `Prev`, `Next`, `Enter`, and `Shift+Enter` reveal results; background result refreshes do not move the viewport. Tree results are centered whenever viewport boundaries allow.
- `cmd+f` on macOS or `ctrl+f` on Windows/Linux focuses the viewer search input instead of opening browser find.
- Row context menu: right-click any row, including the view root, to copy its value or `row.copyPath`.
- String rows also expose JavaScript literal and JSON literal copy formats.
- Non-root object, array, and string rows expose `View in isolated view`; number, boolean, null, and view-root rows do not.
- The whole-document `$` tab is permanent. The tab strip appears only with at least one isolated tab, and long titles elide from the beginning so the most specific path suffix remains visible.
- An active tab's title area is noninteractive and has no tab-level hover treatment; only its mode badge and close button remain interactive.
- Collapse, expand-root, and expand-all are scoped to the active tree tab. Search is scoped to every active tab; tree and string tabs independently retain their query, match list, and current-match state. Completed searches restore immediately, while searches interrupted by a tab switch restart when that tab becomes active again.
- Opening the same path repeatedly creates distinct tabs with ` (1)`, ` (2)`, and later suffixes.
- History-backed views persist a lightweight session snapshot: open tabs, active tab, each tab's search query, and each JSON tab's local raw/parsed mode.
- History session snapshots intentionally exclude expanded/collapsed nodes, scroll positions, search result payloads, and the currently selected match. Restored searches run again from their saved query.
- A raw JSON string opens as a paged read-only string tab; the same row in parsed mode opens as a structured tree tab.
- The isolated tab badge and its in-view row badges switch `raw`/`parsed` through tab-local display overrides. Clicking `raw` before a parsed cache exists parses on demand without changing the whole-document view or other tabs.
- Truncated string rows expose `View all`, which opens the same read-only string tab as the context-menu action.
- The string tab replaces the tree expansion buttons with a blue-accented Copy all action in the shared control row, reads one bounded page from the worker, soft-wraps without changing whitespace, and automatically changes pages at scroll boundaries.
- String-tab search runs against the complete retained string in the worker, then loads the page containing the selected match and highlights all matches on that page without sending the full string to the UI.
- The string tab renders each real line break as a numbered logical row. Soft-wrapped fragments remain inside the same numbered row, and alternating logical rows use subtle background stripes so real and visual line boundaries stay distinguishable.
- Expandable rows expose `Expand recursively`, which opens only that subtree and keeps the 100,000-row cap.
- Recursive expansion never parses raw strings; already parsed string subtrees participate when displayed as parsed.
- Standalone performance hint: the close button hides it immediately and stores a local dismissed preference; direct-page warnings ignore that preference and remain non-dismissible.
- Static and dynamic UI copy follows Chrome's UI language. English is the fallback and Simplified Chinese is selected automatically by `chrome.i18n`.

## Contracts

- Do not parse large JSON on the main thread.
- Do not keep the full parsed root in `JsonViewerApp`.
- Do not attach complete long strings to rows or keep them after the string tab closes.
- Do not transfer history source content to the UI for listing or restoration. History content is read and parsed inside the worker.
- Full-string text must use `textContent` and preserve consecutive spaces, tabs, and line breaks; wrapping is visual only.
- Base automatic expansion on bounded row count, not source byte size; row summaries and worker-to-UI transfer are the relevant costs.
- Keep controls tied to worker responses; the UI should not invent row data.
- Close transient context menus on scroll, outside click, and Escape.
- Search reveal must add explicit ancestors or remove all-mode collapsed exceptions before scrolling to the matching row.
- Keep standalone hint dismissal local to the extension origin and independent from direct-page warnings.
- Keep user-visible copy behind `data-i18n*` attributes or `translate(...)`; preserve English fallbacks and matching placeholders in both locale catalogs.

## Verification

- Run `npm test -- test/expansionState.test.mjs test/standalonePerformanceHint.test.mjs test/projectFiles.test.mjs test/searchHighlight.test.mjs`.
- For visual changes, load the unpacked extension and check standalone plus embedded viewer flows.
