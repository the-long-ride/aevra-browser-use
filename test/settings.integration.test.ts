import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { main } from '../src/cli.js';
import { manageBrowserAgent } from '../src/agent-command.js';
import { resolvePaths } from '../src/paths.js';
import { settingsActions } from '../src/ui/actions.js';
import { UiSessions } from '../src/ui/session.js';
import { serve } from '../src/daemon/serve.js';

test('configuration CLI and authenticated UI use the same persisted validation', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'aevra-settings-'));
  try {
    const paths = resolvePaths({ AEVRA_BROWSER_HOME: path.join(home, 'state') });
    const output: string[] = [],
      errors: string[] = [];
    const ctx = {
      paths,
      out: (value: string) => output.push(value),
      err: (value: string) => errors.push(value),
    };
    assert.equal(await main(['config', 'set', 'pairPort', '50101'], ctx), 0);
    assert.equal(await main(['config', 'get', 'pairPort', '--json'], ctx), 0);
    assert.match(output.at(-1)!, /50101/);
    assert.equal(await main(['config', 'reset', 'pairPort'], ctx), 0);
    assert.equal(await main(['config', 'get', '--json'], ctx), 0);
    assert.equal(await main(['config', 'set', 'pairPort', '0'], ctx), 1);
    for (const argv of [
      ['config'],
      ['config', 'invalid'],
      ['config', 'set', 'pairPort'],
      ['ui', 'extra'],
    ])
      assert.equal(await main(argv, ctx), 2);
    assert.equal(await main(['ui'], ctx), 1);
    const admin = {
      createPairingCode: () => ({ code: '12345678', expiresAt: 'soon' }),
      listPairings: () => [],
      revoke: async () => ({ removed: 1, epoch: 1 }),
      shutdown() {},
    };
    const actions = settingsActions(paths, admin, () => ({ connectionState: 'not_paired' }));
    assert.equal(((await actions.snapshot()) as any).config.effective.pairPort, 47841);
    assert.deepEqual(await actions.mutate({ action: 'pair' }), admin.createPairingCode());
    assert.equal(((await actions.mutate({ action: 'unpair', id: 'p' })) as any).removed, 1);
    await actions.mutate({ action: 'config', settings: { cdpPort: 9333 } });
    assert.equal(((await actions.snapshot()) as any).config.effective.cdpPort, 9333);
    await assert.rejects(actions.mutate({ action: 'config', settings: { cdpPort: -1 } }), /port/);
    await assert.rejects(actions.mutate({ action: 'bad' }), /Unsupported/);
    await assert.rejects(actions.mutate({ action: 'agent', operation: 'bad', target: 'bad' }));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Browser agent HTTP token survives a real daemon restart and cannot call management routes', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'aevra-managed-http-'));
  const paths = {
    ...resolvePaths({ AEVRA_BROWSER_HOME: path.join(home, 'state') }),
    ports: { pair: 0, mcp: 0, ws: 0, cdp: 0 },
  };
  let daemon = await serve(paths);
  try {
    assert.equal(daemon.status, 'started');
    if (daemon.status !== 'started') return;
    const activePaths = { ...paths, ports: daemon.info.ports };
    const install = await manageBrowserAgent(
      { operation: 'install', target: 'claude-code', transport: 'http', dryRun: false },
      activePaths,
      home,
      {},
    );
    const reg = install.registrations[0];
    const { readFileSync } = await import('node:fs');
    const credential = JSON.parse(readFileSync(reg.credentialFile, 'utf8'));
    const call = (route: string) =>
      fetch(`http://127.0.0.1:${activePaths.ports.mcp}${route}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${credential.token}`,
          'content-type': 'application/json',
          connection: 'close',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });
    assert.equal((await call('/mcp')).status, 200);
    assert.equal((await call('/shutdown')).status, 401);
    const port = daemon.info.ports.mcp;
    await daemon.stop();
    daemon = await serve({ ...paths, ports: { ...paths.ports, mcp: port } });
    assert.equal((await call('/mcp')).status, 200);
    await manageBrowserAgent(
      { operation: 'uninstall', target: 'claude-code', transport: 'http', dryRun: false },
      activePaths,
      home,
      {},
    );
    assert.equal((await call('/mcp')).status, 401);
  } finally {
    if (daemon.status === 'started') await daemon.stop();
    rmSync(home, { recursive: true, force: true });
  }
});

test('UI bootstrap and sessions expire and expire independently', () => {
  let now = 0;
  const sessions = new UiSessions(() => now);
  const expired = sessions.bootstrap();
  now = 60_001;
  assert.equal(sessions.exchange(expired), null);
  for (let i = 0; i < 35; i++) sessions.bootstrap();
  const session = sessions.exchange(sessions.bootstrap())!;
  assert.ok(sessions.authenticate(`aevra_browser_ui=${session.cookie}`));
  assert.equal(sessions.authenticate('other=thing'), null);
  now += 8 * 60 * 60_000;
  assert.equal(sessions.authenticate(`aevra_browser_ui=${session.cookie}`), null);
});
