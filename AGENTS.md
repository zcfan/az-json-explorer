# Agent Guide

This repo is a dependency-free Chrome MV3 extension for browsing JSON. It replaces likely raw JSON pages with an embedded viewer and also exposes a standalone viewer from the popup.

## First Commands

- `npm test`: run all Node tests.
- `npm run store-assets`: regenerate Chrome Web Store assets.
- Load the repo folder as an unpacked Chrome extension for browser checks. There is no build step.

## Architecture In One Pass

1. `manifest.json` registers the popup, standalone viewer, content script, and web-accessible modules.
2. `src/contentScript.js` detects likely raw JSON pages and mounts `src/viewer.html?embedded=1` in an iframe.
3. `src/viewer.js` boots `src/ui/viewerApp.js` in standalone or embedded mode.
4. `src/ui/viewerApp.js` owns DOM state, virtual rows, search controls, parse buttons, and worker messages.
5. `src/worker/jsonWorker.js` owns parsed root data, nested string parse cache, visible-row preparation, and tree search.
6. `src/core/*` modules are dependency-free logic covered by Node tests.

## Hard Boundaries

- Keep JSON processing local. Do not add a backend, telemetry, sync, or upload path.
- Keep expensive parsing, row collection, and search in the worker.
- Do not send full parsed containers back to the UI. Worker row responses are summaries.
- Preserve path arrays as the canonical node identity. Use `pathKey(path)` for map keys.
- `Parse as JSON` must preserve both the original string and parsed value.
- Copy-path behavior must be parse-aware: descendants of parsed string nodes need `JSON.parse(...)` wrapping.
- Direct file previews should pass file-like payloads to the worker, not echo large file text into the textarea.

## Where To Start

- JSON page takeover: `docs/modules/page-detection.md`
- Popup, iframe, and viewer boot: `docs/modules/extension-entrypoints.md`
- Tree rows, paths, and parse cache: `docs/modules/core-tree-model.md`
- Worker protocol and retained state: `docs/modules/worker-protocol.md`
- UI rendering and interactions: `docs/modules/viewer-ui.md`
- Search behavior: `docs/modules/search.md`
- Fixtures, assets, and store images: `docs/modules/assets-and-fixtures.md`
- Test map: `docs/modules/testing.md`

## Verification Rule

Run `npm test` before finishing any code or behavior change. For docs-only edits, run at least `git diff --check`.

## Release Rule

Before publishing any new version, follow the release checklist in
`docs/chrome-web-store-release.md`. A release is not ready until:

- `manifest.json` and `package.json` contain the same new version.
- `CHANGELOG.md` and `CHANGELOG.zh-CN.md` have matching dated sections for that
  exact version, summarizing only changes included in the release. Write the
  default file in English and the translated file in Simplified Chinese; do
  not add an `Unreleased` section.
- After drafting both new changelog sections, stop and ask the user to review
  them. Do not continue release preparation, packaging, uploading, or
  publishing until the user explicitly approves both current drafts. If
  either draft changes afterward, request approval again.
- The visible version-update notice in `src/ui/viewerApp.js` is updated for
  that release to highlight its most useful change; keep the copy concise and
  keep its link pointed at the repository changelog matching the extension's
  active language.
- The notice is verified in both standalone and embedded viewers. It must
  appear once for the new version, fill from left to right for 10 seconds, and
  then close automatically.
- Store listing text, screenshots, permission disclosures, and privacy
  information are updated when the release changes anything they describe.
- `npm test` and `npm run release:chrome -- --dry-run` pass before publishing.
