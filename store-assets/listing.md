# Chrome Web Store Listing Draft

## Product Details

Name:
AZ JSON Explorer

Short description:
View large JSON and parse nested JSON strings into browsable trees with one click.

Category:
Developer Tools

Language:
English

## Detailed Description

AZ JSON Explorer is a fast JSON viewer for developers working with API responses, logs, fixtures, and local JSON files.

Many APIs return objects or arrays as escaped string fields. AZ JSON Explorer detects string values that look like JSON and shows a Parse as JSON action, so you can expand them into a normal tree without copying the value into another tool.

Key features:
- Parse nested JSON strings into browsable trees with one click.
- Browse raw JSON pages directly in Chrome.
- Open local JSON files in the standalone viewer.
- Parse JSON in a Web Worker so large files do not block the page UI.
- Use virtual scrolling to keep large JSON trees responsive.
- Search across the parsed JSON tree.
- Toggle parsed string values back to their original raw string form.

What this extension does not do:
- It is not a JSON editor.
- It does not upload, sync, or send JSON content to a server.

## Suggested Store Copy

Headline:
Parse nested JSON strings with one click

Feature callouts:
- Turn escaped JSON strings into normal tree nodes.
- Keep large JSON responsive with worker parsing and virtual scrolling.
- Search API responses, logs, fixtures, and local files without leaving Chrome.

## Privacy And Permissions Notes

AZ JSON Explorer processes JSON locally in the browser. The extension does not collect, sell, transmit, or store user data on external servers.

The extension runs on HTTP, HTTPS, and file URLs so it can detect raw JSON pages and replace them with the viewer. For local file previews, users must explicitly enable file URL access in Chrome extension details.

## Asset Checklist

- Store icon: ../assets/icon-128.png
- Small promo tile: ./promo-small-440x280.png
- Marquee promo tile: ./promo-marquee-1400x560.png
- Screenshots:
  - ./screenshot-1-detect-nested-json-string-1280x800.png
  - ./screenshot-2-one-click-parsed-tree-1280x800.png
  - ./screenshot-3-search-parsed-json-1280x800.png
  - ./screenshot-4-large-json-navigation-1280x800.png
