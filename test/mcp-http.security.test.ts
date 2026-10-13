import assert from 'node:assert/strict';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import { createMcpHttpServer, type AdminHooks } from '../src/daemon/mcp-http.js';
import { handleJsonRpc, PROTOCOL_VERSION } from '../src/mcp/jsonrpc.js';
import { BROWSER_TOOLS } from '../src/mcp/tools.js';
import { VERSION } from '../src/version.js';

const TOKEN = 'test-token-0123456789abcdefghijklmnopqrstuvwxyz'.slice(0, 43);

interface Reply {
  status: number;
  body: string;
}

const host = { list: () => BROWSER_TOOLS, call: async (name: string) => ({ called: name }) };

function adminHooks(log: string[]): AdminHooks {
  return {
    createPairingCode: () => ({ code: 'ABCDEFGH', expiresAt: '2030-01-01T00:00:00.000Z' }),
    listPairings: () => [
      { pairingId: 'p1', profileName: 'P', extensionId: 'e', pairedAt: '2030-01-01T00:00:00.000Z' },
    ],
    revoke: async (id) => {
      log.push(`revoke:${id ?? 'all'}`);
      return { removed: id === 'missing' ? 0 : 1, epoch: 2 };
    },
    shutdown: () => void log.push('shutdown'),
  };
}

async function start(t: TestContext, log: string[] = []): Promise<Server> {
  const server = createMcpHttpServer({
    token: TOKEN,
    handle: (message) => handleJsonRpc(message, host),
    admin: adminHooks(log),
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return server;
}

function call(
  server: Server,
  options: {
    method?: string;
    path?: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
  },
): Promise<Reply> {
  const { port } = server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method: options.method ?? 'POST',
        path: options.path ?? '/mcp',
        headers: { 'content-type': 'application/json', ...options.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('error', reject);
    req.end(options.body);
  });
}

const auth = { authorization: `Bearer ${TOKEN}` };
const rpc = (method: string, id: number | null = 1, params?: unknown) =>
  JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, params });

test('no token is 401', async (t) => {
  const server = await start(t);
  assert.equal((await call(server, { body: rpc('ping') })).status, 401);
});

test('a wrong token of the same length is 401', async (t) => {
  const server = await start(t);
  const wrong = `Bearer ${'x'.repeat(TOKEN.length)}`;
  assert.equal(
    (await call(server, { headers: { authorization: wrong }, body: rpc('ping') })).status,
    401,
  );
});

test('a non-loopback Origin is 403 even with the right token', async (t) => {
  const server = await start(t);
  const reply = await call(server, {
    headers: { ...auth, origin: 'https://evil.test' },
    body: rpc('ping'),
  });
  assert.equal(reply.status, 403);
});

test('a non-loopback Origin without a token is 403, not a token probe', async (t) => {
  const server = await start(t);
  const reply = await call(server, { headers: { origin: 'https://evil.test' }, body: rpc('ping') });
  assert.equal(reply.status, 403);
});

test('a loopback Origin is accepted', async (t) => {
  const server = await start(t);
  const reply = await call(server, {
    headers: { ...auth, origin: 'http://localhost:5173' },
    body: rpc('ping'),
  });
  assert.equal(reply.status, 200);
});

test('a rebinding Host header is 403', async (t) => {
  const server = await start(t);
  const reply = await call(server, {
    headers: { ...auth, host: 'rebind.evil.test:47842' },
    body: rpc('ping'),
  });
  assert.equal(reply.status, 403);
});

test('initialize then tools/list returns the ten tools', async (t) => {
  const server = await start(t);
  const init = await call(server, { headers: auth, body: rpc('initialize', 1, {}) });
  const initBody = JSON.parse(init.body);
  assert.equal(initBody.result.protocolVersion, PROTOCOL_VERSION);
  assert.equal(PROTOCOL_VERSION, '2025-06-18');
  assert.deepEqual(initBody.result.serverInfo, { name: 'aevra-browser', version: VERSION });
  assert.deepEqual(initBody.result.capabilities, { tools: {} });

  const list = JSON.parse((await call(server, { headers: auth, body: rpc('tools/list', 2) })).body);
  assert.equal(list.id, 2);
  assert.equal(list.result.tools.length, 10);
});

