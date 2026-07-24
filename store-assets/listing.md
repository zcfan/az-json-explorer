# Chrome Web Store Listing Draft

## Product Details

Name:
AZ JSON Explorer

Short description:
Parse nested JSON strings, isolate any path in its own tab, and reopen recent inputs from local history.

Category:
Developer Tools

Language:
English

## Detailed Description

AZ JSON Explorer is a local-first JSON viewer for developers working with API responses, logs, fixtures, and local files.

It is built around three focused workflows:

Key features:
- Parse as JSON: turn escaped objects or arrays into browsable tree nodes, while preserving the original string so you can switch between raw and parsed views.
- Isolated views: open any object, array, or JSON string in its own tab. Each tab keeps its own raw/parsed mode and search state.
- History: reopen successfully parsed manual inputs and files from local history, together with restored tabs and per-tab view state.

AZ JSON Explorer can replace raw JSON pages directly in Chrome or open manual input and local files in its standalone viewer. Web Worker parsing and virtual scrolling keep large trees responsive.

History is stored locally in your browser until you clean it. JSON content is never uploaded or synced to an external server.

Like AZ JSON Explorer? Star the project on GitHub:
https://github.com/zcfan/az-json-explorer

What this extension does not do:
- It is not a JSON editor.
- It does not upload, sync, or send JSON content to a server.

## Suggested Store Copy

Headline:
Parse. Isolate. Revisit.

Feature callouts:
- Parse nested JSON strings without losing the original raw value.
- Focus on any JSON path in an independent, searchable tab.
- Reopen recent manual inputs and files from local browser history.

Like AZ JSON Explorer? Star the project on GitHub:
https://github.com/zcfan/az-json-explorer

## Privacy And Permissions Notes

AZ JSON Explorer processes JSON locally in the browser. The extension does not collect, sell, transmit, or store user data on external servers.

The extension runs on HTTP, HTTPS, and file URLs so it can detect raw JSON pages and replace them with the viewer. For local file previews, users must explicitly enable file URL access in Chrome extension details.

## Asset Checklist

- Store icon: ../assets/icon-128.png
- Small promo tile: ./promo-small-440x280.png
- Marquee promo tile: ./promo-marquee-1400x560.png
- Screenshots:
  - ./screenshot-1-isolated-view-context-menu-1280x800.png
  - ./screenshot-2-isolated-view-raw-1280x800.png
  - ./screenshot-3-isolated-view-parsed-1280x800.png
