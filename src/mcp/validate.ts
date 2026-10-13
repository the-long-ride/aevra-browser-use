import { AevraToolError } from '../vendor.js';
import type { JsonSchema } from './schemas.js';

type Args = Record<string, unknown>;
type PropSchema = {
  type?: string;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  minItems?: number;
};

function invalid(message: string): never {
  throw new AevraToolError('INVALID_REQUEST', message);
}

function checkValue(key: string, value: unknown, schema: PropSchema): void {
  const { type } = schema;
  if (type === 'string' && typeof value !== 'string') invalid(`${key} must be a string`);
  if (type === 'boolean' && typeof value !== 'boolean') invalid(`${key} must be a boolean`);
  if (type === 'array' && !Array.isArray(value)) invalid(`${key} must be an array`);
  if (type === 'integer' || type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) invalid(`${key} must be a number`);
    if (type === 'integer' && !Number.isInteger(value)) invalid(`${key} must be an integer`);
    if (schema.minimum !== undefined && value < schema.minimum) {
      invalid(`${key} must be at least ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      invalid(`${key} must be at most ${schema.maximum}`);
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    invalid(`${key} must be one of ${schema.enum.join(', ')}`);
  }
  if (typeof value === 'string' && schema.minLength && value.length < schema.minLength) {
    invalid(`${key} must not be empty`);
  }
  if (Array.isArray(value) && schema.minItems && value.length < schema.minItems) {
    invalid(`${key} needs at least ${schema.minItems} item(s)`);
  }
}

/**
 * Checks the top level of a tool call against its input schema: required keys,
 * unknown keys, primitive types, enums and numeric bounds. The nested action
 * grammar is validated by aevra's own `normalizeBrowserActions` /
 * `parseBrowserScript`.
 */
export function validateArgs(schema: JsonSchema, args: unknown): Args {
  if (args === undefined || args === null) args = {};
  if (typeof args !== 'object' || Array.isArray(args)) invalid('arguments must be an object');
  const input = args as Args;
  const properties = (schema.properties ?? {}) as Record<string, PropSchema>;
  for (const key of Object.keys(input)) {
    if (!(key in properties)) invalid(`unexpected argument ${key}`);
  }
  for (const key of (schema.required ?? []) as string[]) {
    if (input[key] === undefined) invalid(`missing required argument ${key}`);
  }
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) checkValue(key, value, properties[key] as PropSchema);
  }
  return input;
}
