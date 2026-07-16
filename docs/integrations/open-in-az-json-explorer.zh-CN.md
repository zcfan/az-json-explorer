# 在 AZ JSON Explorer 中打开 JSON

[English](open-in-az-json-explorer.md) | 简体中文

普通网页和其他 Chrome 插件可以把指定 JSON 打开到一个新的 AZ JSON Explorer standalone viewer 标签页。JSON 始终留在本地 Chrome 中，传递过程不会把 JSON 放进 URL，也不会写入持久化存储。

## 使用 Client Helper

将 [`integrations/az-json-explorer-client.js`](../../integrations/az-json-explorer-client.js) 复制到调用方项目中。它是一个无依赖的 ES module，会自动判断当前运行环境并选择网页或 Chrome 插件 transport。

```js
import { createAzJsonExplorerClient } from './az-json-explorer-client.js';

const client = createAzJsonExplorerClient();
const button = document.querySelector('#open-json');

button.hidden = !(await client.isAvailable());
button.addEventListener('click', () => {
  client.open(
    { orderId: 123, status: 'paid' },
    { sourceLabel: '订单 #123' },
  ).catch((error) => {
    console.error(error.code, error.message);
  });
});
```

网页必须直接在真实点击事件中调用 `open()`。每次可信点击只能发起一次 `open`，并且请求需要在点击后的 5 秒内到达。`isAvailable()` 不需要用户操作；插件不可用或 1 秒内没有响应时，它会返回 `false`。

如果调用方已经持有序列化后的 JSON 文本，请使用 `openText()`：

```js
button.addEventListener('click', () => {
  client.openText(rawResponseBody, { sourceLabel: '原始接口响应' });
});
```

`open(value)` 会先对 JavaScript value 执行 `JSON.stringify()`。因此，如果传入一个 JavaScript 字符串，它会被当作 JSON 字符串值；如果字符串本身就是一份完整的 JSON 文档，应使用 `openText(text)` 保留原始文本。

## `sourceLabel` 的作用

`sourceLabel` 是可选的来源说明，只用于帮助用户识别当前 JSON：

- 它显示在 Viewer 顶部标题栏中，位于 `AZ JSON Explorer` 之后。
- 它不参与 JSON 解析，也不会影响搜索、路径或复制结果。
- 它不会修改浏览器标签页标题。
- 网页调用未提供时，默认使用当前页面标题；标题为空时使用页面 URL。
- 其他 Chrome 插件调用未提供时，Viewer 显示 `Shared JSON`。

例如 `{ sourceLabel: '订单 #123' }` 会让 Viewer 顶部显示：

```text
AZ JSON Explorer  订单 #123
```

## 从其他 Chrome 插件调用

同一份 helper 可以直接用于插件页面和 service worker。默认目标是 Chrome Web Store 中发布的 AZ JSON Explorer：

```js
import { createAzJsonExplorerClient } from './az-json-explorer-client.js';

const client = createAzJsonExplorerClient();
await client.open({ source: 'my-extension', items: [1, 2, 3] });
```

正式发布版本的插件 ID 是 `logkfmmknmmkpflgamhddeaedneaankj`。本地 unpacked 安装会使用不同的 ID，开发时需要显式覆盖：

```js
const client = createAzJsonExplorerClient({
  extensionId: 'chrome-extensions-页面中显示的插件-id',
});
```

其他插件调用不要求用户手势。每个调用方插件每秒最多打开一个 Viewer 标签页。

## 底层消息协议

其他插件也可以不使用 helper，直接调用 v1 消息协议：

```js
const response = await chrome.runtime.sendMessage(
  'logkfmmknmmkpflgamhddeaedneaankj',
  {
    channel: 'az-json-explorer',
    version: 1,
    requestId: crypto.randomUUID(),
    type: 'open',
    jsonText: JSON.stringify({ orderId: 123 }),
    sourceLabel: '订单 #123',
  },
);
```

检测插件是否可用时，发送相同的消息外层结构，将 `type` 改为 `ping`，并省略 `jsonText`。成功响应会返回协议版本和能力列表：

```js
{
  available: true,
  protocolVersion: 1,
  capabilities: ['open', 'open-text'],
}
```

网页使用相同的消息结构，通过 `window.postMessage()` 发送。建议优先使用 helper，因为它已经处理了 `requestId` 响应关联、opaque origin、安装检测超时、序列化和统一错误转换。

响应会保留请求中的 `channel`、`version` 和 `requestId`：

```js
{
  channel: 'az-json-explorer',
  version: 1,
  requestId: '...',
  ok: true,
  result: { opened: true },
}
```

失败响应使用同一外层结构，并返回 `{ ok: false, error: { code, message } }`。

## 成功语义、限制与错误

- 每次成功的 `open` 都会创建一个新的 active Viewer 标签页，不复用已有标签页。
- Promise 成功表示 Viewer 已领取 payload，不表示 JSON 一定解析成功；解析错误会由 Viewer 展示。
- payload 暂存在 service worker 的内存中，并在 Viewer 领取后立即删除。
- 如果 Viewer 在 10 秒内没有领取 payload，本次调用会以 `HANDOFF_TIMEOUT` 失败并清理数据。
- JSON 不会写入 Object URL、URL 查询参数、后端或持久化插件存储。

helper 抛出的 `AzJsonExplorerError` 包含以下 `code` 之一：

- `NOT_AVAILABLE`：插件不可用或未按时响应。
- `USER_GESTURE_REQUIRED`：网页没有从有效的真实点击发起调用。
- `INVALID_REQUEST`：value、JSON 文本或参数不符合接口要求。
- `RATE_LIMITED`：同一调用方调用过于频繁。
- `OPEN_FAILED`：无法创建 Viewer 标签页。
- `HANDOFF_TIMEOUT`：Viewer 没有在 10 秒内领取 payload。
