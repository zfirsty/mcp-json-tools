# MCP JSON Tools (中文文档)

使用强大的 **Lodash** 数据操作能力和 JSONPath 查询来与本地 JSON 文件进行交互。
在 `mcp_json_eval` 工具中利用 [`lodash`](https://lodash.com/docs/) 进行操作，利用 [`jsonpath`](https://www.npmjs.com/package/jsonpath) 进行查询。

## 主要特性

*   **查询 (Query)**: 使用标准的 JSONPath 表达式选择数据。
*   **检查 (Inspect)**: 检索值及其在 JSON 结构中的精确路径。
*   **分析与修改 (使用 Lodash, ⚠️)**: 执行 JavaScript 代码，完全访问 **[`lodash`](https://lodash.com/docs/)** (`_`) 和 `jsonpath` (`jp`)，用于复杂的数据转换、分析（过滤、映射、排序、聚合等）或**本地文件修改**。
*   **简易设置**: 作为标准的 Node.js 进程运行。

## 提供的工具

### 1. `mcp_json_query`

*   **功能**: 执行 JSONPath 查询，返回匹配的值。
*   **参数**:
    *   `file_path` (字符串): JSON 文件的路径。
    *   `json_path` (字符串): JSONPath 查询表达式。
    *   `count` (数字, *可选*): 返回结果的最大数量。
*   **返回**: 包含匹配值的数组。
*   **示例：获取所有书籍作者**
    *   *目标*: 检索 store 数据中所有作者的姓名。
    *   *工具调用*: 调用 `mcp_json_query`，设置 `file_path="test-data/store.json"` 和 `json_path="$.store.book[*].author"`。
    *   *预期输出*: `["Nigel Rees", "Evelyn Waugh", "Herman Melville", "J. R. R. Tolkien"]`

### 2. `mcp_json_nodes`

*   **功能**: 执行 JSONPath 查询，返回匹配的节点 (值 + 路径)。
*   **参数**:
    *   `file_path` (字符串): JSON 文件的路径。
    *   `json_path` (字符串): JSONPath 查询表达式。
    *   `count` (数字, *可选*): 返回节点的最大数量。
*   **返回**: 对象数组 `{ path: Array<string|number>, value: any }`。
*   **示例：获取作者及其路径**
    *   *目标*: 检索作者及其在 JSON 中的位置。
    *   *工具调用*: 调用 `mcp_json_nodes`，设置 `file_path="test-data/store.json"` 和 `json_path="$.store.book[*].author"`。
    *   *预期输出 (简化)*: `[ { path: ['$', 'store', 'book', 0, 'author'], value: 'Nigel Rees' }, ... ]`

### 3. `mcp_json_eval`

*   **功能**: 执行 JavaScript 代码，可访问 JSON 数据 (`$1`)、**Lodash** (`_`) 和 `jsonpath` (`jp`)。利用 Lodash 的全部功能进行复杂的数据处理。**可以修改源文件。**
*   **参数**:
    *   `file_path` (字符串): JSON 文件的路径。
    *   `js_code` (字符串): 要执行的 JavaScript 代码。
*   **文件修改**: 若要保存更改，`js_code` 中求值的*最后表达式* **必须** 是 `({ type: 'updateFile', data: <要写入的新JSON对象> })`。
*   **返回**: JavaScript 代码的执行结果（如果是对象/数组则为字符串化结果，否则为原始值），或文件更新成功时的成功消息。
*   **⚠️ 安全警告 ⚠️**: 执行未沙箱化的代码 (`eval()`)，拥有完整的 Node.js 权限。**请极其谨慎使用，且仅用于可信代码。**
*   **示例：添加 'onSale' 属性 (修改操作)**
    *   *目标*: 为每本书添加 `onSale: false` 属性。
    *   *JavaScript 逻辑*:
        ```javascript
        // 为每本书添加 onSale: false 并准备更新
        _.forEach($1.store.book, (book) => {
          book.onSale = false;
        });
        ({ type: 'updateFile', data: $1 }); // 返回更新对象
        ```
    *   *工具调用*: 调用 `mcp_json_eval`，设置 `file_path="test-data/store.json"` 并将上述 JavaScript 逻辑作为 `js_code` 参数传入。
    *   *预期输出*: `"Successfully updated test-data/store.json"`
*   **示例：计算平均价格 (安全分析)**
    *   *目标*: 计算价格低于 $15 的小说的平均价格。
    *   *JavaScript 逻辑*:
        ```javascript
        // 使用 jsonpath 过滤书籍，并用 lodash 计算平均价格
        const books = jp.query($1, "$.store.book[?(@.category=='fiction' && @.price < 15)]");
        _.meanBy(books, 'price'); // 返回平均价格
        ```
    *   *工具调用*: 调用 `mcp_json_eval`，设置 `file_path="test-data/store.json"` 并将上述 JavaScript 逻辑作为 `js_code` 参数传入。
    *   *预期输出*: `10.99`

### 4. `mcp_json_multi_eval`

*   **功能**: 与 `mcp_json_eval` 类似，但操作于从多个文件加载的 JSON 对象数组。执行 JavaScript 代码，可访问对象数组 (`$1`)、**Lodash** (`_`) 和 `jsonpath` (`jp`)。**可以修改源文件。**
*   **参数**:
    *   `file_paths` (字符串数组): JSON 文件的路径数组。
    *   `js_code` (字符串): 要执行的 JavaScript 代码。
*   **文件修改**: 若要保存更改，`js_code` 中求值的*最后表达式* **必须** 是 `({ type: 'updateMultipleFiles', updates: [{ index: 0, data: <newData> }, ...] })`。只有 `file_paths` 中列出的文件才能被更新。
*   **返回**: JavaScript 代码的执行结果，或列出已更新文件的成功消息。
*   **⚠️ 安全警告 ⚠️**: 与 `mcp_json_eval` 具有相同的安全注意事项。

## 安装

1.  需要 [Node.js](https://nodejs.org/) (推荐 v18 或更高版本)。
2.  克隆仓库。
3.  `cd mcp-json-tools`
4.  `npm install` (安装 `@modelcontextprotocol/sdk`, `jsonpath`, `lodash`, `zod`)。

## 配置

配置你的客户端 (Cursor, VS Code) 来运行此服务器。将 `/path/to/.../index.js` 替换为你系统中 `mcp-json-tools` 目录下 `index.js` 的**绝对路径**。

**Cursor (`.cursor/mcp.json`):**

```json
{
  "mcpServers": {
    "jsonTools": {
      "description": "查询、检查和修改本地 JSON 文件的工具集。",
      "command": "node",
      "args": [ "{此处替换为绝对路径}/mcp-json-tools/index.js" ]
    }
  }
}
```

**VS Code (`.vscode/mcp.json` 或用户设置):**

```json
{
  "jsonTools": {
    "description": "查询、检查和修改本地 JSON 文件的工具集。",
    "command": "node",
    "args": [ "{此处替换为绝对路径}/mcp-json-tools/index.js" ]
  }
}
```

## 许可证

MIT 许可证。详情请参阅 LICENSE 文件。