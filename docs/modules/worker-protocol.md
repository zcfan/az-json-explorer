# Worker Protocol

## Purpose

The worker owns expensive JSON work and retained parsed state. The UI should coordinate requests and render summaries, not hold or clone the full parsed root.

## Key Files

- `src/worker/jsonWorker.js`
- `src/core/treeModel.js`
- `src/core/treeSearch.js`
- `test/jsonWorker.test.mjs`

## Retained State

The worker keeps:

- `retainedRootValue`: the parsed root JSON value.
- `retainedParseCache`: nested string parse entries keyed by `pathKey(path)`.

Parsing a new root resets both values.

## Message Types

`parse-root`:

- Input: `{ text }`, `{ file }`, or `{ blob }`.
- Output: root summary only.
- When `nodeCountLimit` is provided, also counts fully expanded tree rows up to that limit and reports whether the count was truncated.
- Side effect: stores parsed root and clears nested parse cache.

`parse-string`:

- With `text`: parses standalone text and returns parsed value. This path is used by tests and utility callers.
- With `path`: resolves the value from the current visible tree and stores parsed cache for that path.

`toggle-parsed-display`:

- Toggles a cached parsed string between `parsed` and `raw`.
- Fails if there is no parsed value for the path.

`copy-node`:

- Resolves a node by its visible path only when the user invokes a copy action.
- Supports value, JavaScript string literal, and JSON string literal formats.
- Returns clipboard text, never the parsed container itself. Object and array values are formatted as two-space JSON.

`collect-visible-rows`:

- Uses `collectVisibleRows` and returns display rows only.
- Adds summary fields such as `displayValue`, `canParseAsJson`, `hasParsed`, and `copyPath`.
- Accepts `expansionMode`, `expandedKeys`, `recursiveExpandedKeys`, and `collapsedKeys`.
- Recursive subtree roots and collapsed exceptions stay compact and request-scoped.
- Enforces `maxRows` before display summaries cross to the UI and reports truncation through `truncated`.

`search-tree`:

- Searches the retained raw parsed root.
- Returns path-aware matches and truncation state.

## Important Detail: Visible Path Resolution

Nested parse actions must resolve through already parsed string ancestors. For example, after parsing `root.payload`, the path `['payload', 'items', 0, 'extra']` refers to a string inside `JSON.parse(root.payload)`, not the original root object. `getVisibleValueAtPath` handles that transition.

## Contracts

- Do not return full containers to the UI from `parse-root` or `collect-visible-rows`.
- Keep worker responses serializable.
- Keep parse failures as structured responses, not thrown worker errors.
- Keep expansion state request-scoped; the worker must not retain UI expansion mode or exceptions.
- Only produce full copied value text in direct response to `copy-node`; never add it to retained row summaries.
- Keep automatic-expansion sizing in the worker and bound it with `nodeCountLimit`; source bytes are not a reliable proxy for expanded row work.
- Row `copyPath` must be computed in the worker from the same parse cache that shapes visible rows.

## Verification

- Run `npm test -- test/jsonWorker.test.mjs`.
- Run full `npm test` after protocol changes.
