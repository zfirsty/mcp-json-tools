# MCP JSON Tools

[简体中文](README-CN.md)

Interact with local JSON and NDJSON files using powerful data manipulation via **Lodash** and querying with JSONPath.
Leverages [`lodash`](https://lodash.com/docs/) for manipulation and [`jsonpath`](https://www.npmjs.com/package/jsonpath) for querying within the `mcp_json_eval` and `mcp_json_multi_eval` tools.

## Key Features

*   **Unified Format Handling**: Automatically reads both standard JSON and newline-delimited JSON (NDJSON/JSONL). NDJSON files are treated as an array of objects.
*   **Query**: Select data using standard JSONPath expressions from JSON or NDJSON files (`mcp_json_query`).
*   **Inspect**: Retrieve both values and their precise paths within the JSON/NDJSON structure (`mcp_json_nodes`).
*   **Analyze & Modify**: Execute JavaScript within a sandboxed VM (with Lodash `_` and JSONPath `jp`) for complex analysis or modification of JSON/NDJSON files (`mcp_json_eval`, `mcp_json_multi_eval`). Modifications preserve the original file format (JSON or NDJSON).
*   **Safe Execution**: Uses Node.js `vm` module for safer code execution in `eval` tools, with configurable timeouts.
*   **Simple Setup**: Runs as a standard Node.js process via `npx`.

## Tools Provided

### 1. `mcp_json_query`

*   **Action**: Executes a JSONPath query on a local JSON or NDJSON file, returning matching values. Reads both formats automatically; NDJSON is treated as an array of objects for querying.
*   **Parameters**:
    *   `file_path` (string): Path to the JSON or NDJSON file.
    *   `json_path` (string): JSONPath query. **Note on Syntax**: 
        *   For standard JSON (root is object), paths typically start with `$.` (e.g., `$.store.book[*].author`).
        *   For NDJSON (root is array), paths must start with `$` followed by `[` (e.g., `$[?(@.user=='alice')].event` or `$[*].user`). Using `$[*][?(...)]` on the root array does **not** work as expected.
    *   `count` (number, *optional*): Max results.
*   **Returns**: Array of matching values.
*   **Example: Get all book authors (from JSON)**
    *   *Goal*: Retrieve the names of all authors from `store.json`.
    *   *Tool Invocation*: Call `mcp_json_query` with `file_path="test-data/store.json"` and `json_path="$.store.book[*].author"`.
    *   *Expected Output*: `["Nigel Rees", "Evelyn Waugh", "Herman Melville", "J. R. R. Tolkien"]`
*   **Example: Get event types for user 'alice' (from NDJSON)**
    *   *Goal*: Get event types for user 'alice' from `events.ndjson`.
    *   *Tool Invocation*: Call `mcp_json_query` with `file_path="{abspath}/mcp-json-tools/test-data/events.ndjson"` and `json_path="$[?(@.user=='alice')].event"`. (Note the `$[?(...)]` syntax for the root array).
    *   *Expected Output*: `["login", "login", "view_item"]` (as a stringified array)

### 2. `mcp_json_nodes`

*   **Action**: Executes a JSONPath query on a local JSON or NDJSON file, returning matching nodes (value + path). Reads both formats automatically; NDJSON is treated as an array of objects for querying.
*   **Parameters**:
    *   `file_path` (string): Path to the JSON or NDJSON file.
    *   `json_path` (string): JSONPath query. **Note on Syntax**: 
        *   For standard JSON (root is object), paths typically start with `$.` (e.g., `$.store.book[?(@.price<10)]`).
        *   For NDJSON (root is array), paths must start with `$` followed by `[` (e.g., `$[?(@.user=='bob')]` or `$[*]`). Using `$[*][?(...)]` on the root array does **not** work as expected.
    *   `count` (number, *optional*): Max results.
*   **Returns**: Array of objects `{ path: Array<string|number>, value: any }`.
*   **Example: Get authors with paths (from JSON)**
    *   *Goal*: Retrieve authors and their locations from `store.json`.
    *   *Tool Invocation*: Call `mcp_json_nodes` with `file_path="test-data/store.json"` and `json_path="$.store.book[*].author"`.
    *   *Expected Output (simplified)*: `[ { path: ['$', 'store', 'book', 0, 'author'], value: 'Nigel Rees' }, ... ]`
*   **Example: Get full event object for user 'bob' (from NDJSON)**
    *   *Goal*: Get the full event object (including path) for user "bob" from `events.ndjson`.
    *   *Tool Invocation*: Call `mcp_json_nodes` with `file_path="{abspath}/mcp-json-tools/test-data/events.ndjson"` and `json_path="$[?(@.user=='bob')]"`. (Note the `$[?(...)]` syntax for the root array).
    *   *Expected Output*: Stringified JSON array containing the node object `{path: ..., value: ...}` for bob's event.

### 3. `mcp_json_eval`

*   **Action**: Reads a JSON or NDJSON file, executes JavaScript code within a sandboxed VM with file content (`$1`: object for JSON, array of objects for NDJSON), lodash (`_`), and jsonpath (`jp`). Returns the result OR modifies the file (preserving original format: JSON or NDJSON) if the code's last expression is `{ type: 'updateFile', data: <new_data> }`. Has a 30s timeout.
*   **Parameters**:
    *   `file_path` (string): Path to the JSON or NDJSON file.
    *   `js_code` (string): JavaScript code to execute.
*   **File Modification**: To trigger a file write, the *last expression* evaluated in `js_code` **must** be `({ type: 'updateFile', data: <new_data> })`. The `<new_data>` should match the expected structure (object for JSON, array for NDJSON) if preserving format is desired.
*   **Returns**: 
    *   If the last expression IS NOT the update instruction: The direct result of the `js_code` execution (stringified if object/array, otherwise the primitive value).
    *   If the last expression IS the update instruction: A success message upon successful file write (e.g., `"Successfully updated json file: ..."` or `"Successfully updated ndjson file: ..."`).
*   **⚠️ SECURITY WARNING ⚠️**: Executes user-provided code within a sandboxed VM. While safer than raw `eval()`, review code for potential resource exhaustion or unintended logic. Use with trusted code.
*   **Example: Add 'onSale' property (Modifying JSON)**
    *   *Goal*: Add `onSale: false` to every book in `store.json`.
    *   *JavaScript Logic*:
        ```javascript
        // $1 is the JSON object
        _.forEach($1.store.book, (book) => {
          book.onSale = false;
        });
        ({ type: 'updateFile', data: $1 }); // Return update object
        ```
    *   *Tool Invocation*: Call `mcp_json_eval` with `file_path="test-data/store.json"` and the JavaScript logic above in the `js_code` parameter.
    *   *Expected Output*: `"Successfully updated json file: test-data/store.json"`
*   **Example: Calculate average price (Analyzing JSON)**
    *   *Goal*: Find the average price of cheap fiction books in `store.json`.
    *   *JavaScript Logic*:
        ```javascript
        // $1 is the JSON object
        const books = jp.query($1, "$.store.book[?(@.category=='fiction' && @.price < 15)]");
        _.meanBy(books, 'price'); // Return the average price
        ```
    *   *Tool Invocation*: Call `mcp_json_eval` with `file_path="test-data/store.json"` and the JavaScript logic above in the `js_code` parameter.
    *   *Expected Output*: `10.99`
*   **Example: Filter out failed events (Modifying NDJSON)**
    *   *Goal*: Remove events where `success` is `false` from `test-data/events.ndjson` and update the file.
    *   *JavaScript Logic*:
        ```javascript
        // $1 is the array of event objects from the NDJSON file
        const filteredData = _.filter($1, item => item.success === true);
        // Return the update object with the filtered array
        ({ type: 'updateFile', data: filteredData }); 
        ```
    *   *Tool Invocation*: Call `mcp_json_eval` with `file_path="{abspath}/mcp-json-tools/test-data/events.ndjson"` and the JS logic.
    *   *Expected Output*: `"Successfully updated ndjson file: {abspath}/mcp-json-tools/test-data/events.ndjson"`

### 4. `mcp_json_multi_eval`

*   **Action**: Reads multiple JSON or NDJSON files, executes JS code within a sandboxed VM with file contents ($1 is an array where each element is the parsed content of a file - object for JSON, array for NDJSON), lodash (`_`), and jsonpath (`jp`). Returns the result OR modifies files (preserving original formats) if the code's last expression is `{ type: 'updateMultipleFiles', updates: [{ index: <file_index>, data: <newData> }, ...] }`. Has a 30s timeout.
*   **Parameters**:
    *   `file_paths` (array of strings): Paths to the JSON or NDJSON files.
    *   `js_code` (string): JavaScript code to execute.
*   **File Modification**: To trigger file writes, the *last expression* evaluated in `js_code` **must** be `({ type: 'updateMultipleFiles', updates: [{ index: <file_index>, data: <newData> }, ...] })`. Only files corresponding to valid indices in the input `file_paths` can be updated. The `<newData>` should match the original format of the file at that index.
*   **Returns**: 
    *   If the last expression IS NOT the multi-update instruction: The direct result of the `js_code` execution (stringified if object/array, otherwise the primitive value).
    *   If the last expression IS the multi-update instruction: A success message listing updated files (e.g., `"Successfully updated files: ..."`).
*   **⚠️ SECURITY WARNING ⚠️**: Executes user-provided code within a sandboxed VM. Same security considerations as `mcp_json_eval` apply.

## Configuration

Configure your client (Cursor, VS Code) to run the server using `npx`. This avoids needing absolute paths for the *server command itself*.

**Using NPX (Recommended):**

*   **Important Note on File Paths**: When using the NPX method, the `file_path` or `file_paths` provided to the tools **MUST be absolute paths**. Relative paths may not resolve correctly due to how `npx` executes commands.

*   **Cursor (`.cursor/mcp.json`):**
    ```json
    {
      "mcpServers": {
        "jsonTools": {
          "description": "Tools to query, inspect, and modify local JSON and NDJSON files.",
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
        "description": "Tools to query, inspect, and modify local JSON and NDJSON files.",
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