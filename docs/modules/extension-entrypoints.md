# Extension Entrypoints

## Purpose

This module wires Chrome extension surfaces to the shared viewer. It should stay thin: detect how the viewer is launched, pass source data to `viewerApp`, and avoid business logic.

## Key Files

- `manifest.json`: MV3 declaration for popup, options page, content script, and web-accessible modules.
- `src/popup.html`: small popup UI.
- `src/popup.js`: opens `src/viewer.html` in a new tab.
- `src/viewer.html`: full-page viewer shell with `#app`.
- `src/viewer.js`: creates the viewer app and bridges embedded iframe messages.
- `src/contentScript.js`: mounts the embedded iframe on detected JSON pages.

## Launch Modes

Standalone:

1. Popup opens `src/viewer.html`.
2. `viewer.js` mounts `viewerApp` with `embedded: false`.
3. User can paste JSON, open a local file, or load the sample.

Embedded page takeover:

1. `contentScript.js` imports page detection helpers.
2. It replaces the page body with an iframe pointing to `src/viewer.html?embedded=1`.
3. It posts either `load-json-file` with a Blob/File-like payload or `load-json` with text.
4. `viewer.js` forwards the payload to `viewerApp`.

## Contracts

- Keep `viewer.js` as bootstrapping code. UI state belongs in `src/ui/viewerApp.js`.
- Keep raw page detection helpers in `src/core/pageJsonDetection.js` so they remain testable in Node.
- Prefer file-like payloads for direct page previews. Large files should not be copied through the manual textarea path.
- `manifest.json` must keep `src/viewer.html`, `src/core/*.js`, `src/ui/*.js`, and `src/worker/*.js` web-accessible because the embedded iframe and dynamic imports depend on them.

## Verification

- `test/projectFiles.test.mjs` checks manifest shape, popup/viewer product naming, embedded message paths, and file-like direct preview behavior.
- `npm test` should pass after any entrypoint change.
