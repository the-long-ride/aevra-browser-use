import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Readable, Writable } from 'node:stream';
import { isAlive, readLock, type LockInfo } from '../daemon/lock.js';
import type { Paths } from '../paths.js';

export const MAX_LINE_BYTES = 8 * 1024 * 1024;
const POLL_MS = 100;
const HEALTH_TIMEOUT_MS = 1_000;

export interface BridgeIo {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
}

export interface BridgeDeps {
  paths: Paths;
  spawnDaemon(): void;
  fetch: typeof fetch;
  /** How long to wait for a freshly spawned daemon. Defaults to 5 s. */
  waitMs?: number;
}

type Id = string | number | null;

function rpcError(id: Id, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

/** Starts `aevra-browser serve` detached, so it outlives this bridge and its client. */
export function spawnDaemonProcess(env: NodeJS.ProcessEnv = process.env): void {
  const cli = fileURLToPath(new URL('../cli.js', import.meta.url));
  const child = spawn(process.execPath, [cli, 'serve'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env,
  });
  child.on('error', () => undefined);
  child.unref();
}

async function healthy(deps: BridgeDeps, info: LockInfo): Promise<boolean> {
  if (!isAlive(info.pid)) return false;
  try {
    const response = await deps.fetch(`http://127.0.0.1:${info.ports.mcp}/healthz`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function liveLock(deps: BridgeDeps): Promise<LockInfo | null> {
  const info = readLock(deps.paths.lockFile);
  return info && (await healthy(deps, info)) ? info : null;
}

/**
 * Returns a live daemon's lock, spawning the daemon when there is none. A lock
 * left by a crashed daemon (dead pid, or no answer on `/healthz`) counts as no
 * daemon: `serve` replaces it.
 */
export async function ensureDaemon(deps: BridgeDeps): Promise<LockInfo | null> {
  const existing = await liveLock(deps);
  if (existing) return existing;
  deps.spawnDaemon();
  const deadline = Date.now() + (deps.waitMs ?? 5_000);
  while (Date.now() < deadline) {
    const info = await liveLock(deps);
    if (info) return info;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return null;
}

/** Splits a byte stream into lines, dropping (and reporting) any over the cap. */
class LineSplitter {
  private chunks: Buffer[] = [];
  private size = 0;
  private overflow = false;

  constructor(
    private readonly onLine: (line: string) => void,
    private readonly onOversized: () => void,
  ) {}

  push(chunk: Buffer): void {
    let start = 0;
    for (;;) {
      const newline = chunk.indexOf(0x0a, start);
      if (newline === -1) {
        this.append(chunk.subarray(start));
        return;
      }
      this.append(chunk.subarray(start, newline));
      this.flush();
      start = newline + 1;
    }
  }

  end(): void {
    this.flush();
  }

  private append(part: Buffer): void {
    if (this.overflow || part.length === 0) return;
    this.size += part.length;
    if (this.size > MAX_LINE_BYTES) {
      this.overflow = true;
      this.chunks = [];
      return;
    }
    this.chunks.push(part);
  }

  private flush(): void {
    if (this.overflow) this.onOversized();
    else if (this.size > 0) this.onLine(Buffer.concat(this.chunks).toString('utf8'));
    this.chunks = [];
    this.size = 0;
    this.overflow = false;
  }
}

function idOf(message: unknown): Id | undefined {
  if (message === null || typeof message !== 'object' || !('id' in message)) return undefined;
  return (message as { id: Id }).id;
}

/**
 * Forwards MCP JSON-RPC lines from stdin to the shared daemon and writes its
 * replies to stdout. The daemon is started on demand and keeps running when
 * this bridge exits.
 */
export async function runBridge(io: BridgeIo, deps: BridgeDeps): Promise<number> {
  let daemon = await ensureDaemon(deps);
  if (!daemon) {
    io.stderr.write('BROWSER_DAEMON_UNAVAILABLE: could not start the aevra-browser daemon\n');
    return 1;
  }

  let recovering: Promise<LockInfo | null> | null = null;
  const recover = (): Promise<LockInfo | null> => {
    recovering ??= ensureDaemon(deps).finally(() => {
      recovering = null;
    });
    return recovering;
  };

  const send = async (info: LockInfo, line: string): Promise<Response | null> => {
    try {
      return await deps.fetch(`http://127.0.0.1:${info.ports.mcp}/mcp`, {
        method: 'POST',
        headers: { authorization: `Bearer ${info.mcpToken}`, 'content-type': 'application/json' },
        body: line,
      });
    } catch {
      return null;
    }
  };

  const forward = async (line: string, id: Id | undefined): Promise<string | null> => {
    let response = await send(daemon as LockInfo, line);
    // A dead daemon (no response) or a replaced one (new token) gets one restart attempt.
    if (response === null || response.status === 401 || response.status === 403) {
      const next = await recover();
      if (next) {
        daemon = next;
        response = await send(next, line);
      }
    }
    if (response === null) {
      return id === undefined ? null : rpcError(id, -32000, 'browser daemon unavailable');
    }
    if (response.status === 202) return null;
    const text = await response.text();
    if (response.status === 200 || text.includes('"jsonrpc"')) return text;
    return id === undefined ? null : rpcError(id, -32000, `daemon responded ${response.status}`);
  };

  const inflight = new Set<Promise<void>>();
  const write = (text: string) => void io.stdout.write(`${text}\n`);

  const handle = (line: string) => {
    if (line.trim() === '') return;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      write(rpcError(null, -32700, 'Parse error'));
      return;
    }
    const task = forward(line, idOf(message))
      .then((reply) => {
        if (reply !== null) write(reply);
      })
      .catch(() => {
        const id = idOf(message);
        if (id !== undefined) write(rpcError(id, -32000, 'browser daemon unavailable'));
      })
      .finally(() => inflight.delete(task));
    inflight.add(task);
  };

  const splitter = new LineSplitter(handle, () =>
    write(rpcError(null, -32600, `Request exceeds ${MAX_LINE_BYTES} bytes`)),
  );

  await new Promise<void>((resolve) => {
    io.stdin.on('data', (chunk: Buffer | string) =>
      splitter.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk),
    );
    io.stdin.once('end', resolve);
    io.stdin.once('close', resolve);
    io.stdin.once('error', resolve);
  });
  splitter.end();
  await Promise.all(inflight);
  return 0;
}
