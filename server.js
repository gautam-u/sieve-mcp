#!/usr/bin/env node
/**
 * Introspection stub for MCP registry checks (Glama, etc.).
 * Responds to initialize and tools/list only.
 * Production binary ships inside the Sieve Mac app:
 *   /Applications/Sieve.app/Contents/MacOS/sieve-mcp
 */

const readline = require("readline");

const TOOLS = [
  {
    name: "sieve_health_status",
    description: "Returns Sieve service health and finding counts.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "sieve_self_test",
    description: "Verifies scanner rules and transcript source coverage are healthy.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "sieve_findings_list",
    description: "Lists findings from the most recent scan. Previews are redacted — no plaintext secret values.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max findings to return (default 50)" },
      },
      required: [],
    },
  },
  {
    name: "sieve_issue_list",
    description: "Lists scanner health issues: unreadable sources, permission errors, parse failures.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "sieve_scan_history",
    description: "Returns past scan job summaries.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max jobs to return (default 10)" },
      },
      required: [],
    },
  },
  {
    name: "sieve_scan_status",
    description: "Returns status of the current or most recent scan: idle, running, completed, or failed.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "sieve_check_text",
    description: "Checks whether text contains secrets. Returns boolean only — never echoes input or detected values.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to check for secrets" },
      },
      required: ["text"],
    },
  },
  {
    name: "sieve_redact_text",
    description: "Redacts secrets from text, replacing values with sieve:// placeholders. Raw values are never returned.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to redact" },
        project_key: { type: "string", description: "Namespace for placeholders (e.g. 'myapp')" },
      },
      required: ["text"],
    },
  },
  {
    name: "sieve_vault_run",
    description: "Executes a command with macOS Keychain-resolved secrets injected as env vars. Returns exit code and line counts only — stdout/stderr content is never returned.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
        fingerprints: {
          type: "array",
          items: { type: "string" },
          description: "Fingerprints of vault secrets to inject",
        },
      },
      required: ["command"],
    },
  },
];

function respond(id, result) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, result });
  process.stdout.write(msg + "\n");
}

function respondError(id, code, message) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
  process.stdout.write(msg + "\n");
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  let req;
  try {
    req = JSON.parse(line.trim());
  } catch {
    return;
  }

  const { id, method } = req;

  if (method === "initialize") {
    respond(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "sieve-mcp", version: "1.0.0" },
    });
  } else if (method === "tools/list") {
    respond(id, { tools: TOOLS });
  } else if (method === "tools/call") {
    respond(id, {
      content: [
        {
          type: "text",
          text: "This is the introspection stub. Install Sieve from the Mac App Store to use the full MCP server: https://apps.apple.com/app/sieve-ai-secret-scanner/id6747506504",
        },
      ],
    });
  } else if (method === "notifications/initialized") {
    // no response needed for notifications
  } else {
    if (id !== undefined && id !== null) {
      respondError(id, -32601, "Method not found");
    }
  }
});
