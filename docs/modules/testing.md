# Testing

## Purpose

Tests protect the extension's module boundaries: pure core logic in Node, worker protocol in Node workers, and project-file invariants through static checks.

## Command

```bash
npm test
```

The project uses Node's built-in test runner. There is no test build step.

## Test Map

| Test File | Protects |
| --- | --- |
| `test/pageJsonDetection.test.mjs` | Conservative raw JSON page takeover rules. |
| `test/path.test.mjs` | Display and copy-path formatting, including parse-aware `JSON.parse(...)` wrapping. |
| `test/clipboard.test.mjs` | Value, JavaScript string literal, and JSON string literal clipboard formatting. |
| `test/parseCache.test.mjs` | Parsed string cache, raw/parsed toggling, error preservation. |
| `test/treeModel.test.mjs` | Child paths, node kinds, visible row flattening, row caps. |
| `test/treeStats.test.mjs` | Bounded fully-expanded node counting for automatic expansion. |
| `test/textSearch.test.mjs` | Chunked long-string search and truncation. |
| `test/treeSearch.test.mjs` | Tree-wide key and primitive value search. |
| `test/searchHighlight.test.mjs` | UI search highlight segmentation and row flags. |
| `test/expansionState.test.mjs` | Explicit/all/recursive expansion transitions, collapsed exceptions, parsed-node reopening, and search reveal. |
| `test/jsonWorker.test.mjs` | Worker parse, retained root, nested parse, copy text, visible rows, search messages. |
| `test/externalLaunch.test.mjs` | Public launch validation, payload handoff, rate limiting, claim, timeout, and tab failures. |
| `test/pageLaunchBridge.test.mjs` | Webpage discovery, trusted-click gating, and bridge errors. |
| `test/integrationClient.test.mjs` | Shared webpage/extension helper transports and error behavior. |
| `test/projectFiles.test.mjs` | Manifest, entrypoint, layout, syntax, and browser-surface invariants. |

## When To Add Tests

- Add core tests for any path, parse cache, tree, detection, or search behavior.
- Add worker tests when a behavior crosses the UI-worker protocol.
- Add project-file tests for manifest, entrypoint, browser module syntax, or intentional DOM hooks.

## Manual Checks

Use Chrome's unpacked extension flow when a change affects actual browser behavior:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Load this repository folder.
4. Open a raw JSON URL or use the popup's standalone viewer.

Check expansion, virtual scrolling, `Parse as JSON`, parsed/raw toggle, search, and every applicable key context-menu action for interaction changes.
