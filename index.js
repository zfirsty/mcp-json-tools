#!/usr/bin/env node
// Main entry point for the MCP JSON Tools server

import fs from 'fs/promises';
import path from 'path';
import jp from 'jsonpath';
import _ from 'lodash';
import vm from 'vm'; // Import the vm module
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

// Utility function to read ndjson files
async function readNdjsonFile(filePath) {
  const objects = [];
  let lineNumber = 0;
  try {
    const absolutePath = path.resolve(filePath);
    const fileContent = await fs.readFile(absolutePath, 'utf8');
    const lines = fileContent.split('\n');

    for (const line of lines) {
      lineNumber++;
      if (line.trim() === '') continue; // Skip empty lines
      try {
        const jsonObj = JSON.parse(line);
        objects.push(jsonObj);
      } catch (parseError) {
        // Log warning for invalid JSON lines but continue processing
        console.warn(`Skipping invalid JSON on line ${lineNumber} in ${filePath}: ${parseError.message}`);
      }
    }
    return objects;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    } else {
      throw new Error(`Error reading ndjson file ${filePath}: ${error.message}`);
    }
  }
}

// Utility function to write arrays as ndjson files
async function writeNdjsonFile(filePath, dataArray) {
  if (!Array.isArray(dataArray)) {
    throw new Error('Invalid data: Input must be an array to write as ndjson.');
  }
  try {
    const absolutePath = path.resolve(filePath);
    // Convert each object to a JSON string and join with newlines
    const ndjsonString = dataArray.map(obj => JSON.stringify(obj)).join('\n');
    await fs.writeFile(absolutePath, ndjsonString, 'utf8');
  } catch (error) {
    throw new Error(`Error writing ndjson file ${filePath}: ${error.message}`);
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
    // Create the context for the VM
    const context = {
      $1: jsonObj,
      _: _,
      jp: jp, 
      // Explicitly prevent access to potentially harmful globals/modules
      console: undefined,
      process: undefined,
      require: undefined,
      fs: undefined,
      path: undefined,
      vm: undefined,
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined,
      queueMicrotask: undefined,
      fetch: undefined,
      Buffer: undefined,
      WebAssembly: undefined,
      global: undefined,
      globalThis: undefined
    };

    // Create a script object and run it in the sandboxed context
    const script = new vm.Script(js_code);
    const result = script.runInNewContext(context, {
        timeout: 30000 // Add a timeout (e.g., 30 seconds) to prevent infinite loops
    });
 

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
    // Create the context for the VM
    const context = {
      $1: jsonObjects,
      _: _,
      jp: jp, 
      // Explicitly prevent access to potentially harmful globals/modules
      console: undefined,
      process: undefined,
      require: undefined,
      fs: undefined,
      path: undefined,
      vm: undefined,
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined,
      queueMicrotask: undefined,
      fetch: undefined,
      Buffer: undefined,
      WebAssembly: undefined,
      global: undefined,
      globalThis: undefined
    };

    // Create a script object and run it in the sandboxed context
    const script = new vm.Script(js_code);
    const result = script.runInNewContext(context, {
        timeout: 30000 // Add a timeout (e.g., 30 seconds) to prevent infinite loops
    });

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

// Core logic for the ndjson eval tool
async function ndjsonEvalImplementation({ file_path, js_code }) {
  let initialObjects = [];
  try {
    initialObjects = await readNdjsonFile(file_path);
  } catch (readError) {
    throw readError; 
  }

  try {
    // Create the context for the VM
    const context = {
      $1: initialObjects,
      _: _,
      jp: jp,
      // Explicitly prevent access to potentially harmful globals/modules
      console: undefined,
      process: undefined,
      require: undefined,
      fs: undefined,
      path: undefined,
      vm: undefined,
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined,
      queueMicrotask: undefined,
      fetch: undefined,
      Buffer: undefined,
      WebAssembly: undefined,
      global: undefined,
      globalThis: undefined
    };

    // Create a script object and run it in the sandboxed context
    const script = new vm.Script(js_code);
    const result = script.runInNewContext(context, {
        timeout: 30000 // Add a timeout (e.g., 30 seconds) to prevent infinite loops
    });

    // --- Check for Update Instruction --- 
    if (result && typeof result === 'object' && result.type === 'updateFile' && Array.isArray(result.data)) {
      // Write the resulting array back to the file as ndjson
      await writeNdjsonFile(file_path, result.data);
      // Return success indicator object for the handler
      return { 
        success: true, 
        file_path: file_path, 
        lines_processed: initialObjects.length, 
        lines_written: result.data.length 
      };
    } else {
      // --- Return Direct Result (No File Write) --- 
      return result; 
    }

  } catch (error) {
    // Catch errors from vm execution (including timeout) or file operations
    throw new Error(`Error during ndjson eval execution: ${error.message}`);
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
  "Executes JavaScript code within a sandboxed VM with JSON content ($1), lodash (_), and jsonpath (jp). Returns the result OR modifies the file if the code's last expression is { type: 'updateFile', data: <new_json_object> }. Has a 30s timeout. **WARNING: Executes user-provided code.**",
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
  "Executes JS code within a sandboxed VM with multiple JSON files ($1 is array), lodash (_), and jsonpath (jp). Returns the result OR modifies files if the code's last expression is { type: 'updateMultipleFiles', updates: [...] }. Has a 30s timeout. **WARNING: Executes user-provided code.**",
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

// Register the ndjson eval tool
server.tool(
  "mcp_ndjson_eval",
  "Reads an ndjson file line by line, processes the resulting array ($1) using JS code within a sandboxed VM (with Lodash _, jsonpath jp). Returns the result, OR writes back as ndjson if the code returns {type: 'updateFile', data: <newArray>}. Has a 30s timeout. Note: Can replicate mcp_json_query/nodes via jp.query/nodes(). **WARNING: Executes user-provided code.**",
  {
    file_path: z.string().describe("The absolute path to the ndjson file. Required due to potential working directory issues when running via npx."),
    js_code: z.string().describe("The JavaScript code to execute. Receives the array ($1), Lodash (_), and jsonpath (jp). To modify the file, return {type: 'updateFile', data: <newArray>}. The returned array MUST contain valid JSON objects.")
  },
  async (params) => {
    try {
      const resultData = await ndjsonEvalImplementation(params); 
      
      let responseText = "";
      // Check if the implementation indicated a successful file write
      if (resultData && typeof resultData === 'object' && resultData.success === true) {
        responseText = `Successfully updated ${resultData.file_path}. Processed ${resultData.lines_processed} lines, wrote ${resultData.lines_written} lines.`;
      } else {
        // Otherwise, handle the direct result like mcp_json_eval
        if (typeof resultData === 'string') {
            responseText = resultData;
        } else {
            try {
                // Stringify objects/arrays, handle primitives
                responseText = JSON.stringify(resultData, null, 2);
            } catch (stringifyError) {
                responseText = String(resultData ?? "Evaluation produced no stringifiable output.");
            }
        }
      }
      return { content: [{ type: "text", text: responseText }] };

    } catch (error) {
      // Ensure the error message is propagated clearly
      throw new Error(`ndjson Eval Error: ${error.message}`); 
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