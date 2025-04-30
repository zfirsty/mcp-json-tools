// Main entry point for the MCP JSON Tools server

import fs from 'fs/promises';
import path from 'path';
import jp from 'jsonpath';
import _ from 'lodash';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Ensure lodash and jsonpath are loaded at the top level

// --- Utility Functions ---

async function readJsonFile(filePath) {
  try {
    const absolutePath = path.resolve(filePath);
    // TODO: Add security check to ensure path is within allowed project directory?
    const data = await fs.readFile(absolutePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    } else if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in file: ${filePath}`);
    } else {
      throw new Error(`Error reading file ${filePath}: ${error.message}`);
    }
  }
}

async function writeJsonFile(filePath, data) {
  try {
    const absolutePath = path.resolve(filePath);
    // TODO: Add security check?
    const jsonString = JSON.stringify(data, null, 2); // Pretty print with 2 spaces
    await fs.writeFile(absolutePath, jsonString, 'utf8');
  } catch (error) {
    throw new Error(`Error writing file ${filePath}: ${error.message}`);
  }
}

// --- Core Tool Logic (Implementations) ---

async function queryImplementation({ file_path, json_path, count }) {
  const jsonObj = await readJsonFile(file_path);
  const results = jp.query(jsonObj, json_path, count);
  return results;
}

async function nodesImplementation({ file_path, json_path, count }) {
  const jsonObj = await readJsonFile(file_path);
  const results = jp.nodes(jsonObj, json_path, count);
  return results;
}

async function evalImplementation({ file_path, js_code }) {
  let jsonObj = null;
  try {
    jsonObj = await readJsonFile(file_path);
  } catch (readError) {
    throw readError;
  }

  try {
    // Make JSON object available in the eval scope
    const $1 = jsonObj;

    // Shadow potentially dangerous built-ins and imports within eval's scope
    const fs = undefined;
    const path = undefined;
    const McpServer = undefined;
    const StdioServerTransport = undefined;
    // z (zod) is not relevant/accessible within eval's primary use case
    // _ (lodash) and jp (jsonpath) are intentionally provided

    // !!! DANGER ZONE: Executing eval() !!!
    const result = eval(js_code);

    if (result && typeof result === 'object' && result.type === 'updateFile' && typeof result.data === 'object' && result.data !== null) {
      await writeJsonFile(file_path, result.data);
      // Return success indicator object for the handler
      return { success: true, file_path: file_path };
    } else if (result && typeof result === 'object') {
      // Stringify other objects/arrays for the handler
      return JSON.stringify(result, null, 2);
    } else {
      // Return primitives directly for the handler
      return result;
    }
  } catch (evalError) {
    throw new Error(`Error executing provided JavaScript code: ${evalError.message}`);
  }
}

// --- MCP Server Setup ---

// Create the MCP server instance
const server = new McpServer({
  name: "mcp-json-tools",
  version: "1.0.0",
});

// Register tools using the SDK
server.tool(
  "mcp_json_query",
  "Execute a JSONPath query on a local JSON file and return values.",
  {
    file_path: z.string().describe("The path to the JSON file."),
    json_path: z.string().describe("The JSONPath query string."),
    count: z.number().optional().describe("Maximum number of results (optional).")
  },
  async (params) => {
    try {
      const resultData = await queryImplementation(params);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(resultData, null, 2)
        }]
      };
    } catch (error) {
      throw error; // Let the SDK handle wrapping the error
    }
  }
);

server.tool(
  "mcp_json_nodes",
  "Execute a JSONPath query and return matching nodes with paths.",
  {
    file_path: z.string().describe("The path to the JSON file."),
    json_path: z.string().describe("The JSONPath query string."),
    count: z.number().optional().describe("Maximum number of results (optional).")
  },
  async (params) => {
    try {
      const resultData = await nodesImplementation(params);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(resultData, null, 2)
        }]
      };
    } catch (error) {
      throw error; // Let the SDK handle wrapping the error
    }
  }
);

server.tool(
  "mcp_json_eval",
  "Execute JavaScript code with the JSON file content ($1), lodash (_), and jsonpath (jp). Can modify the file if code returns {type: 'updateFile', data: {...}}.",
  {
    file_path: z.string().describe("The path to the JSON file."),
    js_code: z.string().describe("The JavaScript code to execute.")
  },
  async (params) => {
    try {
      const resultData = await evalImplementation(params);
      // Determine the format of the response based on eval result
      let responseText = "";
      if (typeof resultData === 'string') {
          responseText = resultData;
      } else if (resultData && typeof resultData === 'object' && resultData.success === true) {
          responseText = `Successfully updated ${resultData.file_path}`;
      } else {
          // Attempt to stringify other results (objects, primitives)
          try {
              responseText = JSON.stringify(resultData, null, 2);
          } catch (stringifyError) {
              // Fallback to simple string conversion
              responseText = String(resultData ?? "Evaluation produced no stringifiable output.");
          }
      }
      return { content: [{ type: "text", text: responseText }] };

    } catch (error) {
      // Ensure the error message is propagated clearly
      // Let the SDK handle wrapping the error, but ensure the message is informative
      throw new Error(`Eval Error: ${error.message}`);
    }
  }
);

// --- Connect Transport and Start Server ---

async function startServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Server is running and listening on stdin
  } catch (error) {
    // Use console.error directly here for critical startup failures
    // as the MCP connection might not be established for logging.
    console.error("Failed to start MCP server:", error);
    process.exit(1); // Exit if server fails to start
  }
}

startServer();