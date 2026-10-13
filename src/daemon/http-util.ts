import type { IncomingMessage, ServerResponse } from 'node:http';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string = code,
  ) {
    super(message);
  }
}

/** Anything past this many bytes is discarded unread rather than buffered. */
const DRAIN_CEILING_BYTES = 64 * 1024 * 1024;

/**
 * Reads a request body up to `limit` bytes. An oversized body is drained
 * without being kept, so the client can finish sending and read the 413
 * instead of seeing a reset connection.
 */
export function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > DRAIN_CEILING_BYTES) {
        request.destroy();
        return;
      }
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large'));
      else resolve(Buffer.concat(chunks));
    });
    request.on('error', reject);
    request.on('close', () => {
      if (!request.complete) reject(new HttpError(400, 'INVALID_REQUEST', 'Request was aborted'));
    });
  });
}

export async function readJsonBody(request: IncomingMessage, limit: number): Promise<unknown> {
  const body = await readBody(request, limit);
  if (body.length === 0) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new HttpError(400, 'INVALID_REQUEST', 'Request body is not valid JSON');
  }
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  response.end(text);
}

export function sendError(response: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } });
    return;
  }
  sendJson(response, 500, { error: { code: 'INTERNAL_ERROR', message: 'Internal error' } });
}

export function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
