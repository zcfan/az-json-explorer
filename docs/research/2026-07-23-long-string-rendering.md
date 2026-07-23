# 超长字符串展示：VS Code / Monaco 的证据与本项目结论

## 结论

VS Code 的例子有借鉴意义，但可迁移的不是“开启自动换行就会更快”，而是下面两个原则：

1. **列表默认只传输、只渲染有上限的预览；完整内容按用户动作再取。**
2. **打开完整内容后，也要限制一次进入 DOM 和浏览器排版管线的文本量。**

对本项目，建议保留当前单行预览，在截断字符串行尾增加 `View all`。弹窗对普通长度字符串直接完整展示；对极端长度字符串使用按需分段/分页或虚拟化的只读查看器，并提供 `Copy all`。不能把数百万字符一次塞进一个 `pre-wrap` 文本节点后假定性能问题已经解决。

## 官方资料确认了什么

### 1. VS Code 确实会用换行规避超长横向内容

VS Code 维护者明确说明：对于内容主要由超长行组成的文件，编辑器会启用换行；原因是编辑器**只有纵向渲染虚拟化，没有横向渲染虚拟化**。该机制是为避免渲染超长行导致 UI freeze 的 workaround。见 VS Code issue [#215407 的维护者说明](https://github.com/microsoft/vscode/issues/215407#issuecomment-2164639370)及[后续总结](https://github.com/microsoft/vscode/issues/215407#issuecomment-2166696818)。

VS Code 的行层只让可见行进入 DOM；源码中的 `renderText()` 调用 `VisibleLinesCollection.renderLines(viewportData)`，见 [`viewLines.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/editor/browser/viewParts/viewLines/viewLines.ts#L613-L618)。

**推断：** 当一条逻辑长行被拆成许多有界宽度的视觉行后，已有的纵向虚拟化可以发挥作用；不换行时，整条超宽视觉行缺少等价的横向虚拟化。这解释了用户观察到的“同样数据，换行后反而可用”。

### 2. Monaco 默认不会无限渲染单行

Monaco 官方 API 把 `stopRenderingLineAfter` 定义为性能保护：默认在 10,000 字符后停止渲染，`-1` 才表示无限制，见 [Monaco `IEditorOptions`](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor_editor_api.editor.IEditorOptions.html#stoprenderinglineafter)。

VS Code 源码也以 10,000 为默认值，见 [`editorOptions.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/editor/common/config/editorOptions.ts#L6695-L6698)；渲染器在 token 和 HTML 生成前就把本次渲染长度限制到该值，见 [`viewLineRenderer.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/editor/common/viewLayout/viewLineRenderer.ts#L471-L481)。

这说明成熟编辑器的做法不是“用户要完整内容，就默认把完整长行交给浏览器”，而是先设硬上限，再提供显式查看路径。

### 3. 浏览器本身存在超宽内容边界

VS Code 维护者在调查长行问题时确认，Chromium 会在约一百万像素处截断渲染，见 issue [#164663](https://github.com/microsoft/vscode/issues/164663#issuecomment-1292154853)。这至少证明：让单个元素横向增长到任意宽度并不可靠。

### 4. “换行更快”不是普遍规律

VS Code 官方设置说明把 `wrappingStrategy: simple` 描述为适用于等宽字体/部分文字体系的快速算法；`advanced` 会把换行点计算委托给浏览器，是慢算法，并可能冻结大文件，见 [`editorOptions.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/editor/common/config/editorOptions.ts#L3034-L3044)。对应性能问题也记录在官方 issue [#117106](https://github.com/microsoft/vscode/issues/117106#issuecomment-783519862)。

此外，VS Code 的大文件优化会主动关闭换行以避免内存和响应性问题，见 issue [#281661 的维护者说明](https://github.com/microsoft/vscode/issues/281661#issuecomment-4898713507)。

因此：

- 少数极端长行 + 只有纵向虚拟化：换行可能显著改善性能。
- 大量文本 + 浏览器负责复杂换行：换行可能增加布局、内存和视觉行数量，反而更慢。
- Monaco 的快速换行是编辑器自己的“simple”算法；普通 DOM 的 CSS 自动换行不能直接等同于它。

## 对本项目的直接映射

当前架构有两个正确基础：

- worker 保留完整解析树，`collect-visible-rows` 只向 UI 返回摘要。
- 树使用固定 28px 行高的纵向虚拟列表，只挂载视口行和 overscan。

当前字符串预览在 worker 中截到 240 个 JSON 字面量字符，见 [`jsonWorker.js`](../../src/worker/jsonWorker.js#L43-L47)；UI 只渲染 `displayValue`，见 [`viewerApp.js`](../../src/ui/viewerApp.js#L639-L644)。`View all` 不应破坏这个边界。

### 建议的数据协议

- 行摘要新增 `valueTruncated` 和原始字符串长度；不要把完整字符串放进 row。
- 点击 `View all` 后，用 `path` 向 worker 请求内容。
- 普通长度可一次返回；极端长度改为 `{ path, offset, length }` 分段请求，并返回 `totalLength`。
- 完整复制继续由 worker 按显式用户动作生成；UI 不长期缓存完整字符串。
- parsed/raw 状态下必须沿用现有 parse-aware path 解析，保证看到的值与当前树状态一致。

### 建议的弹窗渲染

- 内容是只读纯文本，使用 `textContent`，不使用 `innerHTML`。
- 使用软换行限制横向宽度，但必须**如实保留所有空格和换行**；不能 trim、合并空格或为美观重排内容。CSS 可采用 `white-space: break-spaces; overflow-wrap: anywhere`；`break-spaces` 的保留语义见 [CSS Text Module Level 3](https://drafts.csswg.org/css-text-3/#valdef-white-space-break-spaces)。
- 普通长度字符串可完整放入一个文本节点。
- 超过实测安全阈值后，不一次创建完整文本节点；使用有界分段/分页或虚拟化查看器。分页仍可保证每个字符都可查看，并通过 `Copy all` 满足整体复制。
- 分段只能改变渲染批次，不能改变字符；边界至少不能拆开 UTF-16 surrogate pair 或 CRLF。

固定行高的树虚拟列表不能直接复用到弹窗，因为换行后块高是可变的。若选择虚拟化，需要独立的分块高度策略；若目标是先可靠交付，分页比可变高度虚拟化简单。

## 不建议直接照搬的部分

- 不复制 Monaco 的 10,000 阈值。它是代码编辑器、token/span 渲染和编辑交互下的参数，不是本只读 JSON viewer 的通用安全值。
- 不把“开启 CSS 自动换行”当作唯一性能措施。它解决超宽内容，却可能把成本转成大量换行计算和纵向布局。
- 不在主树行内展开完整字符串。那会破坏固定行高和当前虚拟滚动模型。
- 不用 tooltip/title 承载完整文本；这会把大字符串重新放回主线程 DOM 属性。

## 建议验证矩阵

用 1K、10K、100K、1M、10M 字符测试：

- ASCII 无空格、带空格文本、CJK、emoji、反斜杠/引号密集文本、真实换行和连续空格。
- 指标：弹窗首次可交互时间、最长主线程任务、滚动/resize 卡顿、worker→UI 传输量、关闭弹窗后的内存回落。
- 行为：内容首尾和长度一致；空格/换行不变；搜索、选择、`Copy all`、关闭/重开均正确。

安全阈值应由这组测试决定，而不是由 VS Code 的阈值类推。
