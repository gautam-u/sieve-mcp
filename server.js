#!/usr/bin/env node
/**
 * Introspection stub for MCP registries (Glama and others).
 *
 * It answers `initialize` and `tools/list` with the same tool definitions the real server
 * advertises (tools.json), so registries can index Sieve. Every `tools/call` explains how to
 * install the real server. It reads no files and makes no network calls.
 *
 * The real server ships inside the Sieve Mac app:
 *   /Applications/Sieve.app/Contents/MacOS/Sieve --mcp
 */

const readline = require("readline");
const TOOLS = require("./tools.json");

const APP_STORE_URL = "https://apps.apple.com/app/id6767409365";
const SUPPORTED_PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

function send(message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  let req;
  try {
    req = JSON.parse(line.trim());
  } catch {
    return;
  }

  const { id, method, params } = req;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize": {
      const requested = params && params.protocolVersion;
      send({
        id,
        result: {
          protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
          capabilities: { tools: {} },
          serverInfo: { name: "sieve", version: "1.1.1" },
        },
      });
      break;
    }
    case "tools/list":
      send({ id, result: { tools: TOOLS } });
      break;
    case "tools/call":
      send({
        id,
        result: {
          isError: true,
          content: [
            {
              type: "text",
              text:
                "This is Sieve's registry stub, not the real server. Install Sieve for Mac (" +
                APP_STORE_URL +
                "), turn on Settings > MCP Server > Enable MCP Server, and point your client at " +
                "/Applications/Sieve.app/Contents/MacOS/Sieve with the argument --mcp.",
            },
          ],
        },
      });
      break;
    case "ping":
      send({ id, result: {} });
      break;
    default:
      if (!isNotification) send({ id, error: { code: -32601, message: "Method not found" } });
  }
});
