import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { credentialTransport, manageBrowserAgent } from '../src/agent-command.js';
import { ClientCredentials } from '../src/daemon/client-credentials.js';
import { spawnDaemonProcess } from '../src/bridge/stdio-bridge.js';
import { resolvePaths } from '../src/paths.js';
import { readLock } from '../src/daemon/lock.js';

async function port(): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const server = createServer();
    const value = 42000 + Math.floor(Math.random() * 6000);
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(value, '127.0.0.1', resolve);
      });
      await new Promise<void>((resolve) => server.close(() => resolve()));
      return value;
    } catch {
      /* retry an occupied port */
    }
  }
  throw new Error('could not reserve a listener port');
}

test('credential bridge uses installed listener metadata when autostarting its daemon', async (t) => {
  const home = mkdtempSync(path.join(tmpdir(), 'aevra-browser-credential-ports-'));
  const stateDir = path.join(home, 'state');
  mkdirSync(stateDir);
  t.after(async () => {
    const info = readLock(path.join(stateDir, 'daemon.lock'));
    if (info)
      await fetch(`http://127.0.0.1:${info.ports.mcp}/shutdown`, {
        method: 'POST',
        headers: { authorization: `Bearer ${info.mcpToken}` },
      });
    for (let i = 0; i < 100 && existsSync(path.join(stateDir, 'daemon.lock')); i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    rmSync(home, { recursive: true, force: true });
  });
  const ports = { pair: await port(), mcp: await port(), ws: await port() };
  const credential = await new ClientCredentials(stateDir).create('codex');
  const storeFile = path.join(stateDir, 'client-credentials.json');
  const store = JSON.parse(readFileSync(storeFile, 'utf8'));
  store.clients[0].startupPorts = ports;
  writeFileSync(storeFile, JSON.stringify(store));
  const file = path.join(stateDir, 'agent-credentials', 'test.json');
  mkdirSync(path.dirname(file));
  writeFileSync(
    file,
    JSON.stringify({ version: 1, ...credential, endpoint: `http://127.0.0.1:${ports.mcp}/mcp` }),
  );
  const transport = await credentialTransport(file, {
    fetch,
    home,
    spawnDaemon: spawnDaemonProcess,
  });
  try {
    const frames: unknown[] = [];
    await transport.send(
      { jsonrpc: '2.0', id: 9, method: 'ping' },
      async (frame) => {
        frames.push(frame);
      },
      AbortSignal.timeout(5000),
    );
    assert.deepEqual(frames, [{ jsonrpc: '2.0', id: 9, result: {} }]);
    const info = readLock(path.join(stateDir, 'daemon.lock'));
    assert.deepEqual(
      [info?.ports.pair, info?.ports.mcp, info?.ports.ws],
      [ports.pair, ports.mcp, ports.ws],
    );
  } finally {
    await transport.close?.();
  }
});

test('installed stdio agents recover their explicit listeners without changing config.json', async (t) => {
  const home = mkdtempSync(path.join(tmpdir(), 'aevra-browser-agent-ports-'));
  const stateDir = path.join(home, 'state');
  t.after(async () => {
    const info = readLock(path.join(stateDir, 'daemon.lock'));
    if (info)
      await fetch(`http://127.0.0.1:${info.ports.mcp}/shutdown`, {
        method: 'POST',
        headers: { authorization: `Bearer ${info.mcpToken}` },
      });
    for (let i = 0; i < 100 && existsSync(path.join(stateDir, 'daemon.lock')); i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    rmSync(home, { recursive: true, force: true });
  });
  const ports = { pair: await port(), mcp: await port(), ws: await port() };
  const env = {
    ...process.env,
    AEVRA_BROWSER_HOME: stateDir,
    CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
    CODEX_HOME: path.join(home, '.codex'),
  };
  const paths = { ...resolvePaths(env), ports: { ...ports, cdp: 9222 }, startupPorts: ports };
  const installed = await manageBrowserAgent(
    {
      operation: 'install',
      target: 'claude-code',
      transport: 'stdio',
      dryRun: false,
    },
    paths,
    home,
    env,
  );
  assert.equal(installed.registrations.length, 1);
  const config = JSON.parse(readFileSync(path.join(home, '.claude', '.claude.json'), 'utf8'));
  const entry = config.mcpServers['aevra-browser'];
  const child = spawn(entry.command, entry.args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (b: Buffer) => {
    stdout += b.toString();
  });
  child.stderr.on('data', (b: Buffer) => {
    stderr += b.toString();
  });
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
  t.after(() => {
    child.kill();
  });
  child.stdin.end('{"jsonrpc":"2.0","id":7,"method":"ping"}\n');
  assert.equal(await exited, 0, stderr);
  assert.equal(JSON.parse(stdout).id, 7);
  const info = readLock(paths.lockFile);
  assert.deepEqual(
    [info?.ports.pair, info?.ports.mcp, info?.ports.ws],
    [ports.pair, ports.mcp, ports.ws],
  );
  assert.equal(existsSync(path.join(stateDir, 'config.json')), false);
  assert.equal(
    JSON.parse(readFileSync(installed.registrations[0]!.credentialFile, 'utf8')).endpoint,
    `http://127.0.0.1:${ports.mcp}/mcp`,
  );
});
