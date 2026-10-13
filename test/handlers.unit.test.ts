import assert from 'node:assert/strict';
import test from 'node:test';
import { callBrowserTool } from '../src/mcp/handlers.js';
import { BROWSER_TOOLS } from '../src/mcp/tools.js';
import {
  errorCode,
  jsonOf,
  NORMAL_TAB,
  realRuntime,
  stubRuntime,
  textOf,
} from './helpers/handlers.js';

test('an unknown tool is an error result', async () => {
  const result = await callBrowserTool(stubRuntime(), 'browser_nope', {});
  assert.equal(errorCode(result), 'INVALID_REQUEST');
});

test('arguments are validated against the schema', async () => {
  const runtime = stubRuntime();
  assert.equal(
    errorCode(await callBrowserTool(runtime, 'browser_navigate', {})),
    'INVALID_REQUEST',
  );
  assert.equal(
    errorCode(
      await callBrowserTool(runtime, 'browser_navigate', { url: 'https://example.com', extra: 1 }),
    ),
    'INVALID_REQUEST',
  );
  assert.equal(
    errorCode(await callBrowserTool(runtime, 'browser_connect', { transport: 'serial' })),
    'INVALID_REQUEST',
  );
  assert.equal(
    errorCode(
      await callBrowserTool(runtime, 'browser_connect', { transport: 'cdp', cdpPort: 70000 }),
    ),
    'INVALID_REQUEST',
  );
  assert.equal(
    errorCode(await callBrowserTool(runtime, 'browser_status', 'text')),
    'INVALID_REQUEST',
  );
});

test('every tool name has a handler path', async () => {
  const runtime = stubRuntime();
  for (const tool of BROWSER_TOOLS) {
    const result = await callBrowserTool(runtime, tool.name, undefined);
    // Tools with required arguments report INVALID_REQUEST, the others succeed.
    const required = (tool.inputSchema.required as string[] | undefined) ?? [];
    assert.equal(Boolean(result.isError), required.length > 0, tool.name);
  }
});

test('navigating to a browser-internal page is blocked', async (t) => {
  const { runtime } = await realRuntime(t);
  const result = await callBrowserTool(runtime, 'browser_navigate', { url: 'chrome://settings' });
  assert.equal(errorCode(result), 'BROWSER_ORIGIN_BLOCKED');
});

test('opening a blocked URL in a new tab is blocked too', async (t) => {
  const { runtime } = await realRuntime(t);
  const result = await callBrowserTool(runtime, 'browser_tabs', {
    action: 'open',
    url: 'file:///x',
  });
  assert.equal(errorCode(result), 'BROWSER_ORIGIN_BLOCKED');
});

test('a URL with a token-shaped query is blocked', async (t) => {
  const { runtime } = await realRuntime(t);
  const url = `https://example.com/?k=ghp_${'a'.repeat(36)}`;
  const result = await callBrowserTool(runtime, 'browser_navigate', { url });
  assert.equal(errorCode(result), 'BROWSER_ORIGIN_BLOCKED');
  assert.match(textOf(result), /secret-shaped/);
});

test('aevra ports and this daemon own ports are never drivable', async (t) => {
  const { runtime } = await realRuntime(t, [47842]);
  for (const url of ['http://127.0.0.1:47831/', 'http://localhost:47842/mcp']) {
    const result = await callBrowserTool(runtime, 'browser_navigate', { url });
    assert.equal(errorCode(result), 'BROWSER_ORIGIN_BLOCKED', url);
  }
});

test('an ordinary navigation succeeds and returns JSON', async (t) => {
  const { runtime, visit } = await realRuntime(t);
  await visit('https://example.com/');
  const result = await callBrowserTool(runtime, 'browser_navigate', {
    url: 'https://example.com/next',
  });
  assert.equal(result.isError, undefined);
  assert.equal(jsonOf(result).url, 'https://example.com/next');
});

test('a blocked active tab refuses page tools but still lists tabs', async (t) => {
  const { runtime } = await realRuntime(t);
  // The fake starts on about:blank, a blocked origin.
  assert.equal(
    errorCode(await callBrowserTool(runtime, 'browser_read', {})),
    'BROWSER_ORIGIN_BLOCKED',
  );
  const listed = await callBrowserTool(runtime, 'browser_tabs', { action: 'list' });
  assert.equal(listed.isError, undefined);
  assert.equal(jsonOf(listed).result[0].originClass, 'BLOCKED');
});

test('an unknown tab id is NOT_FOUND', async (t) => {
  const { runtime, visit } = await realRuntime(t);
  await visit('https://example.com/');
  const result = await callBrowserTool(runtime, 'browser_read', { tabId: 'missing' });
  assert.equal(errorCode(result), 'NOT_FOUND');
});

