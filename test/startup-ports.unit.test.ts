import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArgs } from '../src/cli-args.js';

test('basePort derives the three daemon listeners without changing the CDP target', () => {
  assert.deepEqual(parseArgs(['cdp', '--basePort=51000', '--port', '9333']), {
    command: 'cdp',
    port: 9333,
    startupPorts: { pair: 51000, mcp: 51001, ws: 51002 },
  });
});

test('individual listener flags and aliases normalize identically', () => {
  for (const flags of [
    ['--ui-port=51010', '--mcp-port', '51020', '--ws-port=51030'],
    ['--up', '51010', '--mp=51020', '--wp', '51030'],
  ]) {
    assert.deepEqual(parseArgs(['serve', ...flags]), {
      command: 'serve',
      startupPorts: { pair: 51010, mcp: 51020, ws: 51030 },
    });
  }
  assert.deepEqual(parseArgs(['pair', '--mp=65535']), {
    command: 'pair',
    startupPorts: { mcp: 65535 },
  });
});

test('invalid listener choices fail before startup', () => {
  for (const value of ['', 'x', '1.5', '-1', '0', '65536', '1e3', '+2']) {
    assert.throws(() => parseArgs(['serve', `--up=${value}`]), /integer from 1 to 65535/);
  }
  assert.throws(() => parseArgs(['serve', '--basePort=65534']), /65533/);
  assert.throws(() => parseArgs(['serve', '--up']), /needs a value/);
  assert.throws(() => parseArgs(['serve', '--basePort=51000', '--mp=51001']), /cannot combine/);
  assert.throws(() => parseArgs(['serve', '--up=51000', '--ui-port=51001']), /duplicate/);
  assert.throws(() => parseArgs(['serve', '--basePort=51000', '--basePort=51001']), /duplicate/);
  assert.throws(() => parseArgs(['serve', '--up=51000', '--wp=51000']), /distinct/);
});

test('prototype property names remain unknown options', () => {
  for (const name of ['constructor', 'toString', '__proto__']) {
    assert.throws(() => parseArgs(['serve', `--${name}=51000`]), /unknown option/);
  }
});
