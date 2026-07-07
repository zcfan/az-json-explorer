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
- Side effect: stores parsed root and clears nested parse cache.

`parse-string`:

- With `text`: parses standalone text and returns parsed value. This path is used by tests and utility callers.
- With `path`: resolves the value from the current visible tree and stores parsed cache for that path.

`toggle-parsed-display`:

- Toggles a cached parsed string between `parsed` and `raw`.
- Fails if there is no parsed value for the path.

`collect-visible-rows`:

- Uses `collectVisibleRows` and returns display rows only.
- Adds summary fields such as `displayValue`, `canParseAsJson`, `hasParsed`, and `copyPath`.

`search-tree`:

- Searches the retained raw parsed root.
- Returns path-aware matches and truncation state.

## Important Detail: Visible Path Resolution

Nested parse actions must resolve through already parsed string ancestors. For example, after parsing `root.payload`, the path `['payload', 'items', 0, 'extra']` refers to a string inside `JSON.parse(root.payload)`, not the original root object. `getVisibleValueAtPath` handles that transition.

## Contracts

- Do not return full containers to the UI from `parse-root` or `collect-visible-rows`.
- Keep worker responses serializable.
- Keep parse failures as structured responses, not thrown worker errors.
- Row `copyPath` must be computed in the worker from the same parse cache that shapes visible rows.

## Verification

- Run `npm test -- test/jsonWorker.test.mjs`.
- Run full `npm test` after protocol changes.
