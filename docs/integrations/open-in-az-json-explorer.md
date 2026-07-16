# Open in AZ JSON Explorer

English | [简体中文](open-in-az-json-explorer.zh-CN.md)

Webpages and other Chrome extensions can open JSON in a new AZ JSON Explorer standalone tab. The JSON remains local to Chrome and is handed to the viewer without being placed in the URL or persistent storage.

## Use The Client Helper

Copy or vendor [`integrations/az-json-explorer-client.js`](../../integrations/az-json-explorer-client.js) into the calling project. It is a dependency-free ES module and automatically selects the webpage or Chrome-extension transport.

```js
import { createAzJsonExplorerClient } from './az-json-explorer-client.js';

const client = createAzJsonExplorerClient();
const button = document.querySelector('#open-json');

button.hidden = !(await client.isAvailable());
button.addEventListener('click', () => {
  client.open(
    { orderId: 123, status: 'paid' },
    { sourceLabel: 'Order #123' },
  ).catch((error) => {
    console.error(error.code, error.message);
  });
});
```

Call `open()` directly from the click handler. Webpages get one `open` request per trusted click, and that request must arrive within five seconds. `isAvailable()` does not require a user gesture and returns `false` after one second when the extension is unavailable.

Use `openText()` when JSON is already serialized:

```js
button.addEventListener('click', () => {
  client.openText(rawResponseBody, { sourceLabel: 'Raw API response' });
});
```

`open(value)` treats a JavaScript string as a JSON string value. Use `openText(text)` when a string contains a complete serialized JSON document.

## Call From Another Chrome Extension

The same helper works from extension pages and service workers. It targets the published extension by default:

```js
import { createAzJsonExplorerClient } from './az-json-explorer-client.js';

const client = createAzJsonExplorerClient();
await client.open({ source: 'my-extension', items: [1, 2, 3] });
```

The published extension ID is `logkfmmknmmkpflgamhddeaedneaankj`. An unpacked local installation has a different ID, so provide it explicitly while developing:

```js
const client = createAzJsonExplorerClient({
  extensionId: 'the-id-shown-on-chrome-extensions',
});
```

Extension callers do not need a user gesture. Each caller extension can open at most one viewer per second.

## Low-Level Protocol

Extensions may call the protocol without the helper:

```js
const response = await chrome.runtime.sendMessage(
  'logkfmmknmmkpflgamhddeaedneaankj',
  {
    channel: 'az-json-explorer',
    version: 1,
    requestId: crypto.randomUUID(),
    type: 'open',
    jsonText: JSON.stringify({ orderId: 123 }),
    sourceLabel: 'Order #123',
  },
);
```

For installation discovery, send the same envelope with `type: 'ping'` and omit `jsonText`. A successful ping reports the protocol version and capabilities:

```js
{
  available: true,
  protocolVersion: 1,
  capabilities: ['open', 'open-text'],
}
```

Webpages use the same envelope with `window.postMessage()`. The included helper is recommended because it correlates responses by `requestId`, handles opaque origins, installation timeouts, serialization, and error conversion.

Responses preserve `channel`, `version`, and `requestId`:

```js
{
  channel: 'az-json-explorer',
  version: 1,
  requestId: '...',
  ok: true,
  result: { opened: true },
}
```

Failures use the same envelope with `{ ok: false, error: { code, message } }`.

## Limits And Errors

- Every successful `open` creates a new active viewer tab.
- Success means the viewer claimed the payload; parse errors are displayed in the viewer.
- Payloads expire if the viewer does not claim them within ten seconds.
- The JSON is never stored in an Object URL, query parameter, backend, or persistent extension storage.

The helper throws `AzJsonExplorerError` with one of these codes:

- `NOT_AVAILABLE`
- `USER_GESTURE_REQUIRED`
- `INVALID_REQUEST`
- `RATE_LIMITED`
- `OPEN_FAILED`
- `HANDOFF_TIMEOUT`
