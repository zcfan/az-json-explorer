[简体中文](CHANGELOG.zh-CN.md)

# Changelog

This file records published AZ JSON Explorer versions. It is updated only when a version is released.

## 0.1.14 — 2026-08-19

- Added dark mode that follows the browser's color preference across standalone and embedded viewers, including controls, JSON syntax, search highlights, dialogs, and the initial loading background.

## 0.1.13 — 2026-08-05

- Added click-to-navigate Sticky ancestor rows for up to ten JSON nesting levels, including parsed-string badges, so deep context remains visible while scrolling.
- Made the JSON tree denser and easier to scan with compact rows and parse badges, indentation guides, quieter keys, stronger values, and simplified value placement.
- Restricted expansion and collapse to the chevron or its leading indentation, preventing navigation clicks and trailing row clicks from collapsing nodes accidentally.
- Refined search navigation so query completion reveals the first match, explicit navigation centers matches when possible, background result refreshes no longer move the viewport, and matched rows remain clearly but softly highlighted.

## 0.1.12 — 2026-07-31

- Fixed paste handling so clipboard text stays in a focused search or other editable control instead of replacing the JSON input; pasting from non-editable viewer areas still replaces and parses the JSON input.

## 0.1.11 — 2026-07-28

- Added a localized Pro Tips guide for faster shortcut-and-paste workflows, input resizing, isolated views, and project integration.
- Added complete English and Simplified Chinese localization across extension surfaces and the viewer, following Chrome's UI language automatically.
- Made the manual JSON input vertically resizable, remembered its height across refreshes, and limited it to 30% of the viewport height.
- Remembered whether History is open and its width across refreshes, limited it to half the viewport width, and added a full-area shortcut for restoring the most recent history entry.
- Simplified embedded JSON pages by hiding standalone input controls, preserved native select-all behavior in editable fields, and restored the connecting line beneath view tabs.
- Ensured the global viewer shortcut brings its Chrome window to the foreground.

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
