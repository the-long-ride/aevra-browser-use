import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import os, { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { acquireLock, isAlive, readLock, releaseLock, type LockInfo } from '../src/daemon/lock.js';
import { serve, type ServeResult } from '../src/daemon/serve.js';
import { resolvePaths, type Paths } from '../src/paths.js';
import { markStateDirectory } from '../shared/aevra/packages/agent-integration/src/cleanup.js';

function testPaths(t: TestContext, ports: Partial<Paths['ports']> = {}): Paths {
  const dir = mkdtempSync(path.join(tmpdir(), 'aevra-browser-daemon-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const base = resolvePaths({ AEVRA_BROWSER_HOME: dir });
  return { ...base, ports: { pair: 0, mcp: 0, ws: 0, cdp: 0, ...ports } };
}

function started(t: TestContext, result: ServeResult) {
  assert.equal(result.status, 'started');
  if (result.status !== 'started') throw new Error('unreachable');
  t.after(() => result.stop());
  return result;
}

function deadPid(): number {
  for (let pid = 4_000_000; pid > 3_000_000; pid -= 1) if (!isAlive(pid)) return pid;
  throw new Error('no dead pid available');
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

function lockInfo(pid: number, mcp: number, startedAt = new Date().toISOString()): LockInfo {
  return {
    pid,
    ports: { pair: 1, mcp, ws: 3, cdp: 4 },
    mcpToken: 'dummy-token',
    startedAt,
  };
}

async function rpc(info: LockInfo, method: string, id = 1) {
  const response = await fetch(`http://127.0.0.1:${info.ports.mcp}/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${info.mcpToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method }),
  });
  return response.json() as Promise<{ result: { tools: unknown[] } }>;
}

test('serve publishes a lock with its real ports and answers MCP', async (t) => {
  const paths = testPaths(t);
  const daemon = started(t, await serve(paths));
  const lock = readLock(paths.lockFile);
  assert.equal(lock?.pid, process.pid);
  assert.ok((lock?.ports.mcp ?? 0) > 0);
  assert.equal(lock?.mcpToken.length, 43);
  assert.deepEqual(lock?.ports, daemon.info.ports);
  const tools = await rpc(daemon.info, 'tools/list');
  assert.equal(tools.result.tools.length, 10);
});

test('two concurrent serve calls produce exactly one running daemon', async (t) => {
  const paths = testPaths(t);
  const results = await Promise.all([serve(paths), serve(paths)]);
  const winners = results.filter((result) => result.status === 'started');
  const losers = results.filter((result) => result.status === 'running');
  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  started(t, winners[0] as ServeResult);
});

test('a second serve against a live daemon reports running quickly', async (t) => {
  const paths = testPaths(t);
  started(t, await serve(paths));
  const begin = Date.now();
  assert.deepEqual(await serve(paths), { status: 'running' });
  assert.ok(Date.now() - begin < 2000);
});

test('a lock left by a dead pid is replaced', async (t) => {
  const paths = testPaths(t);
  writeFileSync(paths.lockFile, JSON.stringify(lockInfo(deadPid(), 1)));
  const daemon = started(t, await serve(paths));
  assert.equal(readLock(paths.lockFile)?.pid, process.pid);
  assert.notEqual(readLock(paths.lockFile)?.mcpToken, 'dummy-token');
  assert.equal((await rpc(daemon.info, 'tools/list')).result.tools.length, 10);
});

test('a lock whose pid is alive but never answers healthz is replaced once its grace ends', async (t) => {
  const paths = testPaths(t);
  const old = new Date(Date.now() - 60_000).toISOString();
  writeFileSync(paths.lockFile, JSON.stringify(lockInfo(process.pid, await freePort(), old)));
  started(t, await serve(paths));
  assert.notEqual(readLock(paths.lockFile)?.mcpToken, 'dummy-token');
});

test('an empty lock file is treated as stale', async (t) => {
  const paths = testPaths(t);
  writeFileSync(paths.lockFile, '');
  started(t, await serve(paths));
  assert.equal(readLock(paths.lockFile)?.pid, process.pid);
});

for (const [name, key] of [
  ['pairing', 'pair'],
  ['MCP', 'mcp'],
  ['extension', 'ws'],
] as const) {
  test(`a ${name} port already in use rejects with BROWSER_LISTENER_FAILED and leaves no lock`, async (t) => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise<void>((resolve) => blocker.close(() => resolve())));
    const { port } = blocker.address() as { port: number };
    const paths = testPaths(t, { [key]: port });
    await assert.rejects(
      () => serve(paths),
      new RegExp(
        `BROWSER_LISTENER_FAILED: port ${port} in use \\(set AEVRA_BROWSER_[A-Z]+_PORT\\)`,
      ),
    );
    assert.equal(existsSync(paths.lockFile), false);
  });
}

test('stop removes the lock, releases the ports and is idempotent', async (t) => {
  const paths = testPaths(t);
  const daemon = started(t, await serve(paths));
  await daemon.stop();
  await daemon.stop();
  await daemon.closed;
  assert.equal(existsSync(paths.lockFile), false);
  await assert.rejects(() => rpc(daemon.info, 'ping'));
});

test('POST /shutdown stops the daemon', async (t) => {
  const paths = testPaths(t);
  const daemon = started(t, await serve(paths));
  const response = await fetch(`http://127.0.0.1:${daemon.info.ports.mcp}/shutdown`, {
    method: 'POST',
    headers: { authorization: `Bearer ${daemon.info.mcpToken}` },
  });
  assert.equal(response.status, 200);
  await daemon.closed;
  assert.equal(existsSync(paths.lockFile), false);
});

test('the pairing endpoint of a running daemon mints a code that redeems', async (t) => {
  const paths = testPaths(t);
  const daemon = started(t, await serve(paths));
  const base = `http://127.0.0.1:${daemon.info.ports.mcp}`;
  const headers = { authorization: `Bearer ${daemon.info.mcpToken}` };
  const { code } = (await (
    await fetch(`${base}/pairing-code`, { method: 'POST', headers })
  ).json()) as {
    code: string;
  };
  const paired = await fetch(`http://127.0.0.1:${daemon.info.ports.pair}/api/browser/pair`, {
    method: 'POST',
    body: JSON.stringify({
      code,
      extensionId: 'abcdefghijklmnopabcdefghijklmnop',
      profileId: '3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b',
      profileName: 'Test',
    }),
  });
  assert.equal(paired.status, 200);
  const body = (await paired.json()) as { token: string; wsUrl: string };
  assert.equal(body.wsUrl, `ws://127.0.0.1:${daemon.info.ports.ws}`);

  const list = (await (await fetch(`${base}/pairings`, { headers })).json()) as {
    pairings: Array<{ pairingId: string }>;
  };
  assert.equal(list.pairings.length, 1);
  const revoked = await fetch(`${base}/pairings/revoke`, { method: 'POST', headers, body: '{}' });
  assert.deepEqual(await revoked.json(), { removed: 1, epoch: 2 });
});

test('releaseLock only removes a lock owned by that pid', (t) => {
  const paths = testPaths(t);
  writeFileSync(paths.lockFile, JSON.stringify(lockInfo(process.pid, 1)));
  releaseLock(paths.lockFile, process.pid + 1);
  assert.equal(existsSync(paths.lockFile), true);
  releaseLock(paths.lockFile, process.pid);
  assert.equal(existsSync(paths.lockFile), false);
});

test('acquireLock creates the lock exclusively', async (t) => {
  const paths = testPaths(t);
  assert.equal(await acquireLock(paths.lockFile, lockInfo(process.pid, 1)), 'acquired');
  assert.equal(readLock(paths.lockFile)?.mcpToken, 'dummy-token');
});

test('readLock rejects malformed content', (t) => {
  const paths = testPaths(t);
  assert.equal(readLock(paths.lockFile), null);
  writeFileSync(paths.lockFile, '{"pid":"x"}');
  assert.equal(readLock(paths.lockFile), null);
});

test('a state directory marked by another product warns instead of stopping the daemon', async (t) => {
  const paths = testPaths(t);
  markStateDirectory(paths.stateDir, 'aevra', os.homedir());
  const warnings: string[] = [];
  t.mock.method(console, 'warn', (...parts: unknown[]) => void warnings.push(parts.join(' ')));
  started(t, await serve(paths));
  assert.match(warnings.join('\n'), /STATE_OWNERSHIP_CONFLICT/);
});
