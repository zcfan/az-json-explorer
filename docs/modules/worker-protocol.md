# Worker Protocol

## Purpose

The worker owns expensive JSON work and retained parsed state. The UI should coordinate requests and render summaries, not hold or clone the full parsed root.

## Key Files

- `src/worker/jsonWorker.js`
- `src/worker/historyStore.js`
- `src/core/treeModel.js`
- `src/core/treeSearch.js`
- `test/jsonWorker.test.mjs`

## Retained State

The worker keeps:

- `retainedRootValue`: the parsed root JSON value.
- `retainedParseCache`: nested string parse entries keyed by `pathKey(path)`.
- `retainedHistoryId`: the IndexedDB history record backing the current root, when applicable.

Parsing a new root resets the retained value, nested parse cache, and active history association before an optional new history record is created.

## Parse History Storage

The worker owns parse history through IndexedDB. Successful manual-input and user-opened-file parses are retained indefinitely; parse failures, samples, embedded page takeovers, and external launches are not added automatically.

Two object stores keep large and frequently updated data separate:

- `parse-history-contents`: the original text or file Blob, written once.
- `parse-history-entries`: title, source type, byte size, bounded source preview, timestamps, and the lightweight viewer-session snapshot.

This lets tab or search-query changes update metadata without rewriting a large JSON source. History listing is ordered by `lastViewedAt` and cursor-paged; list responses contain only the bounded preview, never source content. Creating or successfully opening a record updates its viewed time, while background session saves do not affect ordering.

## Message Types

`parse-root`:

- Input: `{ text }`, `{ file }`, or `{ blob }`.
- Output: root summary only.
- When `nodeCountLimit` is provided, also counts fully expanded tree rows up to that limit and reports whether the count was truncated.
- Side effect: stores parsed root and clears nested parse cache.
- With `historyEntry`, adds the successful source to IndexedDB and returns `historyId`. A history-write failure does not turn a successful JSON parse into a parse failure.

`list-history`:

- Returns at most 100 newest-first metadata items, with an opaque next-page cursor.
- Never returns source text, Blob content, or full session data.

`save-history-session`:

- Updates only the active history entry's small session metadata.
- Adds the worker's parsed-string path list so parsed caches needed by restored tab modes can be rebuilt.

`open-history`:

- Reads the selected source inside the worker, parses it as the new retained root, and returns root summary plus the saved lightweight session.
- Replays saved parsed-string paths in path-depth order without activating global display modes.
- Updates `lastViewedAt` after a successful reopen so the item becomes the newest history entry.

`cleanup-history`:

- Accepts a non-negative `keep` count and deletes every entry after the newest `keep` items by `lastViewedAt`.
- Deletes entry metadata and its matching source content in one IndexedDB transaction.
- This is the only retention cleanup path; the worker never invokes it automatically.

`parse-string`:

- With `text`: parses standalone text and returns parsed value. This path is used by tests and utility callers.
- With `path`: resolves the value from the current visible tree and stores parsed cache for that path.
- With `activateDisplay: false`: caches the parsed value for an isolated tab while leaving the source display mode and source-row parse error untouched.

`toggle-parsed-display`:

- Toggles a cached parsed string between `parsed` and `raw`.
- Fails if there is no parsed value for the path.

`copy-node`:

- Resolves a node by its visible path only when the user invokes a copy action.
- Supports value, raw string, JavaScript string literal, and JSON string literal formats.
- Raw-string copy always returns the original string even if that row is currently displayed as parsed.
- Returns clipboard text, never the parsed container itself. Object and array values are formatted as two-space JSON.

`read-string-range`:

- Resolves a string through the current parse-aware visible path only after the user opens `View all`.
- Accepts `effective: true` for a parsed string tab, so a nested string inside cached parsed JSON is read instead of the original source string.
- Accepts UTF-16 `offset` and `length` and returns the exact source slice plus `nextOffset`, `totalLength`, and paging state.
- Caps each response at 256 KiB and 2,000 line breaks so a newline-dense string cannot create an unbounded DOM page.
- Extends page edges when necessary to avoid splitting a surrogate pair or CRLF.

`search-string`:

- Resolves the same raw or effective string value used by an isolated string tab.
- Searches the complete retained string in bounded chunks without transferring it to the UI.
- Returns capped match previews, absolute UTF-16 offsets, and line locations so the UI can load and highlight the selected match's page.

`collect-visible-rows`:

- Uses `collectVisibleRows` and returns display rows only.
- Adds summary fields such as `displayValue`, `valueTruncated`, `valueLength`, `canParseAsJson`, `hasParsed`, `parsedKind`, and `copyPath`.
- Accepts `expansionMode`, `expandedKeys`, `recursiveExpandedKeys`, and `collapsedKeys`.
- Accepts `rootPath` to scope collection to an isolated subtree while preserving canonical paths.
- Accepts a root `raw`/`parsed` mode snapshot so an open parsed-string tab does not change when the source row toggles.
- Recursive subtree roots and collapsed exceptions stay compact and request-scoped.
- Enforces `maxRows` before display summaries cross to the UI and reports truncation through `truncated`.

`search-tree`:

- Searches the retained tree after applying parsed-string display state.
- Accepts the same isolated `rootPath` and root-mode snapshot as row collection.
- For parsed display mode, searches parsed descendants instead of the original string text.
- Returns path-aware matches and truncation state.

## Important Detail: Visible Path Resolution

Nested parse actions must resolve through already parsed string ancestors. For example, after parsing `root.payload`, the path `['payload', 'items', 0, 'extra']` refers to a string inside `JSON.parse(root.payload)`, not the original root object. `getVisibleValueAtPath` handles that transition.

## Contracts

- Do not return full containers to the UI from `parse-root` or `collect-visible-rows`.
- Keep worker responses serializable.
- Keep history sources in IndexedDB and out of list/UI responses. Do not add automatic retention cleanup.
- Keep parse failures as structured responses, not thrown worker errors.
- Keep expansion state request-scoped; the worker must not retain UI expansion mode or exceptions.
- Only produce full copied value text in direct response to `copy-node`; `read-string-range` stays bounded and neither path adds full text to retained row summaries.
- Keep automatic-expansion sizing in the worker and bound it with `nodeCountLimit`; source bytes are not a reliable proxy for expanded row work.
- Row `copyPath` must be computed in the worker from the same parse cache that shapes visible rows.

## Verification

- Run `npm test -- test/jsonWorker.test.mjs`.
- Run full `npm test` after protocol changes.
