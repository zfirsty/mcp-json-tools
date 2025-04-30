# MCP JSON Tools

[简体中文](README-CN.md)

Interact with local JSON files using powerful data manipulation via **Lodash** and querying with JSONPath.
Leverages [`lodash`](https://lodash.com/docs/) for manipulation and [`jsonpath`](https://www.npmjs.com/package/jsonpath) for querying within the `mcp_json_eval` tool.

## Key Features

*   **Query**: Select data using standard JSONPath expressions (`mcp_json_query`).
*   **Inspect**: Retrieve both values and their precise paths within the JSON structure (`mcp_json_nodes`).
*   **Analyze & Modify JSON**: Execute JavaScript within a sandboxed VM (with Lodash `_` and JSONPath `jp`) for complex analysis or modification of standard JSON files (`mcp_json_eval`, `mcp_json_multi_eval`).
*   **Support NDJSON**: Read, analyze, and modify (with access to Lodash `_` and JSONPath `jp`) newline-delimited ndjson/jsonl files using the `mcp_ndjson_eval` tool. Suitable for processing file formats like [`server-memory MCP`](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) data.
*   **Safe Execution**: Uses Node.js `vm` module for safer code execution in `eval` tools, with configurable timeouts.
*   **Simple Setup**: Runs as a standard Node.js process via `npx`.

## Tools Provided

### 1. `mcp_json_query`

*   **Action**: Executes a JSONPath query, returning matching values.
*   **Parameters**:
    *   `file_path` (string): Path to the JSON file.
    *   `json_path` (string): JSONPath query.
    *   `count` (number, *optional*): Max results.
*   **Returns**: Array of matching values.
*   **Example: Get all book authors**
    *   *Goal*: Retrieve the names of all authors.
    *   *Tool Invocation*: Call `mcp_json_query` with `file_path="test-data/store.json"` and `json_path="$.store.book[*].author"`.
    *   *Expected Output*: `["Nigel Rees", "Evelyn Waugh", "Herman Melville", "J. R. R. Tolkien"]`

### 2. `mcp_json_nodes`

*   **Action**: Executes a JSONPath query, returning matching nodes (value + path).
*   **Parameters**:
    *   `file_path` (string): Path to the JSON file.
    *   `json_path` (string): JSONPath query.
    *   `count` (number, *optional*): Max results.
*   **Returns**: Array of objects `{ path: Array<string|number>, value: any }`.
*   **Example: Get authors with paths**
    *   *Goal*: Retrieve authors and their locations.
    *   *Tool Invocation*: Call `mcp_json_nodes` with `file_path="test-data/store.json"` and `json_path="$.store.book[*].author"`.
    *   *Expected Output (simplified)*: `[ { path: ['$', 'store', 'book', 0, 'author'], value: 'Nigel Rees' }, ... ]`

### 3. `mcp_json_eval`

*   **Action**: Executes JavaScript code within a sandboxed VM with JSON content (`$1`), lodash (`_`), and jsonpath (`jp`). Returns the result OR modifies the file if the code's last expression is `{ type: 'updateFile', data: <new_json_object> }`. Has a 30s timeout.
*   **Parameters**:
    *   `file_path` (string): Path to the JSON file.
    *   `js_code` (string): JavaScript code to execute.
*   **File Modification**: To trigger a file write, the *last expression* evaluated in `js_code` **must** be `({ type: 'updateFile', data: <new_json_object> })`.
*   **Returns**: 
    *   If the last expression IS NOT the update instruction: The direct result of the `js_code` execution (stringified if object/array, otherwise the primitive value).
    *   If the last expression IS the update instruction: A success message upon successful file write (e.g., `"Successfully updated ..."`).
*   **⚠️ SECURITY WARNING ⚠️**: Executes user-provided code within a sandboxed VM. While safer than raw `eval()`, review code for potential resource exhaustion or unintended logic. Use with trusted code.
*   **Example: Add 'onSale' property (Modifying)**
    *   *Goal*: Add `onSale: false` to every book.
    *   *JavaScript Logic*:
        ```javascript
        // Add onSale: false to each book and prepare for update
        _.forEach($1.store.book, (book) => {
          book.onSale = false;
        });
        ({ type: 'updateFile', data: $1 }); // Return update object
        ```
    *   *Tool Invocation*: Call `mcp_json_eval` with `file_path="test-data/store.json"` and the JavaScript logic above in the `js_code` parameter.
    *   *Expected Output*: `"Successfully updated test-data/store.json"`
*   **Example: Calculate average price (Analysis - Safe)**
    *   *Goal*: Find the average price of cheap fiction books.
    *   *JavaScript Logic*:
        ```javascript
        // Filter books using jsonpath and calculate mean price with lodash
        const books = jp.query($1, "$.store.book[?(@.category=='fiction' && @.price < 15)]");
        _.meanBy(books, 'price'); // Return the average price
        ```
    *   *Tool Invocation*: Call `mcp_json_eval` with `file_path="test-data/store.json"` and the JavaScript logic above in the `js_code` parameter.
    *   *Expected Output*: `10.99`

### 4. `mcp_json_multi_eval`

*   **Action**: Executes JS code within a sandboxed VM with multiple JSON files ($1 is array), lodash (`_`), and jsonpath (`jp`). Returns the result OR modifies files if the code's last expression is `{ type: 'updateMultipleFiles', updates: [...] }`. Has a 30s timeout.
*   **Parameters**:
    *   `file_paths` (array of strings): Paths to the JSON files.
    *   `js_code` (string): JavaScript code to execute.
*   **File Modification**: To trigger file writes, the *last expression* evaluated in `js_code` **must** be `({ type: 'updateMultipleFiles', updates: [{ index: <file_index>, data: <newData> }, ...] })`. Only files corresponding to valid indices in the input `file_paths` can be updated.
*   **Returns**: 
    *   If the last expression IS NOT the multi-update instruction: The direct result of the `js_code` execution (stringified if object/array, otherwise the primitive value).
    *   If the last expression IS the multi-update instruction: A success message listing updated files (e.g., `"Successfully updated files: ..."`).
*   **⚠️ SECURITY WARNING ⚠️**: Executes user-provided code within a sandboxed VM. Same security considerations as `mcp_json_eval` apply.

### 5. `mcp_ndjson_eval`

*   **Action**: Reads an ndjson (Newline Delimited JSON) file line by line, processes the resulting array ($1) using JS code within a sandboxed VM (with Lodash _, jsonpath jp). Returns the result, OR writes back as ndjson if the code returns `{type: 'updateFile', data: <newArray>}`. Has a 30s timeout.
*   **Parameters**:
    *   `file_path` (string): The **absolute path** to the ndjson file.
    *   `js_code` (string): The JavaScript code to execute. Receives the array of parsed objects as `$1`, Lodash as `_`, and jsonpath as `jp`.
*   **File Modification**: To trigger a file write, the *last expression* evaluated in `js_code` **must** be `({ type: 'updateFile', data: <newArray> })`. The `<newArray>` MUST contain valid JSON objects.
*   **Returns**: 
    *   If the last expression IS NOT the update instruction: The direct result of the `js_code` execution (stringified if object/array, otherwise the primitive value).
    *   If the last expression IS the update instruction: A success message upon successful file write (e.g., `"Successfully updated ... lines written ..."`).
*   **⚠️ SECURITY WARNING ⚠️**: Executes user-provided code within a sandboxed VM. Use with extreme caution and only with trusted code.
*   **Example: mcp_json_query Equivalent (Get event types for a user)**
    *   *Goal*: Get event types for all events generated by user "alice" from `test-data/events.ndjson`.
    *   *JavaScript Logic*:
        ```javascript
        // Use jsonpath to query the array ($1) directly
        jp.query($1, "$[*][?(@.user=='alice')].event");
        ```
    *   *Tool Invocation*: Call `mcp_ndjson_eval` with `file_path="{abspath}/mcp-json-tools/test-data/events.ndjson"` and the JS logic.
    *   *Expected Output*: `["login", "login", "view_item"]` (as a string)
*   **Example: mcp_json_nodes Equivalent (Get full event object for a user)**
    *   *Goal*: Get the full event object (including path) for user "bob".
    *   *JavaScript Logic*:
        ```javascript
        // Use jsonpath nodes function to get objects with paths
        jp.nodes($1, "$[*][?(@.user=='bob')]"); 
        ```
    *   *Tool Invocation*: Call `mcp_ndjson_eval` with `file_path="{abspath}/mcp-json-tools/test-data/events.ndjson"` and the JS logic.
    *   *Expected Output*: Stringified JSON array containing the node object `{path: ..., value: ...}` for bob's event.
*   **Example: Modify (Filter out failed events and Write Back)**
    *   *Goal*: Remove events where `success` is `false` from `test-data/events.ndjson` and update the file.
    *   *JavaScript Logic*:
        ```javascript
        // Filter out events where success is not true (or success field missing)
        // and return the update object
        const filteredData = _.filter($1, item => item.success === true);
        ({ type: 'updateFile', data: filteredData }); 
        ```
    *   *Tool Invocation*: Call `mcp_ndjson_eval` with `file_path="{abspath}/mcp-json-tools/test-data/events.ndjson"` and the JS logic.
    *   *Expected Output*: `"Successfully updated {abspath}/mcp-json-tools/test-data/events.ndjson. Processed 5 lines, wrote 4 lines."` (Assuming initial 5 lines)

## Configuration

Configure your client (Cursor, VS Code) to run the server using `npx`. This avoids needing absolute paths for the *server command itself*.

**Using NPX (Recommended):**

*   **Important Note on File Paths**: Based on testing, when using the NPX method, the `file_path` or `file_paths` provided to the tools **MUST be absolute paths**. Relative paths (even those relative to the workspace root) may not resolve correctly due to how `npx` executes commands.

*   **Cursor (`.cursor/mcp.json`):**
    ```json
    {
      "mcpServers": {
        "jsonTools": {
          "description": "Tools to query, inspect, and modify local JSON files.",
          "command": "npx",
          "args": [ "mcp-json-tools" ] 
        }
      }
    }
    ```
*   **VS Code (`.vscode/mcp.json` or User Settings):**
    ```json
    {
      "jsonTools": {
        "description": "Tools to query, inspect, and modify local JSON files.",
        "command": "npx",
        "args": [ "mcp-json-tools" ] 
      }
    }
    ```

**Alternative: Using Node directly:**

This method requires you to specify the **absolute path** to the `mcp-json-tools/index.js` file within the `args` array in your `mcp.json` configuration (e.g., `"command": "node", "args": [ "/abs/path/to/mcp-json-tools/index.js" ]`). It's less portable than the NPX method.

To use this method, you first need the code locally:
1.  Requires [Node.js](https://nodejs.org/) (version 18 or higher recommended).
2.  Clone the repository: `git clone https://github.com/zfirsty/mcp-json-tools.git`
3.  Navigate into the directory: `cd mcp-json-tools`
4.  Install dependencies: `npm install` (Installs `@modelcontextprotocol/sdk`, `jsonpath`, `lodash`, `zod`).
Then, configure your client to use the absolute path to the cloned `index.js` file.

## License

MIT License. See LICENSE file for details.