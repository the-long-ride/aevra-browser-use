import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Paths } from '../paths.js';
import { callBrowserTool } from '../mcp/handlers.js';
import { handleJsonRpc } from '../mcp/jsonrpc.js';
import { BROWSER_TOOLS } from '../mcp/tools.js';
import { BrowserRuntime } from './browser-runtime.js';
import { acquireLock, releaseLock, updateLock, type LockInfo } from './lock.js';
import { createMcpHttpServer, type AdminHooks } from './mcp-http.js';
import { PairingCodes } from './pairing-codes.js';
import { createPairingServer } from './pairing-server.js';
import { PairingStore } from './pairing-store.js';
import { UiSessions } from '../ui/session.js';
import { handleUiRequest } from '../ui/server.js';
import { settingsActions } from '../ui/actions.js';
import { ClientCredentials } from './client-credentials.js';
import os from 'node:os';
import { tryMarkStateDirectory } from '../../shared/aevra/packages/agent-integration/src/cleanup.js';

export type ServeResult =
  | { status: 'running' }
  | {
      status: 'started';
      info: LockInfo;
      /** Stops every listener and removes the lock. Safe to call twice. */
      stop(): Promise<void>;
      /** Resolves once `stop()` has finished, whoever triggered it. */
      closed: Promise<void>;
    };

export interface ServeOptions {
  /** Stop on SIGINT / SIGTERM. The CLI turns this on; tests leave it off. */
  handleSignals?: boolean;
}

async function listen(server: Server, port: number, envName: string): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  }).catch((error: { code?: string }) => {
    const reason =
      error.code === 'EADDRINUSE'
        ? `port ${port} in use (set ${envName})`
        : `cannot listen on port ${port} (set ${envName}) [${error.code ?? 'unknown'}]`;
    throw new Error(`BROWSER_LISTENER_FAILED: ${reason}`);
  });
  return (server.address() as AddressInfo).port;
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

function adminHooks(
  store: PairingStore,
  codes: PairingCodes,
  runtime: BrowserRuntime,
  shutdown: () => void,
): AdminHooks {
  return {
    createPairingCode: () => codes.create(),
    listPairings: () =>
      store.pairings().map((p) => ({
        pairingId: p.pairingId,
        profileName: p.profileName,
        extensionId: p.extensionId,
        pairedAt: p.pairedAt,
      })),
    revoke: async (id) => {
      let removed: number;
      if (id === undefined) {
        removed = store.pairings().length;
        store.revokeAll();
      } else {
        removed = store.remove(id) ? 1 : 0;
      }
      await runtime.onPairingsChanged();
      return { removed, epoch: store.epoch() };
    },
    shutdown,
  };
}

/**
 * Runs the browser daemon: the pairing endpoint, the extension WebSocket
 * server and the MCP HTTP endpoint, behind one lock file. Resolves
 * `{ status: 'running' }` without starting anything when another daemon already
 * holds the lock.
 */
export async function serve(paths: Paths, options: ServeOptions = {}): Promise<ServeResult> {
  mkdirSync(paths.stateDir, { recursive: true });
  // A marker problem is reported, not fatal: it only limits what uninstall --purge removes.
  const problem = tryMarkStateDirectory(
    paths.stateDir,
    'aevra-browser',
    os.homedir(),
    paths.isDefaultStateDir ?? false,
  );
  if (problem) console.warn(`aevra-browser: ${problem}`);
  const mcpToken = randomBytes(32).toString('base64url');
  const info: LockInfo = {
    pid: process.pid,
    ports: paths.ports,
    mcpToken,
    startedAt: new Date().toISOString(),
  };
  if ((await acquireLock(paths.lockFile, info)) === 'running') return { status: 'running' };

  const store = new PairingStore(paths);
  const clients = new ClientCredentials(paths.stateDir);
  const codes = new PairingCodes();
  const uiSessions = new UiSessions();
  const localPorts: number[] = [];
  const runtime = new BrowserRuntime({
    store,
    wsPort: paths.ports.ws,
    cdpPort: paths.ports.cdp,
    pairPort: paths.ports.pair,
    localPorts,
  });
  const servers: Server[] = [];
  let stopping: Promise<void> | null = null;
  let markClosed!: () => void;
  const closed = new Promise<void>((resolve) => (markClosed = resolve));

  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      await Promise.all(servers.map(close));
      await runtime.shutdown();
      releaseLock(paths.lockFile, process.pid);
      markClosed();
    })();
    return stopping;
  };

  try {
    const { port: wsPort } = await runtime.start();
    localPorts.push(wsPort);

    const admin = adminHooks(store, codes, runtime, () => void stop());
    admin.uiBootstrap = () => uiSessions.bootstrap();
    const actions = settingsActions(paths, admin, () => runtime.status());
    const pairing = createPairingServer({
      handleUi: (req, res) => handleUiRequest(req, res, uiSessions, actions),
      codes,
      store,
      wsPort,
      onPairingsChanged: () => runtime.onPairingsChanged(),
    });
    servers.push(pairing);
    const pairPort = await listen(pairing, paths.ports.pair, 'AEVRA_BROWSER_PAIR_PORT');
    localPorts.push(pairPort);

    const mcp = createMcpHttpServer({
      verifyClient: (token) => clients.verify(token),
      token: mcpToken,
      handle: (message) =>
        handleJsonRpc(message, {
          list: () => BROWSER_TOOLS,
          call: (name, args) => callBrowserTool(runtime, name, args),
        }),
      admin,
    });
    servers.push(mcp);
    const mcpPort = await listen(mcp, paths.ports.mcp, 'AEVRA_BROWSER_MCP_PORT');
    localPorts.push(mcpPort);

    // Publish the real ports last: a client that reads the lock can connect.
    info.ports = { ...paths.ports, pair: pairPort, mcp: mcpPort, ws: wsPort };
    updateLock(paths.lockFile, info);
  } catch (error) {
    await stop();
    throw error;
  }

  if (options.handleSignals) {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void stop());
  }
  return { status: 'started', info, stop, closed };
}
