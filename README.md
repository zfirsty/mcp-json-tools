# MCP JSON Tools

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

*   **Action**: Executes JavaScript code with access to JSON data (`$1`), **Lodash** (`_`), and `jsonpath` (`jp`). Leverage the full power of Lodash for sophisticated data processing. **Can modify the source file.**
*   **Parameters**:
    *   `file_path` (string): Path to the JSON file.
    *   `js_code` (string): JavaScript code to execute.
*   **File Modification**: To save changes, the *last expression* in `js_code` **must** be `({ type: 'updateFile', data: <new_json_object> })`.
*   **Returns**: Result of the JavaScript code execution (stringified if object/array, primitive otherwise), or a success message upon file update.
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

*   **Action**: Similar to `mcp_json_eval`, but operates on an array of JSON objects loaded from multiple files. Executes JavaScript code with access to the array of objects (`$1`), **Lodash** (`_`), and `jsonpath` (`jp`). **Can modify source files.**
*   **Parameters**:
    *   `file_paths` (array of strings): Paths to the JSON files.
    *   `js_code` (string): JavaScript code to execute.
*   **File Modification**: To save changes, the *last expression* in `js_code` **must** be `({ type: 'updateMultipleFiles', updates: [{ filePath: '/path/to/file1.json', data: <newData> }, ...] })`. Only files listed in `file_paths` can be updated.
*   **Returns**: Result of the JavaScript code execution, or a success message listing updated files.
*   **⚠️ SECURITY WARNING ⚠️**: Same security considerations as `mcp_json_eval` apply.

## Installation

1.  Requires [Node.js](https://nodejs.org/) (version 18 or higher recommended).
2.  Clone repository.
3.  `cd mcp-json-tools`
4.  `npm install` (Installs `@modelcontextprotocol/sdk`, `jsonpath`, `lodash`, `zod`).

## Configuration

Configure your client (Cursor, VS Code) to run the server. Replace `/path/to/.../index.js` with the **absolute path** to `index.js` within the `mcp-json-tools` directory.

**Cursor (`.cursor/mcp.json`):**

```json
{
  "mcpServers": {
    "jsonTools": {
      "description": "Tools to query, inspect, and modify local JSON files.",
      "command": "node",
      "args": [ "{ABSOLUTE PATH TO FILE HERE}/mcp-json-tools/index.js" ]
    }
  }
}
```

**VS Code (`.vscode/mcp.json` or User Settings):**

```json
{
  "jsonTools": {
    "description": "Tools to query, inspect, and modify local JSON files.",
    "command": "node",
    "args": [ "{ABSOLUTE PATH TO FILE HERE}/mcp-json-tools/index.js" ]
  }
}
```

## License

MIT License. See LICENSE file for details.