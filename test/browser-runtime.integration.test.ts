import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { BrowserRuntime } from '../src/daemon/browser-runtime.js';
import { PairingStore } from '../src/daemon/pairing-store.js';
import { mintExtensionToken } from '../src/vendor.js';
import { FakeCdp } from '../vendor/aevra/packages/browser/test/fake-cdp.js';
import {
  connectFakeExtension,
  type FakeExtension,
} from '../vendor/aevra/packages/browser/test/fake-extension.js';

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const PROFILE_ID = '3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b';
const TABS = [
  {
    tabId: 't1',
    url: 'https://example.com/',
    title: 'Example',
    active: true,
    originClass: 'NORMAL',
  },
];

async function until(condition: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('condition not met in time');
}

async function setup(t: TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), 'aevra-browser-runtime-'));
  const store = new PairingStore({
    tokenKeyFile: path.join(dir, 'token.key'),
    pairingsFile: path.join(dir, 'pairings.json'),
  });
  const runtime = new BrowserRuntime({ store, wsPort: 0 });
  const peers: FakeExtension[] = [];
  t.after(async () => {
    for (const peer of peers) peer.destroy();
    await runtime.shutdown();
    rmSync(dir, { recursive: true, force: true });
  });
  const { wsUrl } = await runtime.start();

  async function pairAndConnect(credentialId = 'cred-1'): Promise<FakeExtension> {
    store.upsert({
      pairingId: PROFILE_ID,
      profileId: PROFILE_ID,
      profileName: 'Test profile',
      extensionId: EXTENSION_ID,
      credentialId,
      legacy: false,
    });
    const token = mintExtensionToken(store.key(), {
      extensionId: EXTENSION_ID,
      profileId: PROFILE_ID,
      credentialId,
      epoch: store.epoch(),
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const peer = await connectFakeExtension(wsUrl, EXTENSION_ID, { token, profileId: PROFILE_ID });
    peer.onCommand((command) => (command.op === 'tabs' ? TABS : undefined));
    peers.push(peer);
    await until(async () => (await runtime.status()).extensionSocketAuthenticated);
    return peer;
  }
  return { store, runtime, pairAndConnect };
}

test('a paired extension authenticates and answers tabs', async (t) => {
  const { runtime, pairAndConnect } = await setup(t);
  await pairAndConnect();
  const status = await runtime.status();
  assert.equal(status.extensionSocketAuthenticated, true);
  assert.equal(status.activeProfileName, 'Test profile');
  assert.equal(status.listener.state, 'listening');

  await runtime.connect({ transport: 'extension' });
  assert.deepEqual(await runtime.tabs({ action: 'list' }), TABS);
  assert.equal((await runtime.status()).connected, true);
});

test('connecting without an authenticated extension is BROWSER_UNAVAILABLE', async (t) => {
  const { runtime } = await setup(t);
  await assert.rejects(
    () => runtime.connect({ transport: 'extension' }),
    (error: { code?: string }) => error.code === 'BROWSER_UNAVAILABLE',
  );
});

test('page operations before connect are BROWSER_NOT_CONNECTED', async (t) => {
  const { runtime } = await setup(t);
  await assert.rejects(
    () => runtime.tabs({ action: 'list' }),
    (error: { code?: string }) => error.code === 'BROWSER_NOT_CONNECTED',
  );
});

test('revoking all pairings drops the peer and detaches the session', async (t) => {
  const { store, runtime, pairAndConnect } = await setup(t);
  const peer = await pairAndConnect();
  await runtime.connect({ transport: 'extension' });

  store.revokeAll();
  await runtime.onPairingsChanged();

  await assert.rejects(
    () => runtime.tabs({ action: 'list' }),
    (error: { code?: string }) => error.code === 'BROWSER_NOT_CONNECTED',
  );
  assert.equal(await peer.closedWithin(2000), true);
  assert.equal((await runtime.status()).extensionSocketAuthenticated, false);
});

test('the listener keeps its port after a revoke so the extension can pair again', async (t) => {
  const { store, runtime, pairAndConnect } = await setup(t);
  const port = runtime.wsPort();
  await pairAndConnect();
  store.revokeAll();
  await runtime.onPairingsChanged();
  assert.equal(runtime.wsPort(), port);
  assert.equal((await runtime.status()).listener.state, 'listening');
  await pairAndConnect('cred-2');
  assert.equal((await runtime.status()).extensionSocketAuthenticated, true);
});

test('re-pairing the same profile rejects the old credential', async (t) => {
  const { runtime, pairAndConnect } = await setup(t);
  const first = await pairAndConnect('cred-1');
  await runtime.connect({ transport: 'extension' });
  const second = await pairAndConnect('cred-2');
  await runtime.onPairingsChanged();
  assert.equal(await first.closedWithin(2000), true);
  await until(async () => (await runtime.status()).extensionSocketAuthenticated);
  assert.equal(await second.closedWithin(200), false);
});

test('a CDP connect lists the tabs of the fake browser', async (t) => {
  const { runtime } = await setup(t);
  const cdp = await FakeCdp.start([{ id: 'p1', url: 'https://example.com/' }]);
  t.after(() => cdp.stop());
  await runtime.connect({ transport: 'cdp', cdpPort: cdp.port });
  const tabs = await runtime.tabs({ action: 'list' });
  assert.equal(tabs.length, 1);
  assert.equal(tabs[0]?.url, 'https://example.com/');
});

test('the default CDP port is used when none is given', async (t) => {
  const cdp = await FakeCdp.start([{ id: 'p1', url: 'https://example.com/' }]);
  t.after(() => cdp.stop());
  const dir = mkdtempSync(path.join(tmpdir(), 'aevra-browser-runtime-'));
  const store = new PairingStore({
    tokenKeyFile: path.join(dir, 'token.key'),
    pairingsFile: path.join(dir, 'pairings.json'),
  });
  const runtime = new BrowserRuntime({ store, wsPort: 0, cdpPort: cdp.port });
  t.after(async () => {
    await runtime.shutdown();
    rmSync(dir, { recursive: true, force: true });
  });
  await runtime.connect({ transport: 'cdp' });
  assert.equal((await runtime.tabs({ action: 'list' })).length, 1);
});

test('the origin policy blocks this daemon own ports as well as aevra ports', () => {
  const runtime = new BrowserRuntime({
    store: new PairingStore({ tokenKeyFile: 'x', pairingsFile: 'y' }),
    wsPort: 0,
    localPorts: [47841, 0],
  });
  const ports = runtime.originPolicy().aevraPorts ?? [];
  assert.ok(ports.includes(47831));
  assert.ok(ports.includes(47841));
  assert.ok(!ports.includes(0));
});

test('a port already in use maps to BROWSER_LISTENER_FAILED naming EADDRINUSE', async (t) => {
  const { runtime } = await setup(t);
  const dir = mkdtempSync(path.join(tmpdir(), 'aevra-browser-runtime-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const clash = new BrowserRuntime({
    store: new PairingStore({
      tokenKeyFile: path.join(dir, 'token.key'),
      pairingsFile: path.join(dir, 'pairings.json'),
    }),
    wsPort: runtime.wsPort(),
  });
  await assert.rejects(
    () => clash.start(),
    /BROWSER_LISTENER_FAILED: port \d+ in use \(set AEVRA_BROWSER_WS_PORT\) \[EADDRINUSE\]/,
  );
  assert.equal((await clash.status()).listener.state, 'failed');
  assert.equal((await clash.status()).listener.errorCode, 'EADDRINUSE');
});
