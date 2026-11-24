'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server.js');

const EXPECTED_TOOLS = [
  'sieve_health_status',
  'sieve_self_test',
  'sieve_findings_list',
  'sieve_issue_list',
  'sieve_scan_history',
  'sieve_scan_status',
  'sieve_check_text',
  'sieve_redact_text',
  'sieve_vault_run',
];

/**
 * Drive the server over stdio the way an MCP client would: write one JSON
 * object per line, close stdin, collect whatever came back on stdout.
 * Raw lines are written verbatim so malformed input can be exercised too.
 */
function exchange(messages, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject, new Error(`server did not exit within ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => finish(reject, err));
    child.on('close', (code) => {
      const responses = stdout
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
      finish(resolve, { responses, stderr, code });
    });

    for (const message of messages) {
      const line = typeof message === 'string' ? message : JSON.stringify(message);
      child.stdin.write(line + '\n');
    }
    child.stdin.end();
  });
}

test('initialize returns the MCP protocol version and server identity', async () => {
  const { responses } = await exchange([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
  ]);

  assert.strictEqual(responses.length, 1);
  const [res] = responses;
  assert.strictEqual(res.jsonrpc, '2.0');
  assert.strictEqual(res.id, 1);
  assert.strictEqual(res.result.protocolVersion, '2024-11-05');
  assert.strictEqual(res.result.serverInfo.name, 'sieve-mcp');
  assert.ok(res.result.serverInfo.version, 'serverInfo.version must be present');
  assert.deepStrictEqual(res.result.capabilities, { tools: {} });
});

test('tools/list advertises exactly the nine Sieve tools', async () => {
  const { responses } = await exchange([
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ]);

  const tools = responses[0].result.tools;
  assert.strictEqual(tools.length, 9, 'tool count must stay in sync with the Mac app');
  assert.deepStrictEqual(
    tools.map((t) => t.name).sort(),
    [...EXPECTED_TOOLS].sort()
  );
});

test('every tool declares a name, description and object inputSchema', async () => {
  const { responses } = await exchange([
    { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} },
  ]);

  for (const tool of responses[0].result.tools) {
    assert.ok(tool.name, 'tool is missing a name');
    assert.ok(
      typeof tool.description === 'string' && tool.description.length > 0,
      `${tool.name} is missing a description`
    );
    assert.strictEqual(
      tool.inputSchema.type,
      'object',
      `${tool.name} inputSchema must be an object`
    );
    assert.ok(
      Array.isArray(tool.inputSchema.required),
      `${tool.name} must declare a required array`
    );
  }
});

test('tools carrying mandatory arguments declare them as required', async () => {
  const { responses } = await exchange([
    { jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} },
  ]);

  const byName = Object.fromEntries(
    responses[0].result.tools.map((t) => [t.name, t])
  );

  assert.deepStrictEqual(byName.sieve_check_text.inputSchema.required, ['text']);
  assert.deepStrictEqual(byName.sieve_redact_text.inputSchema.required, ['text']);
  assert.deepStrictEqual(byName.sieve_vault_run.inputSchema.required, ['command']);

  // Read-only introspection tools take no arguments at all.
  for (const name of [
    'sieve_health_status',
    'sieve_self_test',
    'sieve_issue_list',
    'sieve_scan_status',
  ]) {
    assert.deepStrictEqual(
      byName[name].inputSchema.required,
      [],
      `${name} should not require arguments`
    );
  }
});

test('tools/call returns the App Store redirect rather than executing', async () => {
  const { responses } = await exchange([
    {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'sieve_health_status', arguments: {} },
    },
  ]);

  const content = responses[0].result.content;
  assert.strictEqual(content[0].type, 'text');
  assert.match(content[0].text, /introspection stub/i);
  assert.match(content[0].text, /apps\.apple\.com/);
});

test('unknown methods with an id return JSON-RPC -32601', async () => {
  const { responses } = await exchange([
    { jsonrpc: '2.0', id: 6, method: 'resources/list', params: {} },
  ]);

  assert.strictEqual(responses.length, 1);
  assert.strictEqual(responses[0].id, 6);
  assert.strictEqual(responses[0].error.code, -32601);
  assert.strictEqual(responses[0].error.message, 'Method not found');
});

test('notifications produce no response', async () => {
  const { responses } = await exchange([
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', method: 'some/unknown/notification' },
  ]);

  assert.strictEqual(
    responses.length,
    0,
    'a message without an id must never be answered'
  );
});

test('malformed input is ignored without crashing the server', async () => {
  const { responses, code } = await exchange([
    'this is not json',
    '{"jsonrpc":"2.0","id":7,',
    { jsonrpc: '2.0', id: 8, method: 'initialize', params: {} },
  ]);

  assert.strictEqual(responses.length, 1, 'only the well-formed request is answered');
  assert.strictEqual(responses[0].id, 8);
  assert.strictEqual(code, 0, 'server should exit cleanly after bad input');
});

test('a full client handshake works in sequence over one connection', async () => {
  const { responses } = await exchange([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'sieve_check_text', arguments: { text: 'hello' } },
    },
  ]);

  assert.strictEqual(responses.length, 3, 'three requests, one notification');
  assert.deepStrictEqual(responses.map((r) => r.id), [1, 2, 3]);
  assert.ok(responses[0].result.protocolVersion);
  assert.strictEqual(responses[1].result.tools.length, 9);
  assert.ok(responses[2].result.content[0].text);
});
