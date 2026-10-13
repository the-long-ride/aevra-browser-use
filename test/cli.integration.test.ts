import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.js';
import { readLock } from '../src/daemon/lock.js';
import { serve, type ServeResult } from '../src/daemon/serve.js';
import { resolvePaths, type Paths } from '../src/paths.js';
import { VERSION } from '../src/version.js';
import { FakeCdp } from '../vendor/aevra/packages/browser/test/fake-cdp.js';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

function stateDir(t: TestContext): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'aevra-browser-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function ephemeralPaths(dir: string): Paths {
  const base = resolvePaths({ AEVRA_BROWSER_HOME: dir });
  return { ...base, ports: { pair: 0, mcp: 0, ws: 0, cdp: 0 } };
}

async function daemon(t: TestContext) {
  const paths = ephemeralPaths(stateDir(t));
  const result: ServeResult = await serve(paths);
  assert.equal(result.status, 'started');
  if (result.status !== 'started') throw new Error('unreachable');
  t.after(() => result.stop());
  return { paths, daemon: result };
}

async function run(argv: string[], paths: Paths) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, {
    paths,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    io: { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() },
    spawnDaemon: () => assert.fail('the daemon is already running'),
    waitMs: 500,
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

test('pair prints an 8-character code and the real pairing port', async (t) => {
  const { paths, daemon: d } = await daemon(t);
  const result = await run(['pair'], paths);
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /Pairing code: [0-9A-HJKMNP-TV-Z]{8}\b/);
  assert.ok(
    result.out.includes(
      `In the Aevra extension popup, enter this code and port ${d.info.ports.pair}.`,
    ),
  );
});

test('the instructions quote the default pairing port 47841 from the lock', async (t) => {
  const fake = createHttpServer((request, response) => {
    request.resume();
    response.setHeader('content-type', 'application/json');
    response.end(request.url === '/healthz' ? '{"ok":true}' : '{"code":"ABCDEFGH"}');
  });
  await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => fake.close(() => resolve())));
  const paths = ephemeralPaths(stateDir(t));
  writeFileSync(
    paths.lockFile,
    JSON.stringify({
      pid: process.pid,
      ports: { pair: 47841, mcp: (fake.address() as { port: number }).port, ws: 47843, cdp: 9222 },
      mcpToken: 'dummy-token',
      startedAt: new Date().toISOString(),
    }),
  );
  const result = await run(['pair'], paths);
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /Pairing code: ABCDEFGH/);
  assert.match(result.out, /enter this code and port 47841\./);
});

test('status reports state, hides the token by default and reveals it on request', async (t) => {
  const { paths, daemon: d } = await daemon(t);
  const plain = await run(['status'], paths);
  assert.equal(plain.code, 0, plain.err);
  assert.match(plain.out, /running \(pid /);
  assert.match(plain.out, /connection: not_paired/);
  assert.match(plain.out, /next: Run `aevra-browser pair`/);
  assert.ok(!plain.out.includes(d.info.mcpToken));

  const shown = await run(['status', '--show-token'], paths);
  assert.ok(shown.out.includes(`MCP token: ${d.info.mcpToken}`));

  const json = await run(['status', '--json'], paths);
  const body = JSON.parse(json.out);
  assert.equal(body.running, true);
  assert.equal(body.status.connectionState, 'not_paired');
  assert.equal(body.mcpToken, undefined);
  const jsonToken = JSON.parse((await run(['status', '--json', '--show-token'], paths)).out);
  assert.equal(jsonToken.mcpToken, d.info.mcpToken);
});

test('unpair --all removes pairings, bumps the epoch and unpair <id> reports a miss', async (t) => {
  const { paths, daemon: d } = await daemon(t);
  const pairPort = d.info.ports.pair;
  const code = /Pairing code: (\w{8})/.exec((await run(['pair'], paths)).out)?.[1];
  const paired = await fetch(`http://127.0.0.1:${pairPort}/api/browser/pair`, {
    method: 'POST',
    body: JSON.stringify({
      code,
      extensionId: 'abcdefghijklmnopabcdefghijklmnop',
      profileId: '3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b',
    }),
  });
  assert.equal(paired.status, 200);

  const status = await run(['status'], paths);
  assert.match(status.out, /3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b/);
  assert.match(status.out, /waiting_for_extension/);

  const missing = await run(['unpair', 'nope'], paths);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /No pairing with id nope/);

  const all = await run(['unpair', '--all'], paths);
  assert.equal(all.code, 0, all.err);
  assert.match(all.out, /Removed 1 pairing\(s\).*epoch 2/);
  assert.match((await run(['status'], paths)).out, /paired profiles: none/);
});

