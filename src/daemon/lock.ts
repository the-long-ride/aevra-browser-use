import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import type { Ports } from '../paths.js';

export interface LockInfo {
  pid: number;
  ports: Ports;
  mcpToken: string;
  startedAt: string;
}

/** How long a lock whose daemon is not answering yet is still treated as "starting". */
export const STARTING_GRACE_MS = 5_000;
const HEALTH_TIMEOUT_MS = 1_000;
const POLL_MS = 50;

export function readLock(file: string): LockInfo | null {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<LockInfo>;
    if (
      !Number.isInteger(raw.pid) ||
      typeof raw.mcpToken !== 'string' ||
      typeof raw.startedAt !== 'string' ||
      typeof raw.ports !== 'object' ||
      raw.ports === null
    ) {
      return null;
    }
    return raw as LockInfo;
  } catch {
    return null;
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return (error as { code?: string }).code === 'EPERM';
  }
}

async function healthy(port: number): Promise<boolean> {
  if (!Number.isInteger(port) || port < 1) return false;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * True when the daemon that wrote this lock is alive and answering. A lock
 * younger than the grace window belongs to a daemon that may still be binding
 * its ports, so it is polled rather than judged on the first refused request.
 */
export async function lockHolderAlive(file: string, info: LockInfo): Promise<boolean> {
  if (!isAlive(info.pid)) return false;
  const deadline = Date.parse(info.startedAt) + STARTING_GRACE_MS;
  for (;;) {
    // The holder rewrites the lock once it knows its real ports.
    const current = readLock(file);
    if (current === null || current.pid !== info.pid) return false;
    if (await healthy(current.ports.mcp)) return true;
    if (!isAlive(info.pid) || Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

function sameLock(a: LockInfo | null, b: LockInfo): boolean {
  return a !== null && a.pid === b.pid && a.startedAt === b.startedAt;
}

function tryCreate(file: string, info: LockInfo): boolean {
  mkdirSync(path.dirname(file), { recursive: true });
  let fd: number;
  try {
    fd = openSync(file, 'wx', 0o600);
  } catch (error) {
    if ((error as { code?: string }).code === 'EEXIST') return false;
    throw error;
  }
  try {
    writeSync(fd, JSON.stringify(info));
  } finally {
    closeSync(fd);
  }
  return true;
}

/**
 * Takes the daemon lock, or reports that a live daemon already holds it. The
 * file is created exclusively, so exactly one of any number of concurrent
 * callers wins. A lock whose pid is dead, or whose daemon never answers
 * `/healthz`, is stale and is replaced.
 */
export async function acquireLock(file: string, info: LockInfo): Promise<'acquired' | 'running'> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (tryCreate(file, info)) return 'acquired';
    let existing = readLock(file);
    // The winner creates the file before it writes it; give it a moment.
    for (let wait = 0; existing === null && wait < 10; wait += 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      existing = readLock(file);
    }
    if (existing !== null && (await lockHolderAlive(file, existing))) return 'running';
    // Only remove the lock we judged stale, never one a faster process just wrote.
    if (existing === null || sameLock(readLock(file), existing)) {
      try {
        unlinkSync(file);
      } catch {
        // Already gone: another caller replaced it first.
      }
    }
  }
  return 'running';
}

/** Atomically rewrites the lock once the daemon knows the ports it really bound. */
export function updateLock(file: string, info: LockInfo): void {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(info), { mode: 0o600 });
  renameSync(tmp, file);
}

/** Removes the lock only if this pid still owns it. */
export function releaseLock(file: string, pid: number): void {
  if (readLock(file)?.pid !== pid) return;
  try {
    unlinkSync(file);
  } catch {
    // Already removed.
  }
}
