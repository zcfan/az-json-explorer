# Chrome 应用商店文案草稿

## 产品信息

名称：
AZ JSON Explorer

简短说明：
解析嵌套 JSON 字符串，在独立标签页中查看任意路径，并从本地历史记录重新打开最近输入。

类别：
开发者工具

语言：
简体中文

## 详细说明

AZ JSON Explorer 是一款本地优先的 JSON 查看器，适合查看 API 响应、日志、测试数据和本地文件。

它围绕三种高频工作流设计：

核心功能：
- 解析为 JSON：将转义的对象或数组转换为可浏览的树节点，同时保留原始字符串，方便随时切换原始视图和已解析视图。
- 独立视图：在单独的标签页中打开任意对象、数组或 JSON 字符串。每个标签页分别保留自己的原始/已解析模式和搜索状态。
- 历史记录：从浏览器本地历史记录中重新打开成功解析的手动输入和文件，并恢复标签页及各标签页的查看状态。

AZ JSON Explorer 既可以直接接管 Chrome 中的原始 JSON 页面，也可以在独立查看器中处理手动输入和本地文件。JSON 解析和搜索在 Web Worker 中执行，配合虚拟滚动，即使面对大型数据树也能保持流畅。

界面支持英语和简体中文，并自动跟随 Chrome 的界面语言。

历史记录会保存在你的本地浏览器中，直到你主动清理。JSON 内容不会上传、同步或发送到任何外部服务器。

喜欢 AZ JSON Explorer？欢迎在 GitHub 上为项目点个 Star：
https://github.com/zcfan/az-json-explorer

本扩展不会：
- 编辑 JSON。
- 将 JSON 内容上传、同步或发送到服务器。

## 推荐商店配文

标题：
解析嵌套 JSON，聚焦任意路径，随时回看历史。

功能亮点：
- 解析嵌套 JSON 字符串，同时保留原始内容。
- 在独立、可搜索的标签页中专注查看任意 JSON 路径。
- 从浏览器本地历史记录中重新打开最近的手动输入和文件。

喜欢 AZ JSON Explorer？欢迎在 GitHub 上为项目点个 Star：
https://github.com/zcfan/az-json-explorer

## 隐私与权限说明

AZ JSON Explorer 在浏览器本地处理 JSON。扩展不会收集、出售、传输用户数据，也不会将用户数据存储在外部服务器上。

扩展需要在 HTTP、HTTPS 和文件网址上运行，以检测原始 JSON 页面并将其替换为查看器。如需预览本地文件，用户必须在 Chrome 扩展详情页中主动开启“允许访问文件网址”。

## 素材清单

- 商店图标：../assets/icon-128.png
- 小型宣传图：./promo-small-440x280.png
- 大型宣传图：./promo-marquee-1400x560.png
- 截图：
  - ./screenshot-1-isolated-view-context-menu-1280x800.png
  - ./screenshot-2-isolated-view-raw-1280x800.png
  - ./screenshot-3-isolated-view-parsed-1280x800.png
