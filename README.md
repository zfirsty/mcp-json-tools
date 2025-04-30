# MCP JSON Tools

Interact with local JSON files using JSONPath & Lodash & JavaScript evaluation.
Leverages [`jsonpath`](https://www.npmjs.com/package/jsonpath) for querying and [`lodash`](https://lodash.com/docs/) for data manipulation within the `mcp_json_eval` tool.

## Key Features

*   **Query**: Select data using standard JSONPath expressions.
*   **Inspect**: Retrieve both values and their precise paths within the JSON structure.
*   **Analyze & Modify (⚠️)**: Execute JavaScript code with `lodash` and `jsonpath` access for complex data manipulation, analysis, or **in-place file modification**.
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
    *   *Tool Call*:
        ```tool_code
        print(default_api.mcp_jsonTools_mcp_json_query(file_path="test-data/store.json", json_path="$.store.book[*].author"))
        ```
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
    *   *Tool Call*:
        ```tool_code
        print(default_api.mcp_jsonTools_mcp_json_nodes(file_path="test-data/store.json", json_path="$.store.book[*].author"))
        ```
    *   *Expected Output (simplified)*: `[ { path: ['$', 'store', 'book', 0, 'author'], value: 'Nigel Rees' }, ... ]`

### 3. `mcp_json_eval`

*   **Action**: Executes JavaScript code with access to JSON data (`$1`), `lodash` (`_`), and `jsonpath` (`jp`). **Can modify the source file.**
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
    *   *Tool Invocation*: Use `mcp_json_eval` with `file_path="test-data/store.json"` and the `js_code` above.
    *   *Expected Output*: `"Successfully updated test-data/store.json"`
*   **Example: Calculate average price (Analysis - Safe)**
    *   *Goal*: Find the average price of cheap fiction books.
    *   *JavaScript Logic*:
        ```javascript
        // Filter books using jsonpath and calculate mean price with lodash
        const books = jp.query($1, "$.store.book[?(@.category=='fiction' && @.price < 15)]");
        _.meanBy(books, 'price'); // Return the average price
        ```
    *   *Tool Invocation*: Use `mcp_json_eval` with `file_path="test-data/store.json"` and the `js_code` above.
    *   *Expected Output*: `10.99`

## Installation

1.  Requires [Node.js](https://nodejs.org/).
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