test('a vision snapshot of a sensitive origin is refused, an a11y one is not', async (t) => {
  const { runtime, visit } = await realRuntime(t);
  await visit('https://www.paypal.com/');
  const refused = await callBrowserTool(runtime, 'browser_snapshot', { mode: 'vision' });
  assert.equal(errorCode(refused), 'BROWSER_ORIGIN_BLOCKED');
  assert.match(textOf(refused), /screenshot/);
  const allowed = await callBrowserTool(runtime, 'browser_snapshot', { mode: 'a11y' });
  assert.equal(allowed.isError, undefined);
});

test('a vision snapshot returns an image block and keeps the pixels out of the JSON', async (t) => {
  const { runtime, visit } = await realRuntime(t);
  await visit('https://example.com/');
  const result = await callBrowserTool(runtime, 'browser_snapshot', { mode: 'vision' });
  assert.equal(result.content.length, 2);
  assert.deepEqual(result.content[1], {
    type: 'image',
    data: 'iVBORw0KGgo=',
    mimeType: 'image/png',
  });
  const body = jsonOf(result);
  assert.equal(body.imageDataUri, undefined);
  assert.equal(body.untrusted, true);
});

test('an a11y snapshot is marked untrusted and clamps maxNodes', async (t) => {
  const { runtime, visit } = await realRuntime(t);
  await visit('https://example.com/');
  const body = jsonOf(await callBrowserTool(runtime, 'browser_snapshot', { maxNodes: 2000 }));
  assert.equal(body.untrusted, true);
  assert.ok(Array.isArray(body.nodes));
});

test('a read result with a secret-shaped value comes back redacted and untrusted', async () => {
  const secret = `ghp_${'a'.repeat(36)}`;
  const runtime = stubRuntime({
    read: async () => ({ tabId: 'tab-1', url: 'https://example.com/', content: `token ${secret}` }),
  });
  const body = jsonOf(await callBrowserTool(runtime, 'browser_read', {}));
  assert.equal(body.untrusted, true);
  assert.ok(!JSON.stringify(body).includes(secret));
  assert.match(body.content, /REDACTED/i);
});

test('list results are wrapped, redacted and reclassified', async () => {
  const runtime = stubRuntime({
    tabs: async () => [{ ...NORMAL_TAB, url: 'http://127.0.0.1:47831/', originClass: 'NORMAL' }],
  });
  const body = jsonOf(await callBrowserTool(runtime, 'browser_tabs', { action: 'list' }));
  assert.equal(body.untrusted, true);
  assert.equal(body.result[0].originClass, 'BLOCKED');
});

test('typing into a credential field is refused by the driver and surfaced', async (t) => {
  const { runtime, visit } = await realRuntime(t);
  await visit('https://example.com/');
  const snapshot = jsonOf(await callBrowserTool(runtime, 'browser_snapshot', {}));
  const field = snapshot.nodes.find((node: { credentialField?: boolean }) => node.credentialField);
  assert.ok(field, 'fixture has a credential field');
  const result = await callBrowserTool(runtime, 'browser_act_many', {
    actions: [{ op: 'type', ref: field.ref, text: 'hello' }],
  });
  assert.equal(result.isError, undefined);
  assert.equal(jsonOf(result).result[0].error.code, 'BROWSER_CREDENTIAL_FIELD_REFUSED');
});

test('secret-shaped text is refused before it is typed into a page', async (t) => {
  const { runtime, visit } = await realRuntime(t);
  await visit('https://example.com/');
  const result = await callBrowserTool(runtime, 'browser_act_many', {
    actions: [{ op: 'type', selector: '#q', text: `ghp_${'a'.repeat(36)}` }],
  });
  assert.equal(errorCode(result), 'BROWSER_ORIGIN_BLOCKED');
});

test('a wait_for over the ceiling is refused, not clamped', async (t) => {
  const { runtime, visit } = await realRuntime(t);
  await visit('https://example.com/');
  const result = await callBrowserTool(runtime, 'browser_act_many', {
    actions: [{ op: 'wait_for', text: 'x', timeoutMs: 120_001 }],
  });
  assert.equal(errorCode(result), 'INVALID_REQUEST');
});

test('execute_script accepts the bounded grammar and rejects arbitrary JavaScript', async (t) => {
  const { runtime, visit } = await realRuntime(t);
  await visit('https://example.com/');
  const ok = await callBrowserTool(runtime, 'browser_execute_script', {
    script: "await page.locator('#new').click();",
  });
  assert.equal(ok.isError, undefined, textOf(ok));
  const bad = await callBrowserTool(runtime, 'browser_execute_script', {
    script: 'fetch("https://example.com")',
  });
  assert.equal(errorCode(bad), 'INVALID_REQUEST');
});

test('logs are bounded and untrusted', async (t) => {
  const { runtime, visit } = await realRuntime(t);
  await visit('https://example.com/');
  const body = jsonOf(await callBrowserTool(runtime, 'browser_logs', { limit: 500 }));
  assert.equal(body.untrusted, true);
  assert.equal(body.result[0].text, 'ready');
});
