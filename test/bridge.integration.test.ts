import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test, { type TestContext } from 'node:test';
import { runBridge, MAX_LINE_BYTES } from '../src/bridge/stdio-bridge.js';
import { isAlive } from '../src/daemon/lock.js';
import { serve, type ServeResult } from '../src/daemon/serve.js';
import { resolvePaths, type Paths } from '../src/paths.js';

function testPaths(t: TestContext): Paths {
  const dir = mkdtempSync(path.join(tmpdir(), 'aevra-browser-bridge-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return {
    ...resolvePaths({ AEVRA_BROWSER_HOME: dir }),
    ports: { pair: 0, mcp: 0, ws: 0, cdp: 0 },
  };
}

/** Collects daemons started by the tests so each one is stopped afterwards. */
function daemonTracker(t: TestContext, paths: Paths) {
  const started: ServeResult[] = [];
  const spawned: Array<Promise<void>> = [];
  t.after(async () => {
    await Promise.all(spawned);
    for (const result of started) if (result.status === 'started') await result.stop();
  });
  return {
    spawnCount: () => spawned.length,
    start: async () => {
      const result = await serve(paths);
      started.push(result);
      return result;
    },
    spawnDaemon: () => {
      spawned.push(serve(paths).then((result) => void started.push(result)));
    },
  };
}

interface Session {
  write(text: string): void;
  end(): void;
  lines(): unknown[];
  stderr(): string;
  exit: Promise<number>;
  waitForLines(count: number): Promise<unknown[]>;
}

function session(paths: Paths, deps: Partial<Parameters<typeof runBridge>[1]> = {}): Session {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = '';
  let err = '';
  stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')));
  stderr.on('data', (chunk: Buffer) => (err += chunk.toString('utf8')));
  const lines = () =>
    out
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
  const exit = runBridge(
    { stdin, stdout, stderr },
    { paths, spawnDaemon: () => undefined, fetch, waitMs: 3000, ...deps },
  );
  return {
    write: (text) => void stdin.write(text),
    end: () => void stdin.end(),
    lines,
    stderr: () => err,
    exit,
    waitForLines: async (count) => {
      const deadline = Date.now() + 5000;
      while (lines().length < count && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return lines();
    },
  };
}

const rpc = (method: string, id?: number, params?: unknown) =>
  `${JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, params })}\n`;

type Reply = {
  id: number | null;
  result?: { tools?: unknown[] };
  error?: { code: number; message: string };
};

test('two bridges share one daemon and both list ten tools', async (t) => {
  const paths = testPaths(t);
  const tracker = daemonTracker(t, paths);
  await tracker.start();
  const a = session(paths);
  const b = session(paths);
  a.write(rpc('tools/list', 1));
  b.write(rpc('tools/list', 7));
  const [replyA] = (await a.waitForLines(1)) as Reply[];
  const [replyB] = (await b.waitForLines(1)) as Reply[];
  assert.equal(replyA?.id, 1);
  assert.equal(replyA?.result?.tools?.length, 10);
  assert.equal(replyB?.id, 7);
  assert.equal(replyB?.result?.tools?.length, 10);
  a.end();
  b.end();
  assert.deepEqual(await Promise.all([a.exit, b.exit]), [0, 0]);
  assert.equal(tracker.spawnCount(), 0);
});

test('with no daemon the bridge spawns one and the call succeeds', async (t) => {
  const paths = testPaths(t);
  const tracker = daemonTracker(t, paths);
  const s = session(paths, { spawnDaemon: tracker.spawnDaemon });
  s.write(rpc('tools/list', 1));
  const [reply] = (await s.waitForLines(1)) as Reply[];
  assert.equal(reply?.result?.tools?.length, 10);
  assert.equal(tracker.spawnCount(), 1);
  s.end();
  assert.equal(await s.exit, 0);
});

test('a stale lock with a dead pid triggers a spawn', async (t) => {
  const paths = testPaths(t);
  const tracker = daemonTracker(t, paths);
  let pid = 4_000_000;
  while (isAlive(pid)) pid -= 1;
  writeFileSync(
    paths.lockFile,
    JSON.stringify({
      pid,
      ports: { pair: 1, mcp: 1, ws: 1, cdp: 1 },
      mcpToken: 'dummy-token',
      startedAt: new Date().toISOString(),
    }),
  );
  const s = session(paths, { spawnDaemon: tracker.spawnDaemon });
  s.write(rpc('tools/list', 1));
  const [reply] = (await s.waitForLines(1)) as Reply[];
  assert.equal(reply?.result?.tools?.length, 10);
  assert.equal(tracker.spawnCount(), 1);
  s.end();
  await s.exit;
});

test('a non-JSON line is -32700 and the next valid line still works', async (t) => {
  const paths = testPaths(t);
  await daemonTracker(t, paths).start();
  const s = session(paths);
  s.write('this is not json\n');
  s.write(rpc('ping', 5));
  const replies = (await s.waitForLines(2)) as Reply[];
  assert.deepEqual(replies[0]?.error?.code, -32700);
  assert.equal(replies[0]?.id, null);
  assert.equal(replies[1]?.id, 5);
  s.end();
  assert.equal(await s.exit, 0);
});

test('a line over 8 MiB is -32600 and the bridge keeps running', async (t) => {
  const paths = testPaths(t);
  await daemonTracker(t, paths).start();
  const s = session(paths);
  s.write(`${'x'.repeat(MAX_LINE_BYTES + 1)}\n`);
  s.write(rpc('ping', 2));
  const replies = (await s.waitForLines(2)) as Reply[];
  assert.equal(replies[0]?.error?.code, -32600);
  assert.equal(replies[0]?.id, null);
  assert.equal(replies[1]?.id, 2);
  s.end();
  assert.equal(await s.exit, 0);
});

test('a line split across chunks and a final line without a newline are handled', async (t) => {
  const paths = testPaths(t);
  await daemonTracker(t, paths).start();
  const s = session(paths);
  const text = rpc('ping', 1).trimEnd();
  s.write(text.slice(0, 10));
  s.write(`${text.slice(10)}\n`);
  s.write('\n   \n');
  s.write(text.replace('"id":1', '"id":2'));
  s.end();
  assert.equal(await s.exit, 0);
  assert.deepEqual(
    (s.lines() as Reply[]).map((reply) => reply.id),
    [1, 2],
  );
});

test('notifications produce no stdout line', async (t) => {
  const paths = testPaths(t);
  await daemonTracker(t, paths).start();
  const s = session(paths);
  s.write(rpc('notifications/initialized'));
  s.write(rpc('ping', 3));
  s.end();
  assert.equal(await s.exit, 0);
  assert.deepEqual(
    (s.lines() as Reply[]).map((reply) => reply.id),
    [3],
  );
});

test('a daemon that dies mid-session is restarted once', async (t) => {
  const paths = testPaths(t);
  const tracker = daemonTracker(t, paths);
  const first = await tracker.start();
  const s = session(paths, { spawnDaemon: tracker.spawnDaemon });
  s.write(rpc('ping', 1));
  await s.waitForLines(1);
  if (first.status === 'started') await first.stop();
  s.write(rpc('tools/list', 2));
  const replies = (await s.waitForLines(2)) as Reply[];
  assert.equal(replies[1]?.result?.tools?.length, 10);
  assert.equal(tracker.spawnCount(), 1);
  s.end();
  assert.equal(await s.exit, 0);
});

test('an unreachable daemon is a -32000 error for that request id', async (t) => {
  const paths = testPaths(t);
  const tracker = daemonTracker(t, paths);
  const first = await tracker.start();
  const s = session(paths, { waitMs: 300 });
  s.write(rpc('ping', 1));
  await s.waitForLines(1);
  if (first.status === 'started') await first.stop();
  s.write(rpc('ping', 2));
  s.write(rpc('notifications/initialized'));
  const replies = (await s.waitForLines(2)) as Reply[];
  assert.equal(replies[1]?.id, 2);
  assert.equal(replies[1]?.error?.code, -32000);
  assert.match(replies[1]?.error?.message ?? '', /browser daemon unavailable/);
  s.end();
  assert.equal(await s.exit, 0);
});

test('startup fails with BROWSER_DAEMON_UNAVAILABLE when no daemon can be started', async (t) => {
  const paths = testPaths(t);
  const s = session(paths, { waitMs: 300 });
  assert.equal(await s.exit, 1);
  assert.match(s.stderr(), /BROWSER_DAEMON_UNAVAILABLE/);
});

test('an unexpected daemon status becomes a -32000 error', async (t) => {
  const paths = testPaths(t);
  const fake = createServer((request, response) => {
    if (request.url === '/healthz') {
      response.writeHead(200).end('{"ok":true}');
      return;
    }
    request.resume();
    request.on('end', () => response.writeHead(500).end('oops'));
  });
  await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => fake.close(() => resolve())));
  const port = (fake.address() as { port: number }).port;
  writeFileSync(
    paths.lockFile,
    JSON.stringify({
      pid: process.pid,
      ports: { pair: 1, mcp: port, ws: 1, cdp: 1 },
      mcpToken: 'dummy-token',
      startedAt: new Date().toISOString(),
    }),
  );
  const s = session(paths);
  s.write(rpc('ping', 4));
  const [reply] = (await s.waitForLines(1)) as Reply[];
  assert.equal(reply?.id, 4);
  assert.equal(reply?.error?.code, -32000);
  assert.match(reply?.error?.message ?? '', /500/);
  s.end();
  assert.equal(await s.exit, 0);
});
