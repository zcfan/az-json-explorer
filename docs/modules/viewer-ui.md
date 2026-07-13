# Viewer UI

## Purpose

The viewer UI is the main-thread coordinator. It owns DOM rendering, user interactions, worker request lifecycle, and transient UI state.

## Key Files

- `src/ui/viewerApp.js`
- `src/ui/styles.css`
- `src/ui/searchHighlight.js`
- `src/core/standalonePerformanceHint.js`
- `src/viewer.js`
- `test/projectFiles.test.mjs`
- `test/searchHighlight.test.mjs`
- `test/standalonePerformanceHint.test.mjs`

## State Owned By `JsonViewerApp`

- Worker request map and request IDs.
- `hasParsedRoot`.
- Current visible `rows`.
- Expanded row keys.
- Render token for stale async row responses.
- Search query timer, matches, and selected match.
- Context menu copy-path state.

## Rendering Model

The tree uses virtual rows:

- `ROW_HEIGHT` is fixed at 28px.
- `spacer` sets total scroll height.
- `rowLayer` contains only viewport rows plus overscan.
- Row `transform: translateY(...)` positions each visible item.

This is why row height and row DOM layout must remain stable.

## User Interactions

- `Parse input`: sends textarea text to `parse-root`.
- `Open file`: sends a File directly to `parse-root`.
- `Sample`: loads the inline sample JSON.
- Expand/collapse: updates `expandedKeys` and refreshes rows from the worker.
- `Parse as JSON`: sends `parse-string` with the row path.
- `parsed` or `raw` badge: toggles cached parsed display.
- Search: debounced worker search, result reveal, row highlighting.
- Key context menu: right-click a non-root key and copy `row.copyPath`.
- Standalone performance hint: the close button hides it immediately and stores a local dismissed preference; direct-page warnings ignore that preference and remain non-dismissible.

## Contracts

- Do not parse large JSON on the main thread.
- Do not keep the full parsed root in `JsonViewerApp`.
- Keep controls tied to worker responses; the UI should not invent row data.
- Close transient context menus on scroll, outside click, and Escape.
- Search reveal must expand ancestors before scrolling to the matching row.
- Keep standalone hint dismissal local to the extension origin and independent from direct-page warnings.

## Verification

- Run `npm test -- test/standalonePerformanceHint.test.mjs test/projectFiles.test.mjs test/searchHighlight.test.mjs`.
- For visual changes, load the unpacked extension and check standalone plus embedded viewer flows.
