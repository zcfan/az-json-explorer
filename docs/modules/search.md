# Search

## Purpose

Search finds text in keys and primitive values without blocking on very large strings. Worker search returns path-aware matches; UI search highlights only visible rows.

## Key Files

- `src/core/textSearch.js`
- `src/core/treeSearch.js`
- `src/ui/searchHighlight.js`
- `test/textSearch.test.mjs`
- `test/treeSearch.test.mjs`
- `test/searchHighlight.test.mjs`

## Core Search

`findTextMatches(text, query, options)` scans large strings in chunks:

- default chunk size: 256 KB
- overlap: query length minus one, so boundary-spanning matches are found
- preview context: 42 chars by default
- `maxResults` caps output and reports truncation

`searchJsonTree(rootValue, query, options)` walks the parsed tree:

- matches string, number, boolean, and null values
- matches object keys
- returns `path`, `pathKey`, `pathLabel`, `source`, `kind`, and preview metadata
- yields every `yieldEvery` visited nodes

## UI Highlighting

`splitHighlightedText` splits visible row text into plain and highlighted segments.

`getRowSearchState` maps search matches to row-level flags:

- `highlighted`
- `current`
- `keyMatched`
- `valueMatched`

`viewerApp` uses those flags to highlight keys, values, current rows, and search preview text.

## Contracts

- Search runs in the worker.
- Search results should remain capped; do not return unlimited matches.
- Long string search must keep chunk-overlap behavior.
- Search paths currently follow the retained raw parsed root, not parsed-string display descendants.

## Verification

- Run `npm test -- test/textSearch.test.mjs test/treeSearch.test.mjs test/searchHighlight.test.mjs`.
- Run full `npm test` after changes touching row paths or visible row rendering.
