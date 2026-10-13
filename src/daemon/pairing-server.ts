import { randomUUID } from 'node:crypto';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { mintExtensionToken } from '../vendor.js';
import { HttpError, isLoopbackAddress, readJsonBody, sendError, sendJson } from './http-util.js';
import type { PairingCodes } from './pairing-codes.js';
import type { PairingStore } from './pairing-store.js';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;
const MAX_BODY_BYTES = 16 * 1024;
const EXTENSION_ID = /^[a-p]{32}$/;
const PROFILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PairingErrorCode =
  'PAIRING_CODE_INVALID' | 'EXTENSION_ID_INVALID' | 'PROFILE_ID_INVALID';

export class PairingError extends Error {
  constructor(readonly code: PairingErrorCode) {
    super(code);
  }
}

export interface RedeemDeps {
  codes: PairingCodes;
  store: PairingStore;
  wsPort: number;
  now?: () => number;
  /** Called after a pairing is stored, so a live socket can be re-checked. */
  onPairingsChanged?: () => void | Promise<void>;
  handleUi?: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
}

export interface RedeemInput {
  code?: unknown;
  extensionId?: unknown;
  profileId?: unknown;
  profileName?: unknown;
}

function profileNameOf(value: unknown, profileId: string): string {
  const trimmed = typeof value === 'string' ? value.trim().slice(0, 120) : '';
  return trimmed || `Browser profile ${profileId.slice(0, 8)}`;
}

/** Follows aevra's pairing-service `redeem`, including its check order. */
export async function redeemPairing(
  input: RedeemInput,
  deps: RedeemDeps,
): Promise<{ token: string; wsUrl: string }> {
  if (!deps.codes.consume(String(input.code ?? ''))) throw new PairingError('PAIRING_CODE_INVALID');
  const extensionId = input.extensionId;
  if (typeof extensionId !== 'string' || !EXTENSION_ID.test(extensionId)) {
    throw new PairingError('EXTENSION_ID_INVALID');
  }
  if (typeof input.profileId !== 'string' || !PROFILE_ID.test(input.profileId)) {
    throw new PairingError('PROFILE_ID_INVALID');
  }
  const profileId = input.profileId.toLowerCase();
  const credentialId = randomUUID();
  const issuedAt = deps.now?.() ?? Date.now();
  deps.store.upsert({
    pairingId: profileId,
    profileId,
    profileName: profileNameOf(input.profileName, profileId),
    extensionId,
    credentialId,
    legacy: false,
    pairedAt: new Date(issuedAt).toISOString(),
  });
  const token = mintExtensionToken(deps.store.key(), {
    extensionId,
    profileId,
    credentialId,
    epoch: deps.store.epoch(),
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(issuedAt + TOKEN_TTL_MS).toISOString(),
  });
  await deps.onPairingsChanged?.();
  return { token, wsUrl: `ws://127.0.0.1:${deps.wsPort}` };
}

/**
 * Serves only aevra's extension pairing contract. A web page cannot choose to
 * send a chrome-extension Origin, so any other Origin is refused; the
 * single-use code is what actually authorises a pairing.
 */
export function createPairingServer(deps: RedeemDeps): Server {
  return createServer((request, response) => {
    void (async () => {
      try {
        if (await deps.handleUi?.(request, response)) return;
        if (!isLoopbackAddress(request.socket.remoteAddress)) {
          throw new HttpError(403, 'FORBIDDEN', 'Loopback clients only');
        }
        const path = (request.url ?? '').split('?')[0];
        if (request.method !== 'POST' || path !== '/api/browser/pair') {
          throw new HttpError(404, 'NOT_FOUND', 'Not found');
        }
        const origin = request.headers.origin;
        if (origin !== undefined && !origin.startsWith('chrome-extension://')) {
          throw new HttpError(403, 'FORBIDDEN', 'Origin is not allowed');
        }
        const body = (await readJsonBody(request, MAX_BODY_BYTES)) as RedeemInput;
        sendJson(response, 200, await redeemPairing(body ?? {}, deps));
      } catch (error) {
        if (error instanceof PairingError) {
          sendJson(response, 400, { error: { code: error.code } });
          return;
        }
        sendError(response, error);
      }
    })();
  });
}
