# sieve-mcp

MCP server for [Sieve](https://apps.apple.com/app/sieve-ai-secret-scanner/id6747506504) — a macOS app that scans local AI coding tool history for secrets leaked into prompts.

`sieve-mcp` is bundled inside the Sieve Mac app. No separate install. No network calls. All operations run on-device.

## Install

1. Download **[Sieve for Mac](https://apps.apple.com/app/sieve-ai-secret-scanner/id6747506504)** from the App Store.
2. Open Sieve → **Settings → MCP** → toggle **Enable MCP server** on.

## Configure Claude Code

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sieve": {
      "command": "/Applications/Sieve.app/Contents/MacOS/sieve-mcp"
    }
  }
}
```

Restart Claude Code and run `/mcp` to verify `sieve` appears.

## Configure Claude Desktop

Add the same block to `~/Library/Application Support/Claude/claude_desktop_config.json` and restart.

## Tools

All tools are **safe by design** — no tool ever returns a plaintext secret value.

### `sieve_health_status`

Returns service health and finding counts.

**Response:**
```json
{
  "status": "ok",
  "findings_count": 12,
  "scan_jobs": 3
}
```

---

### `sieve_self_test`

Verifies scanner rules and transcript source coverage are healthy.

**Response:**
```json
{
  "fingerprintHealthy": true,
  "ruleCount": 28,
  "transcriptSourceCount": 9,
  "healthy": true,
  "issues": []
}
```

---

### `sieve_findings_list`

Lists findings from the most recent scan.

**Input:** `{ "limit": 50 }` *(optional)*

**Response:**
```json
[
  {
    "findingId": "abc123",
    "ruleId": "github-pat",
    "severity": "critical",
    "sourcePath": "~/.claude/projects/myapp/transcript.jsonl",
    "sourceType": "ClaudeCode",
    "secretFingerprint": "hmac:sha256:7f3a...",
    "previewRedacted": "ghp_[REDACTED]",
    "providerExposureAssumed": true,
    "rotationStatus": "pending",
    "redactionPlaceholder": "sieve://myapp/github-pat"
  }
]
```

`providerExposureAssumed: true` — secret found in an AI tool transcript. Assume the provider (Anthropic, OpenAI, etc.) can associate the prompt with your account identity.

---

### `sieve_issue_list`

Lists scanner health issues — unreadable sources, permission errors, parse failures.

**Response:**
```json
[
  {
    "issueId": "iss1",
    "code": "SCAN_TARGET_UNREADABLE",
    "severity": "warning",
    "component": "ClaudeDesktop",
    "message": "Could not read chat DB — Full Disk Access may be required",
    "suggestion": "Grant Full Disk Access in System Settings → Privacy & Security"
  }
]
```

---

### `sieve_scan_history`

Returns past scan job summaries.

**Input:** `{ "limit": 10 }` *(optional)*

**Response:**
```json
[
  {
    "jobId": "job1",
    "startedAt": "2026-05-22T10:00:00Z",
    "finishedAt": "2026-05-22T10:00:12Z",
    "sourcesCount": 4,
    "findingsCount": 3,
    "issuesCount": 0
  }
]
```

---

### `sieve_scan_status`

Returns status of the current or most recent scan.

**Response:**
```json
{ "status": "idle" }
```

Values: `"idle"` · `"running"` · `"completed"` · `"failed: <reason>"`

---

### `sieve_check_text`

Checks whether text contains secrets. **Returns boolean only — never echoes input or detected values.**

**Input:** `{ "text": "<content to check>" }`

**Response:**
```json
{ "has_secrets": true }
```

Use this to gate operations before sending content to an external API.

---

### `sieve_redact_text`

Redacts secrets from text, replacing values with `sieve://` placeholders.

**Input:** `{ "text": "<content>", "project_key": "myapp" }`

**Response:**
```json
{
  "redacted": "export STRIPE_KEY=sieve://myapp/stripe-secret-key",
  "hadSecrets": true,
  "placeholders": [
    {
      "ruleId": "stripe-secret-key",
      "placeholder": "sieve://myapp/stripe-secret-key",
      "fingerprint": "hmac:sha256:a1b2..."
    }
  ]
}
```

Raw values are **never** included in the response.

---

### `sieve_vault_run`

Executes a command with macOS Keychain-resolved secrets injected as env vars. Secrets never transit the MCP channel.

**Input:** `{ "command": "npm run deploy", "fingerprints": ["hmac:sha256:a1b2..."] }`

**Response:**
```json
{
  "exit_code": 0,
  "succeeded": true,
  "timed_out": false,
  "stdout_line_count": 14,
  "stderr_line_count": 0
}
```

stdout/stderr content is **never** returned — only line counts.

---

## Supported AI tool sources

| Tool | Source |
|------|--------|
| Claude Code | JSONL project transcripts |
| Claude Desktop | SQLite chat database |
| Cursor | SQLite state database |
| VS Code / Copilot Chat | JSON history files |
| Windsurf | JSON history files |
| Cline | JSON session files |
| Codex CLI | JSONL/JSON session files |
| Gemini CLI | JSON history files |
| `.env` files | Selected project roots |
| Custom sources | User-added folders |

Cross-source correlation fires when the same secret fingerprint appears in both a transcript and a `.env` file (`CROSS_SOURCE_EXPOSURE`).

## Security posture

- **Local-only.** stdio transport, no network calls, no cloud sync.
- **No plaintext secrets in responses.** Hard invariant in the dispatcher — not configurable.
- **Fingerprint-only persistence.** Findings DB stores HMAC fingerprints + redacted previews only.
- **Keychain-backed vault.** Secret values live in macOS Keychain with biometric access control.
- **Explicit opt-in.** MCP is off by default; requires toggle in Sieve Settings.
- **Unreadable sources reported.** `SCAN_TARGET_UNREADABLE` surfaces in `sieve_issue_list` — no silent skipping.

## Transport

stdio. The `sieve-mcp` binary reads JSON-RPC 2.0 from stdin and writes to stdout. MCP clients (Claude Code, Claude Desktop) manage the process lifecycle.

## Platform

macOS only. Requires Sieve app installed from the [Mac App Store](https://apps.apple.com/app/sieve-ai-secret-scanner/id6747506504).

## Links

- **Mac App Store:** https://apps.apple.com/app/sieve-ai-secret-scanner/id6747506504
- **Product site:** https://sieve.app
