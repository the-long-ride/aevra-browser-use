import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { credentialTransport, runBrowserAgentCli, stopDaemon } from '../src/agent-command.js';
import { resolvePaths, type Paths } from '../src/paths.js';
import { markStateDirectory } from '../shared/aevra/packages/agent-integration/src/cleanup.js';

interface Seen {
  method?: string;
  url?: string;
  authorization?: string;
}

// A stand-in daemon: answers /healthz, exits (drops its lock) on /shutdown, echoes /mcp.
async function fakeDaemon(t: TestContext, paths: Paths) {
  const seen: Seen[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    seen.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
    });
    if (request.url === '/shutdown') unlinkSync(paths.lockFile);
    if (request.url !== '/mcp') return void response.end('ok');
    request.resume();
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { pong: true } }));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  mkdirSync(path.dirname(paths.lockFile), { recursive: true });
  writeFileSync(
    paths.lockFile,
    JSON.stringify({
      pid: process.pid,
      ports: { pair: 1, mcp: address.port, ws: 3, cdp: 4 },
      mcpToken: 'plain lock phrase',
      startedAt: new Date().toISOString(),
    }),
  );
  return { seen, port: address.port };
}

function setup(t: TestContext) {
  const home = mkdtempSync(path.join(tmpdir(), 'aevra-agent-daemon-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const stateDir = path.join(home, 'state');
  const paths = resolvePaths({ AEVRA_BROWSER_HOME: stateDir });
  const deps = {
    fetch,
    home,
    spawnDaemon: () => assert.fail('a live daemon must not be respawned'),
  };
  return { home, stateDir, paths, deps };
}

test('stopDaemon asks the live daemon to shut down and waits for its lock to go', async (t) => {
  const { paths, deps } = setup(t);
  const { seen } = await fakeDaemon(t, paths);
  await stopDaemon(paths, deps);
  const shutdown = seen.find((request) => request.url === '/shutdown');
  assert.equal(shutdown?.method, 'POST');
  assert.equal(shutdown?.authorization, 'Bearer plain lock phrase');
  assert.equal(existsSync(paths.lockFile), false);
});

test('uninstall --purge stops a running daemon before removing its state', async (t) => {
  const { home, stateDir, paths, deps } = setup(t);
  mkdirSync(stateDir, { recursive: true });
  markStateDirectory(stateDir, 'aevra-browser', home);
  const { seen } = await fakeDaemon(t, paths);
  const log = console.log;
  console.log = () => undefined;
  try {
    assert.equal(await runBrowserAgentCli(['uninstall', '--purge'], paths, deps), 0);
  } finally {
    console.log = log;
  }
  assert.ok(seen.some((request) => request.url === '/shutdown'));
  assert.equal(existsSync(stateDir), false);
});

test('a refused purge leaves the running daemon alone', async (t) => {
  const { stateDir, paths, deps } = setup(t);
  mkdirSync(stateDir, { recursive: true });
  const { seen } = await fakeDaemon(t, paths);
  await assert.rejects(runBrowserAgentCli(['uninstall', '--purge'], paths, deps), /STATE_/);
  assert.equal(
    seen.some((request) => request.url === '/shutdown'),
    false,
  );
  assert.ok(existsSync(paths.lockFile));
});

test('mcp --credential-file talks to the live daemon port, not the saved endpoint', async (t) => {
  const { stateDir, paths, deps } = setup(t);
  const { seen } = await fakeDaemon(t, paths);
  const file = path.join(stateDir, 'agent-credentials', 'x.json');
  mkdirSync(path.dirname(file), { recursive: true });
  // The saved endpoint names a port nothing listens on: the daemon moved since install.
  writeFileSync(
    file,
    JSON.stringify({ version: 1, token: 'plain test phrase', endpoint: 'http://127.0.0.1:9/mcp' }),
  );
  const transport = await credentialTransport(file, deps);
  const frames: unknown[] = [];
  await transport.send(
    { jsonrpc: '2.0', id: 1, method: 'ping' },
    async (frame) => void frames.push(frame),
    AbortSignal.timeout(5_000),
  );
  await transport.close?.();
  const call = seen.find((request) => request.url === '/mcp');
  assert.equal(call?.authorization, 'Bearer plain test phrase');
  assert.deepEqual(frames, [{ jsonrpc: '2.0', id: 1, result: { pong: true } }]);
});
