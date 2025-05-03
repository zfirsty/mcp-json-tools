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

// Reads either standard JSON or NDJSON format
async function readFileAutoFormat(filePath) {
  const absolutePath = path.resolve(filePath);
  let fileContent;
  try {
    fileContent = await fs.readFile(absolutePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    } else {
      throw new Error(`Error reading file ${filePath}: ${error.message}`);
    }
  }

  // 1. Try parsing as standard JSON
  try {
    const jsonData = JSON.parse(fileContent);
    return { data: jsonData, format: 'json' };
  } catch (jsonError) {
    // 2. If JSON parsing fails, try parsing as NDJSON
    if (jsonError instanceof SyntaxError) {
      const objects = [];
      const lines = fileContent.split('\n');
      let lineNumber = 0;
      for (const line of lines) {
        lineNumber++;
        if (line.trim() === '') continue; // Skip empty lines
        try {
          const jsonObj = JSON.parse(line);
          objects.push(jsonObj);
        } catch (ndjsonParseError) {
          // If a line in NDJSON is invalid, we might still want to process the valid lines,
          // but for now, let's treat it as a failure for the whole file to ensure consistency.
          // Alternatively, we could return partially parsed data or log warnings.
          // For simplicity, re-throwing seems safer for tool usage.
           throw new Error(`Invalid NDJSON content in file: ${filePath} on line ${lineNumber}. Error: ${ndjsonParseError.message}. Original JSON parse error: ${jsonError.message}`);
        }
      }
      // Successfully parsed as NDJSON if no line errors occurred
      if (objects.length > 0 || fileContent.trim() === '') { // Handle empty file case
           return { data: objects, format: 'ndjson' };
      } else {
          // This case might happen if the file only contains whitespace lines after splitting
          throw new Error(`Failed to parse file ${filePath} as JSON or NDJSON. Content might be empty or only whitespace after line splitting.`);
      }

    } else {
      // If the error wasn't a SyntaxError during JSON.parse, rethrow it.
      throw new Error(`Error parsing JSON file ${filePath}: ${jsonError.message}`);
    }
  }
}

// Unified write function handling both JSON and NDJSON
async function writeFileAutoFormat(filePath, data, format) {
  const absolutePath = path.resolve(filePath);
  try {
    let fileContent;
    if (format === 'ndjson') {
      if (!Array.isArray(data)) {
        // Convert single object to array for ndjson consistency if needed, or throw error
         console.warn(`Attempting to write non-array data as ndjson to ${filePath}. Converting to single-element array.`);
         data = [data]; // Or throw new Error('Invalid data: NDJSON format requires an array.');
      }
      // Ensure every item in the array is a valid object before stringifying
      fileContent = data.map(obj => {
          if (typeof obj !== 'object' || obj === null) {
              throw new Error(`Invalid data for NDJSON: Array contains non-object element in ${filePath}`);
          }
          return JSON.stringify(obj);
      }).join('\n');
    } else { // Default to standard JSON
      fileContent = JSON.stringify(data, null, 2); // Pretty print JSON
    }
    await fs.writeFile(absolutePath, fileContent, 'utf8');
  } catch (error) {
    throw new Error(`Error writing ${format} file ${filePath}: ${error.message}`);
  }
}

// --- Core Tool Logic (Implementations) ---

async function queryImplementation({ file_path, json_path, count }) {
  const { data: fileData } = await readFileAutoFormat(file_path); // Use new reader, ignore format for query/nodes
  const results = jp.query(fileData, json_path, count);
  return results;
}

async function nodesImplementation({ file_path, json_path, count }) {
  const { data: fileData } = await readFileAutoFormat(file_path); // Use new reader, ignore format for query/nodes
  const results = jp.nodes(fileData, json_path, count);
  return results;
}

