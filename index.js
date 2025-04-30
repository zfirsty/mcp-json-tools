#!/usr/bin/env node
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
    const process = undefined; // Critical: Prevent access to process object
    const setTimeout = undefined;
    const setInterval = undefined;
    const setImmediate = undefined;
    const queueMicrotask = undefined;
    const fetch = undefined; // Prevent network access (Node 18+)
    const Buffer = undefined;
    const WebAssembly = undefined;
    const require = undefined; // Though likely unavailable in ESM, shadow for safety
    const global = undefined; // Shadow global namespaces
    const globalThis = undefined;
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

async function multiEvalImplementation({ file_paths, js_code }) {
  let jsonObjects = [];
  try {
    // Read all files concurrently
    jsonObjects = await Promise.all(file_paths.map(fp => readJsonFile(fp)));
  } catch (readError) {
    // If any file fails to read, throw the error
    throw new Error(`Error reading input files: ${readError.message}`);
  }

  try {
    // Make JSON objects array available in the eval scope
    const $1 = jsonObjects;

    // Shadow potentially dangerous built-ins and imports within eval's scope
    const fs = undefined;
    const path = undefined;
    const McpServer = undefined;
    const StdioServerTransport = undefined;
    const process = undefined; // Critical: Prevent access to process object
    const setTimeout = undefined;
    const setInterval = undefined;
    const setImmediate = undefined;
    const queueMicrotask = undefined;
    const fetch = undefined; // Prevent network access (Node 18+)
    const Buffer = undefined;
    const WebAssembly = undefined;
    const require = undefined; // Though likely unavailable in ESM, shadow for safety
    const global = undefined; // Shadow global namespaces
    const globalThis = undefined;
    // z (zod) is not relevant/accessible within eval's primary use case
    // _ (lodash) and jp (jsonpath) are intentionally provided

    // !!! DANGER ZONE: Executing eval() !!!
    const result = eval(js_code);

    // Check for multi-file update request
    if (result && typeof result === 'object' && result.type === 'updateMultipleFiles' && Array.isArray(result.updates)) {
      const updatedFilesList = [];
      const writePromises = result.updates.map(update => {
        // SECURITY CHECK: Ensure the index is valid
        if (typeof update.index !== 'number' || update.index < 0 || update.index >= file_paths.length) {
           throw new Error(`Security violation: Invalid file index ${update.index} provided for update.`);
        }
        const targetFilePath = file_paths[update.index]; // Get path from index

        if (typeof update.data === 'object' && update.data !== null) {
          updatedFilesList.push(targetFilePath);
          return writeJsonFile(targetFilePath, update.data); // Use targetFilePath
        } else {
          // Ignore invalid update instructions (e.g., missing data)
          console.warn(`Invalid update instruction for file index ${update.index} (${targetFilePath}), skipping.`);
          return Promise.resolve(); // Resolve promise for invalid instructions
        }
      });

      await Promise.all(writePromises); // Wait for all valid writes to complete

      // Return success indicator object for the handler
      return { success: true, updatedFiles: updatedFilesList };
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
  version: "1.0.4",
});

// Register tools using the SDK
server.tool(
  "mcp_json_query",
  "Execute a JSONPath query on a local JSON file and return an array of matching values.",
  {
    file_path: z.string().describe("The absolute path to the JSON file. Required due to potential working directory issues when running via npx."),
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
  "Execute a JSONPath query and return matching nodes, including their values and paths in the JSON structure (as { path: Array<string|number>, value: any }).",
  {
    file_path: z.string().describe("The absolute path to the JSON file. Required due to potential working directory issues when running via npx."),
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
  "Executes JavaScript code with JSON content ($1), lodash (_), and jsonpath (jp). Returns the result OR modifies the file if the code's last expression is an update instruction ({ type: 'updateFile', data: ... }). **WARNING: Executes unsandboxed code.**",
  {
    file_path: z.string().describe("The absolute path to the JSON file. Required due to potential working directory issues when running via npx."),
    js_code: z.string().describe("The JavaScript code to execute. To modify the file, the last evaluated expression must be `{ type: 'updateFile', data: <new_json_object> }`.")
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

server.tool(
  "mcp_json_multi_eval",
  "Executes JS code with multiple JSON files ($1 is array). Returns the result OR modifies files if the code's last expression is a multi-update instruction ({ type: 'updateMultipleFiles', updates: [...] }). **WARNING: Executes unsandboxed code.**",
  {
    file_paths: z.array(z.string()).describe("Array of absolute paths to the JSON files. Required due to potential working directory issues when running via npx."),
    js_code: z.string().describe("The JavaScript code to execute. To modify files, the last evaluated expression must be `{ type: 'updateMultipleFiles', updates: [{ index: <file_index>, data: <newData> }, ...] }`.")
  },
  async (params) => {
    try {
      const resultData = await multiEvalImplementation(params);
      // Determine the format of the response based on multiEval result
      let responseText = "";
      if (typeof resultData === 'string') {
          responseText = resultData;
      } else if (resultData && typeof resultData === 'object' && resultData.success === true) {
          // Create a success message listing updated files
          if (resultData.updatedFiles && resultData.updatedFiles.length > 0) {
            responseText = `Successfully updated files: ${resultData.updatedFiles.join(', ')}`;
          } else {
            responseText = "Evaluation successful, no files were modified or specified for update.";
          }
      } else {
          // Attempt to stringify other results (objects, primitives)
          try {
              responseText = JSON.stringify(resultData, null, 2);
          } catch (stringifyError) {
              responseText = String(resultData ?? "Evaluation produced no stringifiable output.");
          }
      }
      return { content: [{ type: "text", text: responseText }] };

    } catch (error) {
      // Ensure the error message is propagated clearly
      throw new Error(`Multi-Eval Error: ${error.message}`);
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