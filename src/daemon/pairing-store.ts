import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BrowserExtensionPairing } from '../vendor.js';

export interface StoredPairing extends BrowserExtensionPairing {
  pairedAt: string;
}

export interface PairingStorePaths {
  tokenKeyFile: string;
  pairingsFile: string;
}

interface Persisted {
  version: 1;
  epoch: number;
  pairings: StoredPairing[];
}

const KEY_BYTES = 32;

function writeAtomic(file: string, data: string | Buffer): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, data, { mode: 0o600 });
  renameSync(tmp, file);
}

function sanitize(entry: unknown): StoredPairing | null {
  if (!entry || typeof entry !== 'object') return null;
  const item = entry as Record<string, unknown>;
  if (
    typeof item.pairingId !== 'string' ||
    typeof item.extensionId !== 'string' ||
    typeof item.profileId !== 'string' ||
    typeof item.credentialId !== 'string' ||
    typeof item.profileName !== 'string'
  ) {
    return null;
  }
  return {
    pairingId: item.pairingId,
    profileId: item.profileId,
    profileName: item.profileName,
    extensionId: item.extensionId,
    credentialId: item.credentialId,
    legacy: false,
    pairedAt: typeof item.pairedAt === 'string' ? item.pairedAt : new Date(0).toISOString(),
  };
}

function load(file: string): Persisted {
  const fresh: Persisted = { version: 1, epoch: 1, pairings: [] };
  if (!existsSync(file)) return fresh;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const epoch = Number(raw.epoch);
    const list = Array.isArray(raw.pairings) ? raw.pairings : [];
    return {
      version: 1,
      epoch: Number.isInteger(epoch) && epoch >= 1 ? epoch : 1,
      pairings: list.map(sanitize).filter((item): item is StoredPairing => item !== null),
    };
  } catch {
    return fresh;
  }
}

/**
 * Persists the token signing key, the paired browser profiles and the global
 * epoch. Revoking everything advances the epoch, which invalidates every token
 * ever issued without needing a list of them.
 */
export class PairingStore {
  private state: Persisted | null = null;
  private keyCache: Buffer | null = null;

  constructor(private readonly paths: PairingStorePaths) {}

  private current(): Persisted {
    this.state ??= load(this.paths.pairingsFile);
    return this.state;
  }

  private save(next: Persisted): void {
    writeAtomic(this.paths.pairingsFile, JSON.stringify(next, null, 2));
    this.state = next;
  }

  key(): Buffer {
    if (this.keyCache) return this.keyCache;
    if (existsSync(this.paths.tokenKeyFile)) {
      const existing = readFileSync(this.paths.tokenKeyFile);
      if (existing.length === KEY_BYTES) {
        this.keyCache = existing;
        return existing;
      }
    }
    const created = randomBytes(KEY_BYTES);
    writeAtomic(this.paths.tokenKeyFile, created);
    this.keyCache = created;
    return created;
  }

  epoch(): number {
    return this.current().epoch;
  }

  pairings(): StoredPairing[] {
    return this.current().pairings.map((pairing) => ({ ...pairing }));
  }

  /** Replaces any entry for the same browser profile, so re-pairing never duplicates. */
  upsert(pairing: BrowserExtensionPairing & { pairedAt?: string }): void {
    const state = this.current();
    const stored: StoredPairing = {
      ...pairing,
      pairedAt: pairing.pairedAt ?? new Date().toISOString(),
    };
    const rest = state.pairings.filter((item) => item.profileId !== pairing.profileId);
    this.save({ ...state, pairings: [...rest, stored] });
  }

  remove(id: string): boolean {
    const state = this.current();
    const rest = state.pairings.filter((item) => item.pairingId !== id);
    if (rest.length === state.pairings.length) return false;
    this.save({ ...state, pairings: rest });
    return true;
  }

  revokeAll(): number {
    const state = this.current();
    this.save({ ...state, epoch: state.epoch + 1, pairings: [] });
    return this.current().epoch;
  }
}
