import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.js';
import { readLock, type LockInfo } from '../src/daemon/lock.js';
import { FakeCdp } from '../vendor/aevra/packages/browser/test/fake-cdp.js';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

async function freePort(): Promise<number> {
  // Stay below the Windows ephemeral range: outgoing health probes must not
  // consume a just-released port from a requested consecutive listener block.
  for (let attempt = 0; attempt < 50; attempt++) {
    const server = createServer();
    const port = 20000 + Math.floor(Math.random() * 20000);
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      });
      await new Promise<void>((resolve) => server.close(() => resolve()));
      return port;
    } catch {
      /* try another occupied port */
    }
  }
  throw new Error('could not reserve a listener port');
}

async function setup(t: TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), 'aevra-browser-ports-'));
  const ports = { pair: await freePort(), mcp: await freePort(), ws: await freePort() };
  assert.equal(new Set(Object.values(ports)).size, 3);
  const env = { ...process.env, AEVRA_BROWSER_HOME: dir };
  t.after(async () => {
    const lock = readLock(path.join(dir, 'daemon.lock'));
    if (lock) {
      await fetch(`http://127.0.0.1:${lock.ports.mcp}/shutdown`, {
        method: 'POST',
        headers: { authorization: `Bearer ${lock.mcpToken}` },
        signal: AbortSignal.timeout(1000),
      }).catch(() => {
        try {
          process.kill(lock.pid);
        } catch {
          /* already exited */
        }
      });
      for (let i = 0; i < 100 && existsSync(path.join(dir, 'daemon.lock')); i++)
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    dir,
    env,
    ports,
    flags: [`--up=${ports.pair}`, '--mp', String(ports.mcp), `--wp=${ports.ws}`],
  };
}

async function invoke(args: string[], env: NodeJS.ProcessEnv) {
  const out: string[] = [],
    err: string[] = [];
  const code = await main(
    args,
    { out: (s) => void out.push(s), err: (s) => void err.push(s), openUrl: () => undefined },
    env,
  );
  return { code, out: out.join('\n'), err: err.join('\n') };
}

async function ready(dir: string, failed?: () => string | undefined): Promise<LockInfo> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const failure = failed?.();
    if (failure) throw new Error(failure);
    const info = readLock(path.join(dir, 'daemon.lock'));
    if (
      info &&
      (await fetch(`http://127.0.0.1:${info.ports.mcp}/healthz`, {
        signal: AbortSignal.timeout(1000),
      })
        .then((r) => r.ok)
        .catch(() => false))
    )
      return info;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `daemon did not become ready within 15 seconds; state files: ${readdirSync(dir).join(', ')}`,
  );
}

test('pair autostarts a real detached daemon on explicit listeners and leaves saved settings intact', async (t) => {
  const { dir, env, ports, flags } = await setup(t);
  const saved = JSON.stringify({
    version: 1,
    settings: { pairPort: 51040, mcpPort: 51041, wsPort: 51042 },
  });
  writeFileSync(path.join(dir, 'config.json'), saved);
  const result = await invoke(['pair', ...flags], { ...env, AEVRA_BROWSER_PAIR_PORT: '0' });
  assert.equal(result.code, 0, result.err);
  const lock = await ready(dir);
  assert.deepEqual({ pair: lock.ports.pair, mcp: lock.ports.mcp, ws: lock.ports.ws }, ports);
  assert.match(result.out, new RegExp(`port ${ports.pair}\\.`));
  assert.equal(readFileSync(path.join(dir, 'config.json'), 'utf8'), saved);
  const status = await invoke(['status', '--json'], env);
  assert.equal(JSON.parse(status.out).ports.mcp, ports.mcp);
  let url = '';
  const ui = await main(
    ['ui'],
    {
      openUrl: (u) => {
        url = u;
      },
      out: () => undefined,
    },
    env,
  );
  assert.equal(ui, 0);
  assert.match(url, new RegExp(`^http://127.0.0.1:${ports.pair}/#`));
});

