import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  HttpError,
  isLoopbackAddress,
  readBody,
  readJsonBody,
  sendError,
  sendJson,
} from './http-util.js';

export const MAX_MCP_BODY_BYTES = 8 * 1024 * 1024;

export interface PairingSummary {
  pairingId: string;
  profileName: string;
  extensionId: string;
  pairedAt: string;
}

/** What the CLI needs from the daemon besides MCP: pairing codes, revocation, shutdown. */
export interface AdminHooks {
  uiBootstrap?(): string;
  createPairingCode(): { code: string; expiresAt: string };
  listPairings(): PairingSummary[];
  /** Removes one pairing, or every pairing (and invalidates all tokens) when `id` is omitted. */
  revoke(id?: string): Promise<{ removed: number; epoch: number }>;
  shutdown(): void;
}

export interface McpHttpDeps {
  verifyClient?(token: string): boolean;
  token: string;
  handle: (message: unknown) => Promise<object | null>;
  admin?: AdminHooks;
}

const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
const LOCAL_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i;

const digest = (value: string) => createHash('sha256').update(value).digest();

function bearerOk(request: IncomingMessage, token: string): boolean {
  const header = String(request.headers.authorization ?? '');
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  // Equal-length digests, so neither the token nor its length leaks through timing.
  return timingSafeEqual(digest(match[1] as string), digest(token));
}

function checkOrigin(request: IncomingMessage): void {
  if (!isLoopbackAddress(request.socket.remoteAddress)) {
    throw new HttpError(403, 'FORBIDDEN', 'Loopback clients only');
  }
  // A DNS-rebinding page reaches this socket under its own hostname.
  if (!LOCAL_HOST.test(String(request.headers.host ?? ''))) {
    throw new HttpError(403, 'FORBIDDEN', 'Host is not allowed');
  }
  const origin = request.headers.origin;
  if (origin !== undefined && !LOCAL_ORIGIN.test(origin)) {
    throw new HttpError(403, 'FORBIDDEN', 'Origin is not allowed');
  }
}

function requireAdmin(deps: McpHttpDeps): AdminHooks {
  if (!deps.admin) throw new HttpError(404, 'NOT_FOUND', 'Not found');
  return deps.admin;
}

async function handleMcp(
  request: IncomingMessage,
  response: ServerResponse,
  deps: McpHttpDeps,
): Promise<void> {
  const body = await readBody(request, MAX_MCP_BODY_BYTES);
  let message: unknown;
  try {
    message = JSON.parse(body.toString('utf8'));
  } catch {
    sendJson(response, 400, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    });
    return;
  }
  const reply = await deps.handle(message);
  if (reply === null) {
    response.writeHead(202);
    response.end();
    return;
  }
  sendJson(response, 200, reply);
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  deps: McpHttpDeps,
): Promise<void> {
  const path = (request.url ?? '').split('?')[0];
  const method = request.method ?? 'GET';
  checkOrigin(request);

  if (method === 'GET' && path === '/healthz') {
    sendJson(response, 200, { ok: true, pid: process.pid });
    return;
  }
  const known = [
    '/mcp',
    '/pairing-code',
    '/pairings',
    '/pairings/revoke',
    '/shutdown',
    '/ui-bootstrap',
  ];
  if (!known.includes(path ?? '')) throw new HttpError(404, 'NOT_FOUND', 'Not found');
  const authorization = /^Bearer (.+)$/.exec(String(request.headers.authorization ?? ''));
  if (
    !bearerOk(request, deps.token) &&
    !(path === '/mcp' && authorization && deps.verifyClient?.(authorization[1]))
  )
    throw new HttpError(401, 'UNAUTHORIZED', 'Bearer token required');

  if (method === 'POST' && path === '/ui-bootstrap' && deps.admin?.uiBootstrap) {
    sendJson(response, 200, { token: deps.admin.uiBootstrap() });
  } else if (method === 'GET' && path === '/pairings') {
    sendJson(response, 200, { pairings: requireAdmin(deps).listPairings() });
  } else if (method !== 'POST') {
    throw new HttpError(404, 'NOT_FOUND', 'Not found');
  } else if (path === '/mcp') {
    await handleMcp(request, response, deps);
  } else if (path === '/pairing-code') {
    sendJson(response, 200, requireAdmin(deps).createPairingCode());
  } else if (path === '/pairings/revoke') {
    const input = (await readJsonBody(request, 16 * 1024)) as { id?: unknown } | null;
    const id = typeof input?.id === 'string' ? input.id : undefined;
    const result = await requireAdmin(deps).revoke(id);
    if (id !== undefined && result.removed === 0) {
      throw new HttpError(404, 'NOT_FOUND', 'No such pairing');
    }
    sendJson(response, 200, result);
  } else if (path === '/shutdown') {
    const admin = requireAdmin(deps);
    sendJson(response, 200, { ok: true });
    response.once('finish', () => setImmediate(() => admin.shutdown()));
  } else {
    throw new HttpError(404, 'NOT_FOUND', 'Not found');
  }
}

/**
 * Loopback-only HTTP endpoint for the MCP JSON-RPC stream and the daemon's
 * admin calls. Every route except `/healthz` needs the bearer token, and a
 * request from a web page (non-local Origin or Host) is refused before the
 * token is even looked at.
 */
export function createMcpHttpServer(deps: McpHttpDeps): Server {
  return createServer((request, response) => {
    route(request, response, deps).catch((error) => {
      if (response.headersSent) response.destroy();
      else sendError(response, error);
    });
  });
}
