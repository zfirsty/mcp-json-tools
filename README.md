# MCP JSON Tools

[简体中文](README-CN.md)

Interact with local JSON files using powerful data manipulation via **Lodash** and querying with JSONPath.
Leverages [`lodash`](https://lodash.com/docs/) for manipulation and [`jsonpath`](https://www.npmjs.com/package/jsonpath) for querying within the `mcp_json_eval` tool.

## Key Features

*   **Query**: Select data using standard JSONPath expressions.
*   **Inspect**: Retrieve both values and their precise paths within the JSON structure.
*   **Analyze & Modify with Lodash (⚠️)**: Execute JavaScript code with full **[`lodash`](https://lodash.com/docs/)** (`_`) and `jsonpath` (`jp`) access for complex data transformation, analysis (filtering, mapping, sorting, aggregation, etc.), or **in-place file modification**.
*   **Simple Setup**: Runs as a standard Node.js process.

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

*   **Action**: Executes JavaScript code with access to JSON data (`$1`), **Lodash** (`_`), and `jsonpath` (`jp`). **Primary purpose**: Return the result of the code's final expression (for analysis/calculation) OR trigger a file write if the result is a specific update instruction. **Can modify the source file.**
*   **Parameters**:
    *   `file_path` (string): Path to the JSON file.
    *   `js_code` (string): JavaScript code to execute.
*   **File Modification**: To trigger a file write, the *last expression* evaluated in `js_code` **must** be `({ type: 'updateFile', data: <new_json_object> })`.
*   **Returns**: 
    *   If the last expression IS NOT the update instruction: The direct result of the `js_code` execution (stringified if object/array, otherwise the primitive value).
    *   If the last expression IS the update instruction: A success message upon successful file write (e.g., `"Successfully updated ..."`).
*   **⚠️ SECURITY WARNING ⚠️**: Executes unsandboxed code (`eval()`) with full Node.js permissions. **Use with extreme caution and only with trusted code.**
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

*   **Action**: Similar to `mcp_json_eval`, but operates on an array of JSON objects (`$1`) loaded from multiple files. **Primary purpose**: Return the result of the code's final expression OR trigger file writes based on a specific update instruction.
*   **Parameters**:
    *   `file_paths` (array of strings): Paths to the JSON files.
    *   `js_code` (string): JavaScript code to execute.
*   **File Modification**: To trigger file writes, the *last expression* evaluated in `js_code` **must** be `({ type: 'updateMultipleFiles', updates: [{ index: 0, data: <newData> }, ...] })`. Only files corresponding to valid indices in the input `file_paths` can be updated.
*   **Returns**: 
    *   If the last expression IS NOT the multi-update instruction: The direct result of the `js_code` execution (stringified if object/array, otherwise the primitive value).
    *   If the last expression IS the multi-update instruction: A success message listing updated files (e.g., `"Successfully updated files: ..."`).
*   **⚠️ SECURITY WARNING ⚠️**: Same security considerations as `mcp_json_eval` apply.

## Configuration

Configure your client (Cursor, VS Code) to run the server using `npx`. This avoids needing absolute paths for the *server command itself*.

**Using NPX (Recommended):**

*   **Important Note on File Paths**: When using the NPX method, the `file_path` or `file_paths` provided to the tools MUST be either **absolute paths** or paths **relative to your workspace root**, NOT relative to the `mcp-json-tools` directory itself. This is because `npx` may run the command from a different working directory.

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