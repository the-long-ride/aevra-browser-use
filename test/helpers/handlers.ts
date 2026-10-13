import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { BrowserRuntime } from '../../src/daemon/browser-runtime.js';
import { PairingStore } from '../../src/daemon/pairing-store.js';
import {
  callBrowserTool,
  type BrowserRuntimeApi,
  type ToolResult,
} from '../../src/mcp/handlers.js';
import { FakeDriver } from '../../vendor/aevra/packages/browser/test/fake-driver.js';

export function textOf(result: ToolResult): string {
  const first = result.content[0];
  assert.equal(first?.type, 'text');
  return (first as { text: string }).text;
}

export function jsonOf(result: ToolResult): any {
  return JSON.parse(textOf(result));
}

export function errorCode(result: ToolResult): string {
  assert.equal(result.isError, true, textOf(result));
  return jsonOf(result).error.code;
}

export async function realRuntime(t: TestContext, localPorts: number[] = []) {
  const dir = mkdtempSync(path.join(tmpdir(), 'aevra-browser-handlers-'));
  const store = new PairingStore({
    tokenKeyFile: path.join(dir, 'token.key'),
    pairingsFile: path.join(dir, 'pairings.json'),
  });
  const driver = new FakeDriver('cdp');
  const runtime = new BrowserRuntime({
    store,
    wsPort: 0,
    localPorts,
    createDriver: async () => driver,
  });
  t.after(async () => {
    await runtime.shutdown();
    rmSync(dir, { recursive: true, force: true });
  });
  await callBrowserTool(runtime, 'browser_connect', { transport: 'cdp' });
  const visit = (url: string) => driver.navigate({ url, waitUntil: 'load', tabId: 'tab-1' });
  return { runtime, driver, visit };
}

export const NORMAL_TAB = {
  tabId: 'tab-1',
  url: 'https://example.com/',
  title: 'Example',
  active: true,
  originClass: 'NORMAL' as const,
};

/** A runtime whose every call is scripted, for states a fake driver cannot reach. */
export function stubRuntime(overrides: Record<string, unknown> = {}): BrowserRuntimeApi {
  const base = {
    connect: async () => ({
      sessionId: 's',
      transport: 'cdp',
      connected: true,
      tabs: [NORMAL_TAB],
    }),
    disconnect: async () => undefined,
    status: async () => ({
      connected: false,
      transport: null,
      attachmentId: null,
      epoch: 1,
      extensionPaired: false,
      tabs: [],
      listener: { state: 'listening', port: 1, errorCode: null, changedAt: '' },
      activeProfileName: null,
      extensionSocketAuthenticated: false,
    }),
    tabs: async () => [NORMAL_TAB],
    navigate: async () => ({
      tabId: 'tab-1',
      url: 'https://example.com/',
      status: 200,
      redirected: false,
    }),
    snapshot: async () => ({}),
    read: async () => ({ tabId: 'tab-1', url: 'https://example.com/', content: 'plain text' }),
    act: async () => [],
    logs: async () => [],
    originPolicy: () => ({}),
    pairPort: () => 47841,
    pairedCount: () => 0,
  };
  return { ...base, ...overrides } as unknown as BrowserRuntimeApi;
}
