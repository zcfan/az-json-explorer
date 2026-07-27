[简体中文](CHANGELOG.zh-CN.md)

# Changelog

This file records published AZ JSON Explorer versions. It is updated only when a version is released.

## 0.1.10 — 2026-07-27

- Open the standalone viewer directly from the extension icon or with the global `Cmd/Ctrl+Shift+6` shortcut.
- Paste, select all, or show and hide the JSON input without focusing it first; redirected paste now replaces the existing input and parses immediately.
- Added a Help menu with grouped keyboard-shortcut guidance and direct changelog access.
- Added a one-time update notice for each new version, with a 10-second progress indicator and a link to what changed.

## 0.1.9 — 2026-07-25

- Added isolated view tabs for opening objects, arrays, and strings without leaving the full document.
- Added tab-local raw and parsed views for nested JSON strings.
- Added persistent parse history with restore, retention, and cleanup controls.
- Refined history interactions, tab states, and tab borders.

## 0.1.8 — 2026-07-23

- Added a paged, read-only viewer for complete long string values.
- Added line numbers, full-value copying, and full-string search without transferring the entire string to the UI.

## 0.1.7 — 2026-07-17

- Fixed search results so they refresh after a nested JSON string switches between raw and parsed views.

## 0.1.6 — 2026-07-17

- Added search support for parsed nested JSON strings.

## 0.1.5 — 2026-07-16

- Added a public integration for opening JSON from webpages and other Chrome extensions.
- Removed the external launch payload limit by passing launch data through the background worker.
- Added an install-page fallback for integration clients when the extension is unavailable.

## 0.1.4 — 2026-07-16

- Added paste, parse, and search keyboard shortcuts to the standalone viewer.
- Expanded row context-menu copy and subtree actions.
- Preserved text selection when interacting with expandable rows.
- Reorganized viewer controls for faster search access.

## 0.1.3 — 2026-07-14

- Added row-click expansion and collapse.
- Added automatic full expansion for small JSON documents.

## 0.1.2 — 2026-07-13

- Added worker-backed `Expand all` with compact expansion state for large trees.
- Improved the standalone large-file performance hint and made it dismissible.

## 0.1.1 — 2026-07-07

- Added manual JSON input and formatting in the standalone viewer.
- Added parse-aware JavaScript copy paths for descendants of parsed JSON strings.
- Refined the Chrome Web Store listing and installation guidance.

## 0.1.0 — 2026-07-05

- Published the initial Chrome MV3 extension.
- Added automatic raw JSON page detection and an embedded tree viewer.
- Added a standalone viewer with local file loading.
- Added worker-based parsing and search, virtualized rows, and nested JSON string parsing.
- Kept all JSON processing local, without a backend or telemetry.
