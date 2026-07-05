# AZ JSON Explorer Chrome Extension

Chrome MV3 extension for browsing JSON documents without blocking the page UI.

## Features

- Automatically replaces raw JSON pages with a tree viewer.
- Provides a standalone viewer from the extension popup.
- Parses JSON in a Web Worker.
- Searches the parsed JSON tree in a Web Worker, with chunked scanning for long strings.
- Renders only visible rows with virtual scrolling.
- Shows `Parse as JSON` before string values that look like object or array JSON.
- Marks parsed strings with a `parsed` badge.
- Clicking the badge toggles between original string and cached parsed value.

This project intentionally does not include a JSON editor.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this repository folder.
5. To preview local `file://` JSON files directly in Chrome, open the extension details and enable `Allow access to file URLs`.

After loading, open a raw JSON URL or click the extension action and choose `Open AZ JSON Explorer`.

## Development

Run tests:

```bash
npm test
```

Generate a large local fixture:

```bash
node fixtures/large-sample-generator.mjs 50000
```

## Architecture

- `src/contentScript.js`: detects raw JSON pages and injects the extension viewer iframe.
- `src/viewer.html`: standalone and embedded viewer shell.
- `src/ui/viewerApp.js`: virtualized tree UI and user interactions.
- `src/worker/jsonWorker.js`: root JSON and nested string parsing.
- `src/core/treeModel.js`: visible row model.
- `src/core/parseCache.js`: nested parse cache and raw/parsed display state.
