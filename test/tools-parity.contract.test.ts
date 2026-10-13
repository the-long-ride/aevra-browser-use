import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BROWSER_TOOLS } from '../src/mcp/tools.js';

// Compiled tests live in <root>/.test-dist/test (or <root>/dist/test); the
// submodule is always <root>/vendor/aevra.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const vendorDir = path.join(root, 'vendor', 'aevra', 'packages', 'mcp-tools', 'src');
const schemaSource = readFileSync(path.join(vendorDir, 'registry-browser-schemas.ts'), 'utf8');
const descriptionSource = readFileSync(path.join(vendorDir, 'registry-descriptions.ts'), 'utf8');

/** Splits the vendor `browserInputSchemas` object into one text block per tool. */
function vendorBlocks(): Map<string, string> {
  const start = schemaSource.indexOf('browserInputSchemas');
  const body = schemaSource.slice(start);
  const keys = [...body.matchAll(/^ {2}(browser_[a-z_]+):/gm)];
  const blocks = new Map<string, string>();
  keys.forEach((match, index) => {
    const from = match.index ?? 0;
    const to = keys[index + 1]?.index ?? body.length;
    blocks.set(match[1] as string, body.slice(from, to));
  });
  return blocks;
}

function topLevelRequired(block: string): string[] {
  const match = /^ {4}required: \[([^\]]*)\]/m.exec(block);
  if (!match) return [];
  return [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map((entry) => entry[1] as string).sort();
}

function topLevelProperties(block: string): string[] {
  const props = /^ {4}properties: \{([\s\S]*?)^ {4}\},/m.exec(block)?.[1] ?? '';
  return [...props.matchAll(/^ {6}([A-Za-z]+):/gm)].map((entry) => entry[1] as string).sort();
}

test('the ten tool names equal aevra 1.2.1', () => {
  const vendor = [...vendorBlocks().keys()].sort();
  assert.equal(vendor.length, 10);
  assert.deepEqual(BROWSER_TOOLS.map((tool) => tool.name).sort(), vendor);
});

test('required arrays match the vendor schemas', () => {
  const blocks = vendorBlocks();
  for (const tool of BROWSER_TOOLS) {
    const required = ((tool.inputSchema.required as string[] | undefined) ?? []).slice().sort();
    assert.deepEqual(required, topLevelRequired(blocks.get(tool.name) as string), tool.name);
  }
});

test('top-level properties match the vendor schemas apart from the deprecated workspace fields', () => {
  const blocks = vendorBlocks();
  for (const tool of BROWSER_TOOLS) {
    const properties = Object.keys(tool.inputSchema.properties as object).sort();
    assert.deepEqual(properties, topLevelProperties(blocks.get(tool.name) as string), tool.name);
  }
});

test('every tool rejects unknown arguments like the vendor schemas', () => {
  for (const tool of BROWSER_TOOLS) {
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
  }
});

test('the tools aevra describes keep a description derived from it', () => {
  for (const name of [
    'browser_status',
    'browser_snapshot',
    'browser_act_many',
    'browser_execute_script',
  ]) {
    const vendor = new RegExp(`${name}:\\s*'([^']+)'`).exec(descriptionSource)?.[1];
    assert.ok(vendor, name);
    assert.equal(BROWSER_TOOLS.find((tool) => tool.name === name)?.description, vendor);
  }
});
