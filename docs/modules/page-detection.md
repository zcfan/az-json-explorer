# Page Detection

## Purpose

Page detection decides whether the content script should replace the current browser page with the JSON viewer. The decision must be conservative because false positives would destroy ordinary web pages.

## Key Files

- `src/core/pageJsonDetection.js`
- `src/contentScript.js`
- `test/pageJsonDetection.test.mjs`

## Detection Rules

`detectJsonPageSource(documentLike, locationLike)` returns either:

- `{ kind: 'url', url }`: use the current URL and fetch a Blob.
- `{ kind: 'text', text }`: use text already visible in the document.
- `null`: do not mount the viewer.

The helper treats a page as likely JSON when one of these is true:

- Content type is `application/json` or ends with `+json`.
- The URL ends in `.json` and the body has a single `<pre>`.
- The body or single `<pre>` text starts and ends like a JSON object or array.

## Contracts

- Only `file:`, `http:`, and `https:` URLs can match the `.json` URL rule.
- Primitive JSON values are not enough for takeover; raw text must look like an object or array.
- Mixed HTML pages should not match, even if they contain JSON-looking text.
- Keep these helpers DOM-light and dependency-free so tests can use simple document-like objects.

## Verification

- Run `npm test -- test/pageJsonDetection.test.mjs`.
- Run full `npm test` before finishing behavior changes.
