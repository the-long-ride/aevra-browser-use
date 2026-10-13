import { VERSION } from '../version.js';
import type { ToolDefinition } from './tools.js';

export const PROTOCOL_VERSION = '2025-06-18';

export interface ToolHost {
  list(): ToolDefinition[];
  call(name: string, args: unknown): Promise<unknown>;
}

type Id = string | number | null;

function failure(id: Id, code: number, message: string): object {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function success(id: Id, result: unknown): object {
  return { jsonrpc: '2.0', id, result };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Handles one JSON-RPC message. Returns `null` for a notification, which gets
 * no reply. Batches are not supported: the server never initiates messages, so
 * a client has no reason to batch.
 */
export async function handleJsonRpc(message: unknown, tools: ToolHost): Promise<object | null> {
  if (!isRecord(message) || typeof message.method !== 'string') {
    const id = isRecord(message) && 'id' in message ? (message.id as Id) : null;
    return failure(id ?? null, -32600, 'Invalid Request');
  }
  if (!('id' in message)) return null;
  const id = message.id as Id;
  const params = isRecord(message.params) ? message.params : {};

  switch (message.method) {
    case 'initialize':
      return success(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'aevra-browser', version: VERSION },
      });
    case 'ping':
      return success(id, {});
    case 'tools/list':
      return success(id, { tools: tools.list() });
    case 'tools/call': {
      if (typeof params.name !== 'string') return failure(id, -32602, 'tools/call requires a name');
      try {
        return success(id, await tools.call(params.name, params.arguments));
      } catch {
        return failure(id, -32603, 'Internal error');
      }
    }
    default:
      return failure(id, -32601, `Method not found: ${message.method}`);
  }
}