test('an explicit mismatch refuses both foreground serve and autostart reuse', async (t) => {
  const { env, ports, flags } = await setup(t);
  assert.equal((await invoke(['pair', ...flags], env)).code, 0);
  const other = ports.mcp === 65535 ? 65534 : ports.mcp + 1;
  for (const command of ['serve', 'pair', 'ui', 'mcp', 'cdp']) {
    const result = await invoke([command, `--mp=${other}`], env);
    assert.equal(result.code, 1, result.err);
    assert.match(result.err, /BROWSER_PORT_MISMATCH.*stop/);
  }
  assert.equal((await invoke(['pair', ...flags], env)).code, 0);
});

test('plain mcp listener options reach the real detached child', async (t) => {
  const { dir, env, ports, flags } = await setup(t);
  const stdin = new PassThrough(),
    stdout = new PassThrough();
  let text = '';
  stdout.on('data', (data: Buffer) => {
    text += data.toString();
  });
  const errors: string[] = [];
  let exitCode: number | undefined;
  const running = main(
    ['mcp', ...flags],
    {
      io: { stdin, stdout, stderr: new PassThrough() },
      err: (line) => void errors.push(line),
      waitMs: 15000,
    },
    env,
  );
  void running.then((code) => {
    exitCode = code;
  });
  const lock = await ready(dir, () =>
    exitCode === undefined
      ? undefined
      : `mcp exited ${exitCode} before readiness: ${errors.join('; ')}`,
  );
  assert.equal(lock.ports.mcp, ports.mcp);
  stdin.end('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
  assert.equal(await running, 0);
  assert.equal(JSON.parse(text).id, 1);
});

test('CDP autostart preserves its target --port alongside daemon listener overrides', async (t) => {
  const { dir, env, ports, flags } = await setup(t);
  const cdp = await FakeCdp.start([{ id: 'p1', url: 'https://example.com/' }]);
  t.after(() => cdp.stop());
  const result = await invoke(['cdp', '--port', String(cdp.port), ...flags], env);
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, new RegExp(`CDP port ${cdp.port}`));
  assert.equal((await ready(dir)).ports.ws, ports.ws);
});

test('foreground basePort binds the literal consecutive listener block', async (t) => {
  const { dir, env } = await setup(t);
  let base = 0;
  for (let attempt = 0; attempt < 50 && !base; attempt++) {
    const candidate = await freePort();
    if (candidate > 65533) continue;
    const probes = [createServer(), createServer(), createServer()];
    try {
      for (const [offset, probe] of probes.entries()) {
        await new Promise<void>((resolve, reject) => {
          probe.once('error', reject);
          probe.listen(candidate + offset, '127.0.0.1', resolve);
        });
      }
      base = candidate;
    } catch {
      /* retry an occupied adjacent port */
    } finally {
      await Promise.all(probes.map((p) => new Promise<void>((r) => p.close(() => r()))));
    }
  }
  assert.ok(base);
  const child = spawn(process.execPath, [CLI, 'serve', `--basePort=${base}`], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  child.stdout.on('data', (data: Buffer) => {
    diagnostics += data.toString();
  });
  child.stderr.on('data', (data: Buffer) => {
    diagnostics += data.toString();
  });
  t.after(() => {
    child.kill();
  });
  const info = await ready(dir, () =>
    child.exitCode === null ? undefined : `serve exited ${child.exitCode}: ${diagnostics}`,
  );
  assert.deepEqual([info.ports.pair, info.ports.mcp, info.ports.ws], [base, base + 1, base + 2]);
});

test('listener collisions with unchanged defaults are rejected before spawning', async (t) => {
  const { env, dir } = await setup(t);
  const result = await invoke(['pair', '--up=47842'], {
    ...env,
    AEVRA_BROWSER_MCP_PORT: '47842',
    AEVRA_BROWSER_WS_PORT: '47843',
  });
  assert.equal(result.code, 2);
  assert.match(result.err, /distinct/);
  assert.equal(existsSync(path.join(dir, 'daemon.lock')), false);
});
