# Viewer UI

## Purpose

The viewer UI is the main-thread coordinator. It owns DOM rendering, user interactions, worker request lifecycle, and transient UI state.

## Key Files

- `src/ui/viewerApp.js`
- `src/ui/styles.css`
- `src/ui/searchHighlight.js`
- `src/viewer.js`
- `test/projectFiles.test.mjs`
- `test/searchHighlight.test.mjs`

## State Owned By `JsonViewerApp`

- Worker request map and request IDs.
- `hasParsedRoot`.
- Current visible `rows`.
- Expansion mode plus explicit expanded keys or all-mode collapsed exceptions.
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
- `Collapse`, `Expand root`, and `Expand all`: replace the expansion mode and refresh rows from the worker.
- Individual expand/collapse: updates explicit expanded keys or all-mode collapsed exceptions.
- `Expand all` shows `Expanding all...` while the worker prepares rows and keeps the 100,000-row truncation message on completion.
- `Expand all` never parses raw strings; already-parsed strings participate when their display mode is `parsed`.
- `Parse as JSON`: sends `parse-string` with the row path.
- `parsed` or `raw` badge: toggles cached parsed display.
- Search: debounced worker search, result reveal, row highlighting.
- Key context menu: right-click a non-root key and copy `row.copyPath`.

## Contracts

- Do not parse large JSON on the main thread.
- Do not keep the full parsed root in `JsonViewerApp`.
- Keep controls tied to worker responses; the UI should not invent row data.
- Close transient context menus on scroll, outside click, and Escape.
- Search reveal must add explicit ancestors or remove all-mode collapsed exceptions before scrolling to the matching row.

## Verification

- Run `npm test -- test/projectFiles.test.mjs test/searchHighlight.test.mjs`.
- For visual changes, load the unpacked extension and check standalone plus embedded viewer flows.
