import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readConfig, readConfigLenient, updateConfig } from '../src/config.js';
import { resolvePaths } from '../src/paths.js';
import { defaultExtensionParent } from '../src/cli-commands.js';

test('saved settings, environment and explicit overrides have visible precedence', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aevra-config-'));
  try {
    updateConfig(dir, { pairPort: 50101, mcpPort: 50102 });
    const current = readConfig(dir, { AEVRA_BROWSER_MCP_PORT: '50202' }, { wsPort: 50303 });
    assert.equal(current.effective.pairPort, 50101);
    assert.equal(current.effective.mcpPort, 50202);
    assert.equal(current.effective.wsPort, 50303);
    assert.equal(current.sources.pairPort, 'saved');
    assert.equal(current.sources.mcpPort, 'environment');
    assert.equal(current.sources.wsPort, 'flag');
    assert.equal(resolvePaths({ AEVRA_BROWSER_HOME: dir }).ports.pair, 50101);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('invalid, unknown and colliding settings leave the last saved configuration untouched', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aevra-config-'));
  try {
    updateConfig(dir, { pairPort: 50101 });
    const before = readFileSync(path.join(dir, 'config.json'), 'utf8');
    for (const change of [{ pairPort: 0 }, { pairPort: 47842 }, { bad: 1 }, { cdpPort: 'x' }]) {
      assert.throws(() => updateConfig(dir, change));
      assert.equal(readFileSync(path.join(dir, 'config.json'), 'utf8'), before);
    }
    updateConfig(dir, { pairPort: null });
    assert.equal(readConfig(dir, {}).effective.pairPort, 47841);
    assert.ok(readFileSync(path.join(dir, 'config.previous.json'), 'utf8').includes('50101'));
    writeFileSync(path.join(dir, 'config.json'), '{bad');
    assert.throws(() => readConfig(dir, {}), /CONFIG_INVALID/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a broken config file falls back to defaults and names the recovery path', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aevra-config-'));
  try {
    updateConfig(dir, { pairPort: 50101 }, {});
    updateConfig(dir, { pairPort: 50102 }, {});
    writeFileSync(path.join(dir, 'config.json'), '{bad');
    const paths = resolvePaths({ AEVRA_BROWSER_HOME: dir });
    assert.equal(paths.ports.pair, 47841);
    assert.match(paths.configProblem ?? '', /CONFIG_INVALID/);
    assert.match(paths.configProblem ?? '', /config\.previous\.json/);
    assert.match(paths.configProblem ?? '', /config reset/);
    updateConfig(dir, { pairPort: null }, {});
    assert.equal(resolvePaths({ AEVRA_BROWSER_HOME: dir }).configProblem, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a saved port that collides with an environment override is refused', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aevra-config-'));
  try {
    const env = { AEVRA_BROWSER_MCP_PORT: '50500' };
    assert.throws(() => updateConfig(dir, { pairPort: 50500 }, env), /distinct/);
    assert.equal(updateConfig(dir, { pairPort: 50501 }, env).effective.mcpPort, 50500);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an explicit extensionDir is the install location; otherwise the shared one', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aevra-config-'));
  try {
    const custom = path.join(dir, 'custom');
    const explicit = resolvePaths({ AEVRA_BROWSER_HOME: dir, AEVRA_BROWSER_EXTENSION_DIR: custom });
    assert.equal(defaultExtensionParent(explicit, dir), custom);
    updateConfig(dir, { extensionDir: custom }, {});
    assert.equal(defaultExtensionParent(resolvePaths({ AEVRA_BROWSER_HOME: dir }), dir), custom);
    updateConfig(dir, { extensionDir: null }, {});
    assert.notEqual(defaultExtensionParent(resolvePaths({ AEVRA_BROWSER_HOME: dir }), dir), custom);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('idleTimeout setting accepts positive integers and 0, rejects invalid values, and respects env', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aevra-config-'));
  try {
    assert.equal(readConfig(dir, {}).effective.idleTimeout, 30);
    updateConfig(dir, { idleTimeout: 15 });
    assert.equal(readConfig(dir, {}).effective.idleTimeout, 15);
    updateConfig(dir, { idleTimeout: 0 });
    assert.equal(readConfig(dir, {}).effective.idleTimeout, 0);
    const withEnv = readConfig(dir, { AEVRA_BROWSER_IDLE_TIMEOUT: '45' });
    assert.equal(withEnv.effective.idleTimeout, 45);
    assert.equal(withEnv.sources.idleTimeout, 'environment');
    for (const bad of [-1, 1.5, 'bad']) {
      assert.throws(() => updateConfig(dir, { idleTimeout: bad as any }), /idleTimeout/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('only the saved ports an environment override collides with are ignored', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aevra-config-'));
  try {
    updateConfig(dir, { pairPort: 50101, wsPort: 50103 }, {});
    const { config, problem } = readConfigLenient(dir, { AEVRA_BROWSER_MCP_PORT: '50101' });
    assert.equal(config.effective.pairPort, 47841);
    assert.equal(config.effective.wsPort, 50103);
    assert.equal(config.effective.mcpPort, 50101);
    assert.match(problem ?? '', /saved pairPort collide/);
    assert.match(problem ?? '', /config set <key> <port>/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a broken file with no previous copy does not name one', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aevra-config-'));
  try {
    writeFileSync(path.join(dir, 'config.json'), '{bad');
    const { config, problem } = readConfigLenient(dir, {});
    assert.equal(config.effective.pairPort, 47841);
    assert.doesNotMatch(problem ?? '', /config\.previous\.json/);
    assert.match(problem ?? '', /Run `aevra-browser config reset <key>`/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
