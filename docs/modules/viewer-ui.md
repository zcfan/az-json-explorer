# Viewer UI

## Purpose

The viewer UI is the main-thread coordinator. It owns DOM rendering, user interactions, worker request lifecycle, and transient UI state.

## Key Files

- `src/ui/viewerApp.js`
- `src/ui/viewTabs.js`
- `src/ui/historyPanelResize.js`
- `src/ui/styles.css`
- `src/ui/searchHighlight.js`
- `src/core/standalonePerformanceHint.js`
- `src/viewer.js`
- `test/projectFiles.test.mjs`
- `test/viewTabs.test.mjs`
- `test/searchHighlight.test.mjs`
- `test/stringSearchHighlight.test.mjs`
- `test/historyPanelResize.test.mjs`
- `test/standalonePerformanceHint.test.mjs`

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

- `ROW_HEIGHT` is fixed at 28px.
- `spacer` sets total scroll height.
- `rowLayer` contains only viewport rows plus overscan.
- Row `transform: translateY(...)` positions each visible item.

This is why row height and row DOM layout must remain stable.

## User Interactions

- Pasting anywhere in the standalone page redirects the clipboard text into the manual JSON textarea, unless an `input` or `textarea` already owns focus.
- `Parse input`: sends textarea text to `parse-root`; `cmd+enter` on macOS or `ctrl+enter` on Windows/Linux triggers it while the manual textarea has focus.
- `Open file`: sends a File directly to `parse-root`.
- `Sample`: loads the inline sample JSON.
- `History`: opens a 320px right-side panel. The panel pages through successful manual-input and user-opened-file parses without loading their source content into the UI.
- The history panel's left divider is pointer-draggable from 240px to 720px while preserving viewer space where the viewport allows it.
- Clicking a history item asks the worker to restore it directly into the viewer; it never refills or replaces the manual-input textarea.
- Each history item renders three lines: its source title, a bounded beginning-of-content preview, and size/last-viewed metadata.
- History is ordered by most recently viewed time. Successfully reopening an item moves it to the top.
- The panel footer defaults to `Keep latest 10 records`; it shares a right-aligned row with `Clean history` when space permits and wraps responsively when narrow. Cleaning explicitly deletes every older entry and its stored source content. No cleanup runs automatically.
- Explicit grid-row anchors keep the panel aligned with the loader when the optional performance banner is dismissed.
- The tab strip sits above the expansion/search row. Expansion controls align left; search controls share that row and align right.
- New roots with at most 5,000 fully expanded rows open in `all` mode; larger roots open with only the root expanded.
- `Collapse`, `Expand root`, and `Expand all`: replace the expansion mode and refresh rows from the worker.
- Clicking an expandable row's chevron, indentation, or trailing blank area expands or collapses it; clicking or selecting row text does not.
- `Expand all` shows `Expanding all...` while the worker prepares rows and keeps the 100,000-row truncation message on completion.
- `Expand all` never parses raw strings; already-parsed strings participate when their display mode is `parsed`.
- `Parse as JSON`: sends `parse-string` with the row path.
- In the whole-document view, a row `parsed` or `raw` badge toggles the cached source display mode.
- Search: debounced worker search, result reveal, row highlighting.
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

## Verification

- Run `npm test -- test/expansionState.test.mjs test/standalonePerformanceHint.test.mjs test/projectFiles.test.mjs test/searchHighlight.test.mjs`.
- For visual changes, load the unpacked extension and check standalone plus embedded viewer flows.
