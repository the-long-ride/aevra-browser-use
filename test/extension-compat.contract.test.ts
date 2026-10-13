import assert from 'node:assert/strict';
import test from 'node:test';
import { ExtensionDriver } from '../vendor/aevra/packages/browser/src/extension-driver.js';
import type { ExtensionServer } from '../vendor/aevra/packages/browser/src/extension-server.js';
import {
  RefRegistry,
  type SnapshotElementLike,
} from '../shared/aevra/packages/browser/src/dom-snapshot.js';
import {
  handleExtensionCommand,
  type ExtensionBridge,
  type ExtensionCommand,
} from '../shared/aevra/packages/browser/src/extension-bridge.js';

// The daemon still runs the vendor v1.2.1 driver while the shipped extension is the
// shared 1.3.0 snapshot. This drives the old driver into the new command handler.

const URL = 'https://example.test/page';

function page(): SnapshotElementLike {
  return {
    documentId: 'doc-1',
    tagName: 'body',
    attributes: {},
    textContent: 'Hello page Go',
    children: [
      { tagName: 'h1', attributes: {}, children: [], textContent: 'Hello page' },
      {
        elementId: 'e1',
        tagName: 'button',
        attributes: { id: 'go' },
        children: [],
        textContent: 'Go',
        box: { x: 1, y: 1, width: 10, height: 10 },
      },
    ],
  };
}

function fakeBridge(applied: string[], fail = false): ExtensionBridge {
  const tabs = [
    { tabId: '1', url: URL, title: 'Page', active: true, originClass: 'NORMAL' as const },
  ];
  return {
    listTabs: async () => tabs,
    focus: async () => undefined,
    serialize: async () => page(),
    apply: async (action, elementId) => {
      applied.push(`${action.op}:${elementId}`);
      return fail ? { ok: false, error: 'element is covered' } : { ok: true };
    },
    captureVisible: async () => {
      throw new Error('vision is not used here');
    },
    navigate: async (url) => ({ tabId: '1', url, title: 'Page' }) as never,
    logs: async () => [],
  };
}

function driverOverHandler(applied: string[], fail = false): ExtensionDriver {
  const registry = new RefRegistry();
  const bridge = fakeBridge(applied, fail);
  const server = {
    peer: () => ({}),
    peerId: () => 'peer-1',
    call: (op: string, params: Record<string, unknown>) =>
      // Through JSON, as over the extension socket.
      handleExtensionCommand(
        registry,
        bridge,
        JSON.parse(JSON.stringify({ op, params })) as ExtensionCommand,
      ).then((value) => JSON.parse(JSON.stringify(value ?? null))),
  } as unknown as ExtensionServer;
  return new ExtensionDriver(server);
}

test('the vendor driver runs the main operations against the shipped extension handler', async () => {
  const applied: string[] = [];
  const driver = driverOverHandler(applied);
  const session = await driver.connect({ transport: 'extension' } as never);
  assert.equal(session.tabs[0]?.url, URL);
  assert.equal((await driver.navigate({ url: URL } as never)).url, URL);
  const snapshot = await driver.snapshot({ mode: 'dom' } as never);
  const button = (snapshot as unknown as { nodes: { ref: string; name: string }[] }).nodes.find(
    (node) => node.name === 'Go',
  );
  assert.ok(button?.ref, 'snapshot carries element refs');
  const [result] = await driver.act([{ op: 'click', ref: button.ref }] as never, {} as never);
  assert.equal(result?.ok, true);
  assert.deepEqual(applied, ['click:e1']);
  const read = await driver.read({ selector: '#go' } as never);
  assert.equal(read.content.trim(), 'Go');
  assert.deepEqual(await driver.logs({ logKind: 'console' } as never), []);
  assert.equal((await driver.tabs({ action: 'list' } as never)).length, 1);
});

async function goButton(driver: ExtensionDriver): Promise<string> {
  await driver.connect({ transport: 'extension' } as never);
  const snapshot = await driver.snapshot({ mode: 'dom' } as never);
  const nodes = (snapshot as unknown as { nodes: { ref: string; name: string }[] }).nodes;
  const ref = nodes.find((node) => node.name === 'Go')?.ref;
  assert.ok(ref);
  return ref;
}

test('a failing action reaches the vendor driver as ok: false', async () => {
  const applied: string[] = [];
  const driver = driverOverHandler(applied, true);
  const ref = await goButton(driver);
  const [result] = await driver.act([{ op: 'click', ref }] as never, {} as never);
  assert.equal(result?.ok, false);
  assert.deepEqual(applied, ['click:e1']);
});

test('a ref the shipped handler never issued is refused, not applied', async () => {
  const applied: string[] = [];
  const driver = driverOverHandler(applied);
  await goButton(driver);
  const outcome = await driver
    .act([{ op: 'click', ref: 'ref-unknown' }] as never, {} as never)
    .then(([result]) => result as unknown as { ok: boolean; error?: unknown })
    .catch((error: Error) => ({ ok: false, error: error.message }));
  assert.equal(outcome.ok, false);
  assert.match(JSON.stringify(outcome.error), /REF/);
  assert.deepEqual(applied, []);
});
