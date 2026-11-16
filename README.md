# sieve-mcp

MCP server for [Sieve](https://apps.apple.com/app/id6767409365), a Mac app that finds API keys and
other secrets that leaked into your AI coding tools' chat history and `.env` files.

The server lets your coding agent check and redact secrets, list secrets that already leaked, and run
commands with secrets from the macOS Keychain without ever seeing them. **No tool returns a secret
value.** Everything runs on your Mac.

> This repository holds the documentation, an agent skill, and a small stub that registries use to
> list the tools. The real server ships inside the Sieve app. The stub cannot scan anything.

## Install

1. Install **[Sieve for Mac](https://apps.apple.com/app/id6767409365)** (free, macOS 13 or later).
2. Open Sieve, go to **Settings → MCP Server**, and turn on **Enable MCP Server**. It is off by
   default, and every tool refuses to run until you turn it on.
3. Add the server to your client (below). Sieve can also generate the entry for Claude Code or
   Codex: click **Copy Configuration** in the same settings section.

The server is the app itself, started with `--mcp`:

```
/Applications/Sieve.app/Contents/MacOS/Sieve --mcp
```

## Add it to your client

**Claude Code**

```bash
claude mcp add --scope user sieve -- /Applications/Sieve.app/Contents/MacOS/Sieve --mcp
```

**Claude Desktop**: add to `~/Library/Application Support/Claude/claude_desktop_config.json`, then
restart Claude.

```json
{
  "mcpServers": {
    "sieve": {
      "command": "/Applications/Sieve.app/Contents/MacOS/Sieve",
      "args": ["--mcp"]
    }
  }
}
```

**Cursor**: add the same `mcpServers` entry to `~/.cursor/mcp.json`.

**VS Code**: add to `.vscode/mcp.json` in your workspace, or to your user MCP configuration.

```json
{
  "servers": {
    "sieve": {
      "type": "stdio",
      "command": "/Applications/Sieve.app/Contents/MacOS/Sieve",
      "args": ["--mcp"]
    }
  }
}
```

**Codex**: add to `~/.codex/config.toml`. This matches what Sieve generates, which leaves
`sieve_vault_run` off.

```toml
[mcp_servers.sieve]
command = "/Applications/Sieve.app/Contents/MacOS/Sieve"
args = ["--mcp"]
disabled_tools = ["sieve_vault_run"]
```

## Tools

| Tool | What it does |
|---|---|
| `sieve_health_status` | Service and database health, with finding and scan counts. |
| `sieve_self_test` | Checks the fingerprint key, rule count and source coverage. |
| `sieve_scan_status` | Whether a scan is idle, running, completed or failed. |
| `sieve_scan_history` | Past scan summaries. Optional `limit`. |
| `sieve_findings_list` | Saved findings with redacted previews. Optional `limit`. |
| `sieve_issue_list` | Problems from the last scan, such as sources Sieve could not read. |
| `sieve_check_text` | Whether `text` contains a detectable secret. Returns a boolean only. |
| `sieve_redact_text` | Returns `text` with each secret replaced by a `sieve://<project_key>/<rule>` placeholder. |
| `sieve_vault_run` | Runs a command with secrets from Sieve's Keychain vault as environment variables. Returns the exit code and line counts only. |
| `sieve_projects_list` | Saved dependency-security summaries for your projects. |
| `sieve_project_findings` | Dependency inventory and known advisory matches for one project. |
| `sieve_project_scan_history` | Saved scan summaries for one project. |

The three `sieve_project_*` tools also need **Share project snapshots with MCP** turned on in
Sieve's Projects view. They read saved snapshots only. They do not scan folders, run commands or go
online.

The MCP tools only read saved data or work on the text you pass them. Scans run in the Sieve app.

### Example responses

Values below are illustrative.

`sieve_check_text`

```json
{ "has_secrets": true }
```

`sieve_redact_text` with `{"text": "export STRIPE_KEY=sk_live_…", "project_key": "myapp"}`

```json
{
  "redacted": "export STRIPE_KEY=sieve://myapp/stripe-secret-key",
  "hadSecrets": true,
  "placeholders": [
    {
      "ruleId": "stripe-secret-key",
      "placeholder": "sieve://myapp/stripe-secret-key",
      "fingerprint": "sfp:v1:…"
    }
  ]
}
```

`sieve_findings_list`

```json
[
  {
    "findingId": "…",
    "ruleId": "github-pat",
    "severity": "critical",
    "sourceType": "transcript",
    "sourcePath": "/Users/you/.claude/projects/myapp/session.jsonl",
    "previewRedacted": "ghp_ab12****",
    "secretFingerprint": "sfp:v1:…",
    "providerExposureAssumed": true,
    "rotationStatus": "rotation_due"
  }
]
```

`providerExposureAssumed: true` means the secret appeared in an AI chat. Treat it as sent to that
AI provider, linked to your account, and rotate it at the provider. Redacting the local copy does not
make the key safe again.

`sieve_issue_list`

```json
[
  {
    "issueId": "…",
    "code": "SCAN_TARGET_UNREADABLE",
    "severity": "medium",
    "component": "claude-code",
    "message": "…"
  }
]
```

A scan is not complete while issues like this remain. Sieve reports unreadable sources instead of
skipping them.

### `sieve_vault_run`

```json
{
  "command": "npm run deploy",
  "fingerprints": "{\"sfp:v1:…\": \"STRIPE_API_KEY\"}"
}
```

- `command` is split on spaces and run directly. There is no shell, so pipes, redirects, quotes and
  `$VARS` do not work.
- `fingerprints` is a **JSON-encoded string** that maps a Sieve fingerprint to the environment
  variable name the command expects. The secret must already be stored in Sieve's vault.
- The response holds `exit_code`, `succeeded`, `timed_out`, `stdout_line_count` and
  `stderr_line_count`. Output text is never returned, because it could contain the secret.

This tool runs commands on your Mac. Keep your client's tool approval on for it, or disable it, as
the Codex example does.

## Agent skill

[`skills/sieve-secrets/SKILL.md`](skills/sieve-secrets/SKILL.md) tells an agent when and how to use
these tools: never ask you to paste keys, redact text before it leaves the machine, use the vault for
commands that need a secret, and report leaked keys without revealing them. Copy the folder into your
agent's skills directory, for example `~/.claude/skills/` for Claude Code.

## What Sieve scans

You grant access to each tool's folder in the app.

| Tool | What Sieve reads |
|---|---|
| Claude Code | JSONL transcripts in `~/.claude` |
| Claude Desktop | Local session JSON files |
| Cursor | Workspace SQLite chat state |
| VS Code and VS Code Insiders (Copilot Chat) | Chat JSON/JSONL and SQLite state |
| Windsurf | Workspace SQLite chat state |
| Codex | JSON/JSONL history in `~/.codex` (best effort) |
| `.env` files | Project folders you choose |

When the same secret shows up in more than one place, for example a chat and a `.env` file, Sieve
groups them by fingerprint.

## Security and privacy

- **No secret values in responses.** This is enforced in the server and cannot be configured.
- **Off by default.** Every tool returns `MCP_DISABLED` until you turn the server on in the app.
- **Local stdio only.** No listening port. The MCP tools make no network calls.
- **Fingerprints, not values.** Sieve stores keyed fingerprints and redacted previews. Vault secrets
  live in the macOS Keychain.
- **Optional dependency checks.** In the Projects feature, Sieve can check dependencies against
  Google's OSV database. This runs only with your consent, and sends package names and versions
  only: no source files, paths or secrets.
- **Detection is pattern-based.** Sieve finds known key formats. Custom or internal credentials
  may not be detected, so a clean result does not prove text is free of secrets.

Privacy policy: https://gautam-u.github.io/sieve/privacy

## The stub in this repository

`server.js` answers `initialize` and `tools/list` with the real tool definitions in `tools.json`, so
MCP registries can list Sieve. Every `tools/call` returns an error that says how to install the real
server. It reads no files and makes no network calls.

```bash
npx github:gautam-u/sieve-mcp
```

## Links

- Mac App Store: https://apps.apple.com/app/id6767409365
- Website: https://gautam-u.github.io/sieve/

## License

MIT for the contents of this repository. The Sieve app is distributed separately through the
Mac App Store.