test('tools/call reaches the tool host', async (t) => {
  const server = await start(t);
  const reply = await call(server, {
    headers: auth,
    body: rpc('tools/call', 3, { name: 'browser_status', arguments: {} }),
  });
  assert.deepEqual(JSON.parse(reply.body).result, { called: 'browser_status' });
});

test('a notification is 202 with an empty body', async (t) => {
  const server = await start(t);
  const reply = await call(server, { headers: auth, body: rpc('notifications/initialized', null) });
  assert.equal(reply.status, 202);
  assert.equal(reply.body, '');
});

test('an unknown method is -32601 and a bad request is -32600', async (t) => {
  const server = await start(t);
  const unknown = JSON.parse((await call(server, { headers: auth, body: rpc('nope') })).body);
  assert.equal(unknown.error.code, -32601);
  const bad = JSON.parse((await call(server, { headers: auth, body: '[]' })).body);
  assert.equal(bad.error.code, -32600);
  const noName = JSON.parse(
    (await call(server, { headers: auth, body: rpc('tools/call', 4, {}) })).body,
  );
  assert.equal(noName.error.code, -32602);
});

test('a tool host that throws becomes -32603', async () => {
  const reply = await handleJsonRpc(
    { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'x' } },
    {
      list: () => [],
      call: async () => {
        throw new Error('boom');
      },
    },
  );
  assert.equal((reply as { error: { code: number } }).error.code, -32603);
});

test('invalid JSON is a 400 parse error', async (t) => {
  const server = await start(t);
  const reply = await call(server, { headers: auth, body: '{nope' });
  assert.equal(reply.status, 400);
  assert.equal(JSON.parse(reply.body).error.code, -32700);
});

test('a 9 MiB body is 413', async (t) => {
  const server = await start(t);
  const reply = await call(server, { headers: auth, body: Buffer.alloc(9 * 1024 * 1024, 0x20) });
  assert.equal(reply.status, 413);
});

test('healthz needs no token and reports the pid', async (t) => {
  const server = await start(t);
  const reply = await call(server, { method: 'GET', path: '/healthz' });
  assert.deepEqual(JSON.parse(reply.body), { ok: true, pid: process.pid });
});

test('unknown paths are 404 and a known path with the wrong method is 404', async (t) => {
  const server = await start(t);
  assert.equal((await call(server, { method: 'GET', path: '/nope' })).status, 404);
  assert.equal((await call(server, { method: 'GET', path: '/mcp', headers: auth })).status, 404);
});

test('admin routes require the token', async (t) => {
  const server = await start(t);
  for (const route of ['/pairing-code', '/pairings/revoke', '/shutdown']) {
    assert.equal((await call(server, { path: route, body: '{}' })).status, 401, route);
  }
  assert.equal((await call(server, { method: 'GET', path: '/pairings' })).status, 401);
});

test('pairing-code, pairings, revoke and shutdown call the hooks', async (t) => {
  const log: string[] = [];
  const server = await start(t, log);
  const code = await call(server, { path: '/pairing-code', headers: auth, body: '{}' });
  assert.equal(JSON.parse(code.body).code, 'ABCDEFGH');
  const list = await call(server, { method: 'GET', path: '/pairings', headers: auth });
  assert.equal(JSON.parse(list.body).pairings.length, 1);

  const all = await call(server, { path: '/pairings/revoke', headers: auth, body: '{}' });
  assert.deepEqual(JSON.parse(all.body), { removed: 1, epoch: 2 });
  const one = await call(server, { path: '/pairings/revoke', headers: auth, body: '{"id":"p1"}' });
  assert.equal(one.status, 200);
  const none = await call(server, {
    path: '/pairings/revoke',
    headers: auth,
    body: '{"id":"missing"}',
  });
  assert.equal(none.status, 404);

  const stop = await call(server, { path: '/shutdown', headers: auth, body: '{}' });
  assert.equal(stop.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(log, ['revoke:all', 'revoke:p1', 'revoke:missing', 'shutdown']);
});

test('admin routes are 404 when the server has no admin hooks', async (t) => {
  const server = createMcpHttpServer({ token: TOKEN, handle: async () => null });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  assert.equal(
    (await call(server, { path: '/pairing-code', headers: auth, body: '{}' })).status,
    404,
  );
});
