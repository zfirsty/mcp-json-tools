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

*   **功能**: 执行 JavaScript 代码，可访问 JSON 数据 (`$1`)、**Lodash** (`_`) 和 `jsonpath` (`jp`)。**主要目的**：返回代码最终表达式的结果（用于分析/计算），或者如果结果是特定的更新指令，则触发文件写入。**可以修改源文件。**
*   **参数**:
    *   `file_path` (字符串): JSON 文件的路径。
    *   `js_code` (字符串): 要执行的 JavaScript 代码。
*   **文件修改**: 若要触发文件写入，`js_code` 中求值的*最后表达式* **必须** 是 `({ type: 'updateFile', data: <要写入的新JSON对象> })`。
*   **返回**:
    *   如果最后表达式 **不是** 更新指令：`js_code` 执行的直接结果（如果结果是对象/数组则进行字符串化，否则为原始值）。
    *   如果最后表达式 **是** 更新指令：文件成功写入后的成功消息（例如 `"Successfully updated ..."`）。
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

*   **功能**: 与 `mcp_json_eval` 类似，但操作于从多个文件加载的 JSON 对象数组 (`$1`)。**主要目的**：返回代码最终表达式的结果，或者根据特定的更新指令触发文件写入。
*   **参数**:
    *   `file_paths` (字符串数组): JSON 文件的路径数组。
    *   `js_code` (字符串): 要执行的 JavaScript 代码。
*   **文件修改**: 若要触发文件写入，`js_code` 中求值的*最后表达式* **必须** 是 `({ type: 'updateMultipleFiles', updates: [{ index: 0, data: <newData> }, ...] })`。只有对应于输入 `file_paths` 中有效索引的文件才能被更新。
*   **返回**:
    *   如果最后表达式 **不是** 多文件更新指令：`js_code` 执行的直接结果（如果结果是对象/数组则进行字符串化，否则为原始值）。
    *   如果最后表达式 **是** 多文件更新指令：列出已更新文件的成功消息（例如 `"Successfully updated files: ..."`）。
*   **⚠️ 安全警告 ⚠️**: 与 `mcp_json_eval` 具有相同的安全注意事项。

## 配置

配置你的客户端 (Cursor, VS Code) 通过 `npx` 来运行此服务器。这可以避免为*服务器命令本身*处理绝对路径。

**使用 NPX (推荐):**

*   **关于文件路径的重要提示**: 当使用 NPX 方法时，传递给工具的 `file_path` 或 `file_paths` 参数 **必须** 是**绝对路径**或**相对于你的工作区根目录的路径**，而不是相对于 `mcp-json-tools` 目录本身的路径。这是因为 `npx` 可能在不同的工作目录下运行命令。

*   **Cursor (`.cursor/mcp.json`):**
    ```json
    {
      "mcpServers": {
        "jsonTools": {
          "description": "查询、检查和修改本地 JSON 文件的工具集。",
          "command": "npx",
          "args": [ "mcp-json-tools" ] 
        }
      }
    }
    ```
*   **VS Code (`.vscode/mcp.json` 或用户设置):**
    ```json
    {
      "jsonTools": {
        "description": "查询、检查和修改本地 JSON 文件的工具集。",
        "command": "npx",
        "args": [ "mcp-json-tools" ] 
      }
    }
    ```

**备选方案：直接使用 Node:**

此方法要求你在 `mcp.json` 配置的 `args` 数组中指定 `mcp-json-tools/index.js` 文件的**绝对路径** (例如：`"command": "node", "args": [ "/绝对/路径/到/mcp-json-tools/index.js" ]`)。它的可移植性不如 NPX 方法。

要使用此方法，你首先需要在本地获取代码：
1.  需要 [Node.js](https://nodejs.org/) (推荐 v18 或更高版本)。
2.  克隆仓库: `git clone https://github.com/zfirsty/mcp-json-tools.git`
3.  进入目录: `cd mcp-json-tools`
4.  安装依赖: `npm install` (安装 `@modelcontextprotocol/sdk`, `jsonpath`, `lodash`, `zod`)。
然后，配置你的客户端使用克隆下来的 `index.js` 文件的绝对路径。

## 许可证

MIT 许可证。详情请参阅 LICENSE 文件。