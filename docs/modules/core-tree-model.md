# Core Tree Model

## Purpose

The core tree model turns parsed JSON values into stable path identities and visible row summaries. It is the shared contract between worker state and UI rendering.

## Key Files

- `src/core/path.js`
- `src/core/treeModel.js`
- `src/core/parseCache.js`
- `test/path.test.mjs`
- `test/treeModel.test.mjs`
- `test/parseCache.test.mjs`

## Concepts

Path arrays are canonical node identity:

```js
['payload', 'items', 0, 'id']
```

Use `pathKey(path)` when storing paths in maps or sets. It serializes the array with `JSON.stringify`.

`formatPath(path)` is a display label using `$`, such as `$.payload.items[0].id`.

`formatCopyPath(path, parseCache)` is a JavaScript expression rooted at `root`. It wraps parsed string ancestors with `JSON.parse(...)`, such as:

```js
JSON.parse(root.payload).items[0].extra
```

## Parse Cache Semantics

`ParseCache` tracks string nodes parsed via `Parse as JSON`:

- `originalValue`: the original string.
- `parsedValue`: parsed object or array.
- `displayMode`: `parsed` or `raw`.
- `error`: latest parse error for that path.

Parse failures keep the last successful parsed value but switch display mode to `raw`.

## Visible Rows

`collectVisibleRows(rootValue, options)` walks the tree according to one of two expansion modes. In `explicit` mode, `expandedKeys` lists individually opened containers. In `all` mode, every expandable container opens. `recursiveExpandedKeys` compactly marks subtrees that should open at every depth, while `collapsedKeys` stores manual exceptions in either mode.

It returns rows with:

- raw `value`
- `effectiveValue`, which may be parsed cache content
- raw and effective kinds
- expansion state
- parse state and parse errors

The worker converts these internal rows into UI-safe summaries before sending them to the main thread.

## Contracts

- Do not replace path arrays with string paths internally.
- Array indexes stay numeric in path arrays.
- Object child order follows `Object.keys(value)`.
- `all` mode must use collapsed-path exceptions; do not enumerate every expanded container.
- Recursive expansion must store subtree roots, not every descendant path.
- Row collection must yield every `yieldEvery` visits to avoid long blocking work.
- Copy-path formatting must stay parse-aware for nested parsed strings.

## Verification

- Run `npm test -- test/path.test.mjs test/treeModel.test.mjs test/parseCache.test.mjs`.
- Run full `npm test` after changes that affect worker or UI row behavior.
