import {
  ensureDaemon,
  liveLock,
  runBridge,
  type BridgeDeps,
  type BridgeIo,
} from './bridge/stdio-bridge.js';
import type { Command } from './cli-args.js';
import { USAGE } from './cli-args.js';
import type { LockInfo } from './daemon/lock.js';
import { serve } from './daemon/serve.js';
import { installExtension } from './extension/install.js';
import type { Paths } from './paths.js';
import { VERSION } from './version.js';
import { runConfig, runUi } from './config-cli.js';
import os from 'node:os';
import {
  claimExtension,
  claimExtensionLocked,
  extensionClaimConflict,
  extensionModified,
  sharedExtensionDirectory,
} from '../shared/aevra/packages/agent-integration/src/shared-extension.js';
import { withIntegrationLock } from '../shared/aevra/packages/agent-integration/src/lock.js';

export interface CliContext {
  openUrl?(url: string): void;
  paths: Paths;
  out(line: string): void;
  err(line: string): void;
  fetch: typeof fetch;
  spawnDaemon(): void;
  download(url: string): Promise<Buffer>;
  /** Streams for the stdio bridge. */
  io: BridgeIo;
  /** How long to wait for a daemon this command starts. */
  waitMs?: number;
}

const NOT_RUNNING = 'aevra-browser is not running. Start it with `aevra-browser serve`.';

function bridgeDeps(ctx: CliContext): BridgeDeps {
  return {
    paths: ctx.paths,
    spawnDaemon: ctx.spawnDaemon,
    fetch: ctx.fetch,
    ...(ctx.waitMs === undefined ? {} : { waitMs: ctx.waitMs }),
  };
}

async function findDaemon(ctx: CliContext, autoStart: boolean): Promise<LockInfo | null> {
  const deps = bridgeDeps(ctx);
  return autoStart ? ensureDaemon(deps) : liveLock(deps);
}

async function post(ctx: CliContext, info: LockInfo, route: string, body: unknown = {}) {
  const response = await ctx.fetch(`http://127.0.0.1:${info.ports.mcp}${route}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${info.mcpToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json().catch(() => null)) as any };
}

async function callTool(ctx: CliContext, info: LockInfo, name: string, args: unknown) {
  const reply = await post(ctx, info, '/mcp', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  const result = reply.json?.result;
  const text = result?.content?.[0]?.text;
  return { isError: Boolean(result?.isError) || !text, body: text ? JSON.parse(text) : null };
}

async function runServe(ctx: CliContext): Promise<number> {
  try {
    const result = await serve(ctx.paths, { handleSignals: true });
    if (result.status === 'running') {
      ctx.out('aevra-browser is already running');
      return 0;
    }
    const { ports } = result.info;
    ctx.out(
      `aevra-browser ${VERSION} listening: pairing ${ports.pair}, MCP ${ports.mcp}, extension ${ports.ws}`,
    );
    await result.closed;
    return 0;
  } catch (error) {
    ctx.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function runPair(ctx: CliContext): Promise<number> {
  const info = await findDaemon(ctx, true);
  if (!info) {
    ctx.err('BROWSER_DAEMON_UNAVAILABLE: could not start the aevra-browser daemon');
    return 1;
  }
  const { json } = await post(ctx, info, '/pairing-code');
  ctx.out(`Pairing code: ${json.code}  (valid for 5 minutes, single use)`);
  ctx.out(`In the Aevra extension popup, enter this code and port ${info.ports.pair}.`);
  return 0;
}

async function runUnpair(ctx: CliContext, command: Extract<Command, { command: 'unpair' }>) {
  const info = await findDaemon(ctx, false);
  if (!info) {
    ctx.err(NOT_RUNNING);
    return 1;
  }
  const { status, json } = await post(ctx, info, '/pairings/revoke', {
    ...(command.id === undefined ? {} : { id: command.id }),
  });
  if (status === 404) {
    ctx.err(`No pairing with id ${command.id}. List ids with \`aevra-browser status\`.`);
    return 1;
  }
  if (status !== 200) {
    ctx.err(`unpair failed: ${json?.error?.code ?? status}`);
    return 1;
  }
  ctx.out(
    command.all
      ? `Removed ${json.removed} pairing(s) and invalidated every token (epoch ${json.epoch}).`
      : `Removed pairing ${command.id}.`,
  );
  return 0;
}