async function evalImplementation({ file_path, js_code }) {
  let fileInfo;
  try {
    fileInfo = await readFileAutoFormat(file_path); // Get data and format
  } catch (readError) {
    throw readError;
  }

  try {
    // Create the context for the VM
    const context = {
      $1: fileInfo.data, // Use the parsed data
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
 

    if (result && typeof result === 'object' && result.type === 'updateFile' && typeof result.data !== 'undefined') {
      // Use the unified writer and the original file format
      await writeFileAutoFormat(file_path, result.data, fileInfo.format);
      // Return success indicator object for the handler
      return { success: true, file_path: file_path, format: fileInfo.format }; // Indicate format in success
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
  let fileInfos = [];
  try {
    // Read all files concurrently and get their data + format
    fileInfos = await Promise.all(file_paths.map(async (fp) => {
        const info = await readFileAutoFormat(fp);
        return { ...info, path: fp }; // Add path for reference
    }));
  } catch (readError) {
    // If any file fails to read, throw the error
    throw new Error(`Error reading input files: ${readError.message}`);
  }

  try {
    // Prepare data array for the VM context ($1)
    const dataArray = fileInfos.map(info => info.data);

    // Create the context for the VM
    const context = {
      $1: dataArray, // Pass array of data objects
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
        if (typeof update.index !== 'number' || update.index < 0 || update.index >= fileInfos.length) {
           throw new Error(`Security violation: Invalid file index ${update.index} provided for update.`);
        }
        const targetFileInfo = fileInfos[update.index]; // Get original file info by index

        if (typeof update.data !== 'undefined') { // Check data exists
          updatedFilesList.push(targetFileInfo.path);
          // Use unified writer with the original format for that specific file
          return writeFileAutoFormat(targetFileInfo.path, update.data, targetFileInfo.format);
        } else {
          // Ignore invalid update instructions (e.g., missing data)
          console.warn(`Invalid update instruction for file index ${update.index} (${targetFileInfo.path}), skipping.`);
          return Promise.resolve(); // Resolve promise for invalid instructions
        }
      });

      await Promise.all(writePromises); // Wait for all valid writes to complete

      // Return success indicator object for the handler, maybe list formats?
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
  version: "1.0.6",
});

// Register tools using the SDK
server.tool(
  "mcp_json_query",
  "Executes a JSONPath query on a local JSON or NDJSON file and returns an array of matching values. Reads both formats automatically; NDJSON is treated as an array of objects for querying. **Syntax Note**: Use `$.path...` for JSON objects and `$[selector]` (e.g., `$[*]` or `$[?(...)]`) for NDJSON arrays.",
  {
    file_path: z.string().describe("The absolute path to the JSON or NDJSON file. Required due to potential working directory issues when running via npx."),
    json_path: z.string().describe("The JSONPath query string. **Note**: Use `$.path...` for JSON objects and `$[selector]` (e.g., `$[*]` or `$[?(...)]`) for NDJSON arrays."),
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
  "Executes a JSONPath query on a local JSON or NDJSON file and returns matching nodes (value + path). Reads both formats automatically; NDJSON is treated as an array of objects for querying. **Syntax Note**: Use `$.path...` for JSON objects and `$[selector]` (e.g., `$[*]` or `$[?(...)]`) for NDJSON arrays.",
  {
    file_path: z.string().describe("The absolute path to the JSON or NDJSON file. Required due to potential working directory issues when running via npx."),
    json_path: z.string().describe("The JSONPath query string. **Note**: Use `$.path...` for JSON objects and `$[selector]` (e.g., `$[*]` or `$[?(...)]`) for NDJSON arrays."),
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
  "Reads a JSON or NDJSON file, executes JavaScript code within a sandboxed VM with file content ($1, object for JSON, array for NDJSON), lodash (_), and jsonpath (jp). Returns the result OR modifies the file (preserving original format: JSON or NDJSON) if the code's last expression is { type: 'updateFile', data: <new_data> }. **Do not use explicit `return` for the final result/update object; the last evaluated expression is used.** Has a 30s timeout. **WARNING: Executes user-provided code.**",
  {
    file_path: z.string().describe("The absolute path to the JSON or NDJSON file. Required due to potential working directory issues when running via npx."),
    js_code: z.string().describe("The JavaScript code to execute. The result is the last evaluated expression. To modify the file, the last evaluated expression must be `{ type: 'updateFile', data: <new_data> }`. **Avoid using an explicit `return` statement for this.**")
  },
  async (params) => {
    try {
      const resultData = await evalImplementation(params);
      // Determine the format of the response based on eval result
      let responseText = "";
      if (typeof resultData === 'string') {
          responseText = resultData;
      } else if (resultData && typeof resultData === 'object' && resultData.success === true) {
          responseText = `Successfully updated ${resultData.format} file: ${resultData.file_path}`; // Mention format
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
  "Reads multiple JSON or NDJSON files, executes JS code within a sandboxed VM with file contents ($1 is array of parsed contents), lodash (_), and jsonpath (jp). Returns the result OR modifies files (preserving original formats) if the code's last expression is { type: 'updateMultipleFiles', updates: [...] }. **Do not use explicit `return` for the final result/update object; the last evaluated expression is used.** Has a 30s timeout. **WARNING: Executes user-provided code.**",
  {
    file_paths: z.array(z.string()).describe("Array of absolute paths to the JSON or NDJSON files. Required due to potential working directory issues when running via npx."),
    js_code: z.string().describe("The JavaScript code to execute. The result is the last evaluated expression. To modify files, the last evaluated expression must be `{ type: 'updateMultipleFiles', updates: [{ index: <file_index>, data: <newData> }, ...] }`. **Avoid using an explicit `return` statement for this.**")
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