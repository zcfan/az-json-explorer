# Project Docs

These docs explain the long-lived module boundaries. One-off build plans live under `docs/superpowers/`.

## Module Map

| Module | Start Here | Owns |
| --- | --- | --- |
| Extension entrypoints | `modules/extension-entrypoints.md` | Manifest, popup, standalone viewer boot, embedded viewer message bridge. |
| Page detection | `modules/page-detection.md` | Deciding whether a browser page is likely raw JSON and safe to replace. |
| Core tree model | `modules/core-tree-model.md` | Path arrays, row flattening, parsed-string cache semantics, copy path formatting. |
| Worker protocol | `modules/worker-protocol.md` | Retained parsed root, nested parse operations, visible-row summaries, search requests. |
| Viewer UI | `modules/viewer-ui.md` | Shadow DOM shell, virtual scrolling, controls, context menu, status and errors. |
| Search | `modules/search.md` | Tree search, long-string chunk search, row highlighting. |
| Assets and fixtures | `modules/assets-and-fixtures.md` | Sample JSON, large fixture generation, Chrome Web Store assets. |
| Testing | `modules/testing.md` | Which tests protect which behavior. |

## Decision Flow

1. If the bug starts before the viewer appears, read page detection and extension entrypoints.
2. If the bug is about rows, expand/collapse, labels, or copy paths, read core tree model first.
3. If the bug involves parsed nested JSON or large payload responsiveness, read worker protocol.
4. If the bug is visual or interaction-level, read viewer UI.
5. If the bug is about matching text or result navigation, read search.

## Current Constraints

- No build step; Chrome loads source files directly.
- No external runtime dependencies.
- Node tests use the built-in `node:test` runner.
- The extension is a viewer, not an editor.