test('unpair <id> removes one pairing', async (t) => {
  const { paths, daemon: d } = await daemon(t);
  const code = /Pairing code: (\w{8})/.exec((await run(['pair'], paths)).out)?.[1];
  await fetch(`http://127.0.0.1:${d.info.ports.pair}/api/browser/pair`, {
    method: 'POST',
    body: JSON.stringify({
      code,
      extensionId: 'abcdefghijklmnopabcdefghijklmnop',
      profileId: '3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b',
    }),
  });
  const one = await run(['unpair', '3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b'], paths);
  assert.equal(one.code, 0, one.err);
  assert.match(one.out, /Removed pairing/);
});

test('cdp attaches the daemon to a CDP browser', async (t) => {
  const { paths } = await daemon(t);
  const cdp = await FakeCdp.start([{ id: 'p1', url: 'https://example.com/' }]);
  t.after(() => cdp.stop());
  const ok = await run(['cdp', '--port', String(cdp.port)], paths);
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, new RegExp(`CDP port ${cdp.port} \\(1 tab`));
  assert.match((await run(['status'], paths)).out, /connection: attached/);

  const closed = await createServer();
  await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
  const unusedPort = (closed.address() as { port: number }).port;
  await new Promise<void>((resolve) => closed.close(() => resolve()));
  const failed = await run(['cdp', '--port', String(unusedPort)], paths);
  assert.equal(failed.code, 1);
  assert.match(failed.err, /cdp connect failed/);
});

test('stop shuts the daemon down', async (t) => {
  const { paths, daemon: d } = await daemon(t);
  const result = await run(['stop'], paths);
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /stopped/);
  await d.closed;
  assert.equal(readLock(paths.lockFile), null);
});

test('serve in a running daemon reports already running', async (t) => {
  const { paths } = await daemon(t);
  const result = await run(['serve'], paths);
  assert.equal(result.code, 0);
  assert.match(result.out, /already running/);
});

test('serve reports a port clash and exits non-zero', async (t) => {
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => blocker.close(() => resolve())));
  const port = (blocker.address() as { port: number }).port;
  const paths = { ...ephemeralPaths(stateDir(t)), ports: { pair: port, mcp: 0, ws: 0, cdp: 0 } };
  const result = await run(['serve'], paths);
  assert.equal(result.code, 1);
  assert.match(result.err, /BROWSER_LISTENER_FAILED: port \d+ in use/);
});

test('extension install reports a failed download', async (t) => {
  const dir = stateDir(t);
  const out: string[] = [];
  const err: string[] = [];
  let downloads = 0;
  const base = {
    out: (l: string) => out.push(l),
    err: (l: string) => err.push(l),
    download: async () => {
      downloads += 1;
      throw new Error('offline');
    },
  };
  const paths = ephemeralPaths(dir);
  const code = await main(['extension', 'install', '--dir', dir], { ...base, paths });
  assert.equal(code, 1);
  assert.equal(downloads, 1);
  assert.match(err.join('\n'), /extension install failed: offline/);
});

function spawnCli(
  args: string[],
  env: NodeJS.ProcessEnv,
): { child: ChildProcess; out: () => string } {
  const child = spawn(process.execPath, [CLI, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let text = '';
  child.stdout?.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')));
  child.stderr?.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')));
  return { child, out: () => text };
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

test('the real binary prints its version', async () => {
  const { child, out } = spawnCli(['--version'], process.env);
  await new Promise((resolve) => child.once('exit', resolve));
  assert.equal(out().trim(), VERSION);
});

test('two serve processes racing leave exactly one daemon and one "already running"', async (t) => {
  const dir = stateDir(t);
  const env = {
    ...process.env,
    AEVRA_BROWSER_HOME: dir,
    AEVRA_BROWSER_PAIR_PORT: String(await freePort()),
    AEVRA_BROWSER_MCP_PORT: String(await freePort()),
    AEVRA_BROWSER_WS_PORT: String(await freePort()),
  };
  const first = spawnCli(['serve'], env);
  const second = spawnCli(['serve'], env);
  const exits = [first, second].map(
    ({ child }) => new Promise<number | null>((resolve) => child.once('exit', resolve)),
  );
  t.after(async () => {
    for (const { child } of [first, second]) child.kill();
    await Promise.all(exits);
  });

  // The loser exits on its own, with status 0.
  const loserIndex = await Promise.race(exits.map((exit, index) => exit.then(() => index)));
  const [loser, winner] = loserIndex === 0 ? [first, second] : [second, first];
  assert.equal(await exits[loserIndex], 0);
  assert.match(loser.out(), /already running/);

  // The winner is still serving, and owns the lock.
  assert.equal(winner.child.exitCode, null);
  const lock = readLock(path.join(dir, 'daemon.lock'));
  assert.equal(lock?.pid, winner.child.pid);
  assert.match(winner.out(), /listening/);

  const stop = await main(['stop'], {
    paths: { ...resolvePaths(env), ports: lock!.ports },
    out: () => undefined,
    err: () => undefined,
  });
  assert.equal(stop, 0);
  assert.equal(await exits[loserIndex === 0 ? 1 : 0], 0);
});
