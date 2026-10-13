import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePaths } from '../src/paths.js';

test('win32 uses LOCALAPPDATA', () => {
  const paths = resolvePaths({ LOCALAPPDATA: 'C:\\L' }, 'win32', 'C:\\Users\\dev');
  assert.equal(paths.stateDir, 'C:\\L\\aevra-browser');
  assert.equal(paths.lockFile, 'C:\\L\\aevra-browser\\daemon.lock');
  assert.equal(paths.extensionDir, 'C:\\L\\aevra-browser\\extension');
});

test('win32 falls back to the home dir without LOCALAPPDATA', () => {
  const paths = resolvePaths({}, 'win32', 'C:\\Users\\dev');
  assert.equal(paths.stateDir, 'C:\\Users\\dev\\AppData\\Local\\aevra-browser');
});

test('darwin uses Application Support', () => {
  const paths = resolvePaths({}, 'darwin', '/Users/dev');
  assert.equal(paths.stateDir, '/Users/dev/Library/Application Support/aevra-browser');
});

test('linux defaults to ~/.local/state and honours XDG_STATE_HOME', () => {
  assert.equal(
    resolvePaths({}, 'linux', '/home/dev').stateDir,
    '/home/dev/.local/state/aevra-browser',
  );
  assert.equal(
    resolvePaths({ XDG_STATE_HOME: '/x/state' }, 'linux', '/home/dev').stateDir,
    '/x/state/aevra-browser',
  );
});

test('AEVRA_BROWSER_HOME overrides every platform default', () => {
  const paths = resolvePaths({ AEVRA_BROWSER_HOME: '/custom/home' }, 'linux', '/home/dev');
  assert.equal(paths.stateDir, '/custom/home');
  assert.equal(paths.tokenKeyFile, '/custom/home/token.key');
  assert.equal(paths.pairingsFile, '/custom/home/pairings.json');
});

test('default ports and env overrides', () => {
  assert.deepEqual(resolvePaths({}, 'linux', '/h').ports, {
    pair: 47841,
    mcp: 47842,
    ws: 47843,
    cdp: 9222,
  });
  const ports = resolvePaths(
    {
      AEVRA_BROWSER_PAIR_PORT: '1',
      AEVRA_BROWSER_MCP_PORT: '2',
      AEVRA_BROWSER_WS_PORT: '3',
      AEVRA_BROWSER_CDP_PORT: '65535',
    },
    'linux',
    '/h',
  ).ports;
  assert.deepEqual(ports, { pair: 1, mcp: 2, ws: 3, cdp: 65535 });
});

test('port 0 is rejected from the environment', () => {
  assert.throws(
    () => resolvePaths({ AEVRA_BROWSER_MCP_PORT: '0' }, 'linux', '/h'),
    /INVALID_PORT: AEVRA_BROWSER_MCP_PORT/,
  );
});

test('non-numeric and out-of-range ports are rejected', () => {
  for (const bad of ['abc', '65536', '-1', '1.5']) {
    assert.throws(
      () => resolvePaths({ AEVRA_BROWSER_PAIR_PORT: bad }, 'linux', '/h'),
      /INVALID_PORT/,
      bad,
    );
  }
});

test('an empty port variable falls back to the default', () => {
  assert.equal(resolvePaths({ AEVRA_BROWSER_MCP_PORT: '' }, 'linux', '/h').ports.mcp, 47842);
});

test('AEVRA_BROWSER_HOME naming the default folder still counts as the default', () => {
  const env = { LOCALAPPDATA: 'C:\\L' };
  const same = { ...env, AEVRA_BROWSER_HOME: 'c:\\l\\AEVRA-BROWSER\\' };
  assert.equal(resolvePaths(same, 'win32', 'C:\\Users\\dev').isDefaultStateDir, true);
  assert.equal(resolvePaths(env, 'win32', 'C:\\Users\\dev').isDefaultStateDir, true);
  const custom = { AEVRA_BROWSER_HOME: '/home/dev/.local/state/aevra-browser/' };
  assert.equal(resolvePaths(custom, 'linux', '/home/dev').isDefaultStateDir, true);
  const upper = { AEVRA_BROWSER_HOME: '/home/dev/.local/state/AEVRA-BROWSER' };
  assert.equal(resolvePaths(upper, 'linux', '/home/dev').isDefaultStateDir, false);
});
