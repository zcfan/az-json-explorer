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
- Expansion mode plus explicit keys, compact recursive subtree roots, and collapsed exceptions.
- Initial expansion selected from the worker's bounded fully-expanded row count.
- Render token for stale async row responses.
- Search query timer, matches, and selected match.
- Context menu state for the selected row and applicable copy/expansion actions.
- Full-string dialog path, bounded page offsets, history, and stale-request token.

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
- The expansion controls sit below the manual-input actions and align left; search controls share that row and align right.
- New roots with at most 5,000 fully expanded rows open in `all` mode; larger roots open with only the root expanded.
- `Collapse`, `Expand root`, and `Expand all`: replace the expansion mode and refresh rows from the worker.
- Clicking an expandable row's chevron, indentation, or trailing blank area expands or collapses it; clicking or selecting row text does not.
- `Expand all` shows `Expanding all...` while the worker prepares rows and keeps the 100,000-row truncation message on completion.
- `Expand all` never parses raw strings; already-parsed strings participate when their display mode is `parsed`.
- `Parse as JSON`: sends `parse-string` with the row path.
- `parsed` or `raw` badge: toggles cached parsed display.
- Search: debounced worker search, result reveal, row highlighting.
- `cmd+f` on macOS or `ctrl+f` on Windows/Linux focuses the viewer search input instead of opening browser find.
- Row context menu: right-click anywhere on a non-root row to copy its value or `row.copyPath`.
- String rows also expose JavaScript literal and JSON literal copy formats.
- Truncated string rows expose `View all`. The centered modal can be resized symmetrically from every edge or corner, reads one bounded page from the worker, soft-wraps without changing whitespace, automatically changes pages at scroll boundaries, and provides Copy all.
- The modal renders each real line break as a numbered logical row. Soft-wrapped fragments remain inside the same numbered row, and alternating logical rows use subtle background stripes so real and visual line boundaries stay distinguishable.
- Expandable rows expose `Expand recursively`, which opens only that subtree and keeps the 100,000-row cap.
- Recursive expansion never parses raw strings; already parsed string subtrees participate when displayed as parsed.
- Standalone performance hint: the close button hides it immediately and stores a local dismissed preference; direct-page warnings ignore that preference and remain non-dismissible.

## Contracts

- Do not parse large JSON on the main thread.
- Do not keep the full parsed root in `JsonViewerApp`.
- Do not attach complete long strings to rows or keep them in the dialog after it closes.
- Full-string text must use `textContent` and preserve consecutive spaces, tabs, and line breaks; wrapping is visual only.
- Base automatic expansion on bounded row count, not source byte size; row summaries and worker-to-UI transfer are the relevant costs.
- Keep controls tied to worker responses; the UI should not invent row data.
- Close transient context menus on scroll, outside click, and Escape.
- Search reveal must add explicit ancestors or remove all-mode collapsed exceptions before scrolling to the matching row.
- Keep standalone hint dismissal local to the extension origin and independent from direct-page warnings.

## Verification

- Run `npm test -- test/expansionState.test.mjs test/standalonePerformanceHint.test.mjs test/projectFiles.test.mjs test/searchHighlight.test.mjs`.
- For visual changes, load the unpacked extension and check standalone plus embedded viewer flows.
