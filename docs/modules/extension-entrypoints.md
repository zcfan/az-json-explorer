# Extension Entrypoints

## Purpose

This module wires Chrome extension surfaces to the shared viewer. It should stay thin: detect how the viewer is launched, pass source data to `viewerApp`, and avoid business logic.

## Key Files

- `manifest.json`: MV3 declaration for the extension action, options page, content script, and web-accessible modules.
- `_locales/en/messages.json` and `_locales/zh_CN/messages.json`: Chrome-native English and Simplified Chinese catalogs.
- `src/background.js`: opens the standalone viewer from the extension action and brokers external launches.
- `src/core/i18n.js`: translates dynamic copy, localizes annotated DOM copy, and exposes Chrome's UI language to the document.
- `src/viewer.html`: full-page viewer shell with `#app`.
- `src/viewer.js`: creates the viewer app and bridges embedded iframe messages.
- `src/contentScript.js`: mounts the embedded iframe on detected JSON pages.

## Launch Modes

Standalone:

1. Clicking the extension action or pressing the global `Ctrl+Shift+6` command (`Command+Shift+6` on macOS) asks `background.js` to open `src/viewer.html` directly in a new active tab.
2. `viewer.js` mounts `viewerApp` with `embedded: false`.
3. User can paste JSON, open a local file, or load the sample.

Embedded page takeover:

1. `contentScript.js` imports page detection helpers.
2. It replaces the page body with an iframe pointing to `src/viewer.html?embedded=1`.
3. It posts either `load-json-file` with a Blob/File-like payload or `load-json` with text.
4. `viewer.js` forwards the payload to `viewerApp`.

External launch:

1. A normal webpage posts the public protocol to the content-script bridge, or another extension sends it to this extension ID.
2. `background.js` validates and temporarily retains the JSON text, then opens `viewer.html?launch=<id>` in a new active tab.
3. The viewer claims that one-time launch ID, removes it from the URL, and calls `viewerApp.parseText()`.
4. The original caller receives success after the viewer claims the payload, or a structured error if the handoff fails.

## Contracts

- Keep `viewer.js` as bootstrapping code. UI state belongs in `src/ui/viewerApp.js`.
- Keep raw page detection helpers in `src/core/pageJsonDetection.js` so they remain testable in Node.
- Prefer file-like payloads for direct page previews. Large files should not be copied through the manual textarea path.
- Keep external launch JSON out of URLs and persistent storage. The service worker may retain it only until a viewer claims it or the handoff times out.
- Keep the standalone command permission-free. It opens an empty viewer and does not read the clipboard.
- Keep English as `default_locale`; Chrome selects Simplified Chinese automatically from its UI language.
- Every Manifest `__MSG_*__`, `translate(...)`, and `data-i18n*` key must exist in both locale catalogs with matching placeholders.
- Webpage `open` requests require one recent trusted click; `ping` does not. Other extensions use `runtime.onMessageExternal` and are rate limited by sender ID.
- `manifest.json` must keep `src/viewer.html`, `src/core/*.js`, `src/ui/*.js`, and `src/worker/*.js` web-accessible because the embedded iframe and dynamic imports depend on them.
- Chrome Web Store packages must include `_locales` alongside `manifest.json`, `assets`, and `src`.

## Verification

- `test/projectFiles.test.mjs` checks manifest shape, direct extension-action launch, viewer product naming, embedded message paths, and file-like direct preview behavior.
- `test/i18n.test.mjs` checks locale parity, placeholder parity, source key coverage, fallback behavior, UI-language propagation, and release packaging.
- `npm test` should pass after any entrypoint change.