async function runStatus(ctx: CliContext, command: Extract<Command, { command: 'status' }>) {
  const info = await findDaemon(ctx, false);
  if (!info) {
    ctx.out(command.json ? JSON.stringify({ running: false }) : 'aevra-browser is not running.');
    return 0;
  }
  const { body: status } = await callTool(ctx, info, 'browser_status', {});
  const list = await ctx.fetch(`http://127.0.0.1:${info.ports.mcp}/pairings`, {
    headers: { authorization: `Bearer ${info.mcpToken}` },
  });
  const pairings = ((await list.json().catch(() => null)) as any)?.pairings ?? [];
  if (command.json) {
    ctx.out(
      JSON.stringify({
        running: true,
        pid: info.pid,
        startedAt: info.startedAt,
        ports: info.ports,
        status,
        pairings,
        ...(command.showToken ? { mcpToken: info.mcpToken } : {}),
      }),
    );
    return 0;
  }
  const { ports } = info;
  ctx.out(`aevra-browser ${VERSION}: running (pid ${info.pid}, since ${info.startedAt})`);
  ctx.out(`ports: pairing ${ports.pair}, MCP ${ports.mcp}, extension ${ports.ws}`);
  ctx.out(`connection: ${status?.connectionState ?? 'unknown'}`);
  if (status?.nextAction) ctx.out(`next: ${status.nextAction}`);
  ctx.out(pairings.length ? 'paired profiles:' : 'paired profiles: none');
  for (const pairing of pairings) {
    ctx.out(`  ${pairing.pairingId}  ${pairing.profileName}`);
  }
  if (command.showToken) ctx.out(`MCP token: ${info.mcpToken}`);
  return 0;
}

async function runStop(ctx: CliContext): Promise<number> {
  const info = await findDaemon(ctx, false);
  if (!info) {
    ctx.out('aevra-browser is not running.');
    return 0;
  }
  const { status } = await post(ctx, info, '/shutdown');
  ctx.out(status === 200 ? 'aevra-browser stopped.' : `stop failed: HTTP ${status}`);
  return status === 200 ? 0 : 1;
}

async function runCdp(ctx: CliContext, command: Extract<Command, { command: 'cdp' }>) {
  const info = await findDaemon(ctx, true);
  if (!info) {
    ctx.err('BROWSER_DAEMON_UNAVAILABLE: could not start the aevra-browser daemon');
    return 1;
  }
  const cdpPort = command.port ?? ctx.paths.ports.cdp;
  const { isError, body } = await callTool(ctx, info, 'browser_connect', {
    transport: 'cdp',
    cdpPort,
  });
  if (isError) {
    ctx.err(`cdp connect failed: ${body?.error?.code ?? 'unknown'}: ${body?.error?.message ?? ''}`);
    return 1;
  }
  ctx.out(`Attached to the browser on CDP port ${cdpPort} (${body.tabs?.length ?? 0} tab(s)).`);
  return 0;
}

export async function runCommand(command: Command, ctx: CliContext): Promise<number> {
  switch (command.command) {
    case 'config':
      return runConfig(command, ctx);
    case 'ui':
      return runUi(ctx);
    case 'help':
      ctx.out(USAGE);
      return 0;
    case 'version':
      ctx.out(VERSION);
      return 0;
    case 'serve':
      return runServe(ctx);
    case 'mcp':
      return runBridge(ctx.io, bridgeDeps(ctx));
    case 'pair':
      return runPair(ctx);
    case 'unpair':
      return runUnpair(ctx, command);
    case 'status':
      return runStatus(ctx, command);
    case 'stop':
      return runStop(ctx);
    case 'cdp':
      return runCdp(ctx, command);
    case 'extension-install':
      return installExtension({
        version: VERSION,
        ...(command.dir === undefined ? {} : { dir: command.dir }),
        yes: command.yes,
        download: ctx.download,
        defaultDir: defaultExtensionParent(ctx.paths, os.homedir()),
        checkParent: (parent) => extensionClaimConflict(os.homedir(), parent),
        modified: (parent) => extensionModified(os.homedir(), parent),
        // The copy runs under the integration lock, so root Aevra cannot purge it mid-copy.
        transaction: (run) => withIntegrationLock(os.homedir(), run),
        onInstalled: (parent) => claimExtensionLocked(os.homedir(), 'aevra-browser', parent),
        onKept: (parent) =>
          claimExtension(os.homedir(), 'aevra-browser', parent, { rebaseline: false }),
        log: ctx.out,
        error: ctx.err,
      });
  }
}

/** A saved or environment extensionDir is where the extension goes; otherwise the shared folder. */
export function defaultExtensionParent(paths: Paths, home: string): string {
  return paths.extensionDirExplicit
    ? paths.extensionDir
    : sharedExtensionDirectory(home, [paths.extensionDir]);
}
