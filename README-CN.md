# MCP JSON Tools (中文文档)

[English README](README.md)

使用强大的 **Lodash** 数据操作能力和 JSONPath 查询来与本地 JSON 及 NDJSON 文件进行交互。
在 `mcp_json_eval` 和 `mcp_json_multi_eval` 工具中利用 [`lodash`](https://lodash.com/docs/) 进行操作，利用 [`jsonpath`](https://www.npmjs.com/package/jsonpath) 进行查询。

## 主要特性

*   **统一格式处理**: 自动读取标准 JSON 和换行符分隔的 JSON (NDJSON/JSONL)。NDJSON 文件被视作对象数组。
*   **查询 (Query)**: 使用标准的 JSONPath 表达式从 JSON 或 NDJSON 文件中选择数据 (`mcp_json_query`)。
*   **检查 (Inspect)**: 检索值及其在 JSON/NDJSON 结构中的精确路径 (`mcp_json_nodes`)。
*   **分析与修改**: 在沙箱化 VM 中执行 JavaScript（可访问 Lodash `_` 和 JSONPath `jp`），对 JSON/NDJSON 文件进行复杂分析或修改 (`mcp_json_eval`, `mcp_json_multi_eval`)。修改操作会保留原始文件格式（JSON 或 NDJSON）。
*   **安全执行**: 在 `eval` 相关工具中使用 Node.js `vm` 模块执行代码，更安全，并带有可配置的超时。
*   **简易设置**: 通过 `npx` 作为标准的 Node.js 进程运行。

## 提供的工具

### 1. `mcp_json_query`

*   **功能**: 对本地 JSON 或 NDJSON 文件执行 JSONPath 查询，返回匹配的值。自动读取两种格式；NDJSON 被视作对象数组进行查询。
*   **参数**:
    *   `file_path` (字符串): JSON 或 NDJSON 文件的路径。
    *   `json_path` (字符串): JSONPath 查询表达式。**语法提示**: 
        *   对于标准 JSON (根是对象), 路径通常以 `$.` 开始 (例如: `$.store.book[*].author`)。
        *   对于 NDJSON (根是数组), 路径必须以 `$` 后直接跟 `[` 开始 (例如: `$[?(@.user=='alice')].event` 或 `$[*].user`)。在根数组上使用 `$[*][?(...)]` 的语法 **无法** 按预期工作。
    *   `count` (数字, *可选*): 返回结果的最大数量。
*   **返回**: 包含匹配值的数组。
*   **示例：获取所有书籍作者 (从 JSON)**
    *   *目标*: 从 `store.json` 检索所有作者的姓名。
    *   *工具调用*: 调用 `mcp_json_query`，设置 `file_path="test-data/store.json"` 和 `json_path="$.store.book[*].author"`。
    *   *预期输出*: `["Nigel Rees", "Evelyn Waugh", "Herman Melville", "J. R. R. Tolkien"]`
*   **示例：获取用户 'alice' 的事件类型 (从 NDJSON)**
    *   *目标*: 从 `events.ndjson` 获取用户 'alice' 的事件类型。
    *   *工具调用*: 调用 `mcp_json_query`，设置 `file_path="{绝对路径}/mcp-json-tools/test-data/events.ndjson"` 和 `json_path="$[?(@.user=='alice')].event"`。(注意针对根数组使用 `$[?(...)]` 语法)。
    *   *预期输出*: `["login", "login", "view_item"]` (字符串化的数组)

### 2. `mcp_json_nodes`

*   **功能**: 对本地 JSON 或 NDJSON 文件执行 JSONPath 查询，返回匹配的节点 (值 + 路径)。自动读取两种格式；NDJSON 被视作对象数组进行查询。
*   **参数**:
    *   `file_path` (字符串): JSON 或 NDJSON 文件的路径。
    *   `json_path` (字符串): JSONPath 查询表达式。**语法提示**: 
        *   对于标准 JSON (根是对象), 路径通常以 `$.` 开始 (例如: `$.store.book[?(@.price<10)]`)。
        *   对于 NDJSON (根是数组), 路径必须以 `$` 后直接跟 `[` 开始 (例如: `$[?(@.user=='bob')]` 或 `$[*]`)。在根数组上使用 `$[*][?(...)]` 的语法 **无法** 按预期工作。
    *   `count` (数字, *可选*): 返回节点的最大数量。
*   **返回**: 对象数组 `{ path: Array<string|number>, value: any }`。
*   **示例：获取作者及其路径 (从 JSON)**
    *   *目标*: 从 `store.json` 检索作者及其在 JSON 中的位置。
    *   *工具调用*: 调用 `mcp_json_nodes`，设置 `file_path="test-data/store.json"` 和 `json_path="$.store.book[*].author"`。
    *   *预期输出 (简化)*: `[ { path: ['$', 'store', 'book', 0, 'author'], value: 'Nigel Rees' }, ... ]`
*   **示例：获取用户 'bob' 的完整事件对象 (从 NDJSON)**
    *   *目标*: 从 `events.ndjson` 获取用户 "bob" 的完整事件对象（包含路径）。
    *   *工具调用*: 调用 `mcp_json_nodes`，设置 `file_path="{绝对路径}/mcp-json-tools/test-data/events.ndjson"` 和 `json_path="$[?(@.user=='bob')]"`。(注意针对根数组使用 `$[?(...)]` 语法)。
    *   *预期输出*: 包含 bob 事件的节点对象 `{path: ..., value: ...}` 的 JSON 数组的字符串化形式。

### 3. `mcp_json_eval`

*   **功能**: 读取一个 JSON 或 NDJSON 文件，在沙箱化的 VM 中执行 JavaScript 代码，可访问文件内容 (`$1`：JSON 为对象，NDJSON 为对象数组)、lodash (`_`) 和 jsonpath (`jp`)。返回结果，或者如果代码的最后表达式是 `{ type: 'updateFile', data: <新数据> }`，则修改文件（保留原始格式：JSON 或 NDJSON）。有 30 秒超时。
*   **参数**:
    *   `file_path` (字符串): JSON 或 NDJSON 文件的路径。
    *   `js_code` (字符串): 要执行的 JavaScript 代码。
*   **文件修改**: 若要触发文件写入，`js_code` 中求值的*最后表达式* **必须** 是 `({ type: 'updateFile', data: <新数据> })`。如果希望保留格式，`<新数据>` 应与预期结构匹配（JSON 为对象，NDJSON 为数组）。
*   **返回**:
    *   如果最后表达式 **不是** 更新指令：`js_code` 执行的直接结果（如果结果是对象/数组则进行字符串化，否则为原始值）。
    *   如果最后表达式 **是** 更新指令：文件成功写入后的成功消息（例如 `"Successfully updated json file: ..."` 或 `"Successfully updated ndjson file: ..."`）。
*   **⚠️ 安全警告 ⚠️**: 在沙箱化的 VM 中执行用户提供的代码。虽然比原始 `eval()` 更安全，但仍需审查代码以防潜在的资源耗尽或意外逻辑。请仅用于可信代码。
*   **示例：添加 'onSale' 属性 (修改 JSON)**
    *   *目标*: 为 `store.json` 中的每本书添加 `onSale: false` 属性。
    *   *JavaScript 逻辑*:
        ```javascript
        // $1 是 JSON 对象
        _.forEach($1.store.book, (book) => {
          book.onSale = false;
        });
        ({ type: 'updateFile', data: $1 }); // 返回更新对象
        ```
    *   *工具调用*: 调用 `mcp_json_eval`，设置 `file_path="test-data/store.json"` 并将上述 JavaScript 逻辑作为 `js_code` 参数传入。
    *   *预期输出*: `"Successfully updated json file: test-data/store.json"`
*   **示例：计算平均价格 (分析 JSON)**
    *   *目标*: 计算 `store.json` 中价格低于 $15 的小说的平均价格。
    *   *JavaScript 逻辑*:
        ```javascript
        // $1 是 JSON 对象
        const books = jp.query($1, "$.store.book[?(@.category=='fiction' && @.price < 15)]");
        _.meanBy(books, 'price'); // 返回平均价格
        ```
    *   *工具调用*: 调用 `mcp_json_eval`，设置 `file_path="test-data/store.json"` 并将上述 JavaScript 逻辑作为 `js_code` 参数传入。
    *   *预期输出*: `10.99`
*   **示例：过滤失败事件 (修改 NDJSON)**
    *   *目标*: 从 `test-data/events.ndjson` 移除 `success` 为 `false` 的事件并更新文件。
    *   *JavaScript 逻辑*:
        ```javascript
        // $1 是来自 NDJSON 文件的事件对象数组
        const filteredData = _.filter($1, item => item.success === true);
        // 返回带有过滤后数组的更新对象
        ({ type: 'updateFile', data: filteredData }); 
        ```
    *   *工具调用*: 调用 `mcp_json_eval`，设置 `file_path="{绝对路径}/mcp-json-tools/test-data/events.ndjson"` 和上述 JS 逻辑。
    *   *预期输出*: `"Successfully updated ndjson file: {绝对路径}/mcp-json-tools/test-data/events.ndjson"`

### 4. `mcp_json_multi_eval`

*   **功能**: 读取多个 JSON 或 NDJSON 文件，在沙箱化的 VM 中执行 JS 代码，可访问文件内容 ($1 是一个数组，其中每个元素是解析后的文件内容 - JSON 为对象，NDJSON 为数组)、lodash (`_`) 和 jsonpath (`jp`)。返回结果，或者如果代码的最后表达式是 `{ type: 'updateMultipleFiles', updates: [{ index: <文件索引>, data: <新数据> }, ...] }`，则修改文件（保留原始格式）。有 30 秒超时。
*   **参数**:
    *   `file_paths` (字符串数组): JSON 或 NDJSON 文件的路径数组。
    *   `js_code` (字符串): 要执行的 JavaScript 代码。
*   **文件修改**: 若要触发文件写入，`js_code` 中求值的*最后表达式* **必须** 是 `({ type: 'updateMultipleFiles', updates: [{ index: <文件索引>, data: <新数据> }, ...] })`。只有对应于输入 `file_paths` 中有效索引的文件才能被更新。`<新数据>` 应与该索引处文件的原始格式匹配。
*   **返回**:
    *   如果最后表达式 **不是** 多文件更新指令：`js_code` 执行的直接结果（如果结果是对象/数组则进行字符串化，否则为原始值）。
    *   如果最后表达式 **是** 多文件更新指令：列出已更新文件的成功消息（例如 `"Successfully updated files: ..."`）。
*   **⚠️ 安全警告 ⚠️**: 在沙箱化的 VM 中执行用户提供的代码。与 `mcp_json_eval` 具有相同的安全注意事项。

## 配置

配置你的客户端 (Cursor, VS Code) 通过 `npx` 来运行此服务器。这可以避免为*服务器命令本身*处理绝对路径。

**使用 NPX (推荐):**

*   **关于文件路径的重要提示**: 当使用 NPX 方法时，传递给工具的 `file_path` 或 `file_paths` 参数 **必须是绝对路径**。相对路径（即使是相对于工作区根目录的路径）可能因为 `npx` 执行命令的方式而无法正确解析。

*   **Cursor (`.cursor/mcp.json`):**
    ```json
    {
      "mcpServers": {
        "jsonTools": {
          "description": "查询、检查和修改本地 JSON 及 NDJSON 文件的工具集。",
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
        "description": "查询、检查和修改本地 JSON 及 NDJSON 文件的工具集。",
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
