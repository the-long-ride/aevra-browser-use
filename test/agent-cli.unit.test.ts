import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runBrowserAgentCli } from '../src/agent-command.js';
import { resolvePaths } from '../src/paths.js';
import { markStateDirectory } from '../shared/aevra/packages/agent-integration/src/cleanup.js';
import { claimExtension } from '../shared/aevra/packages/agent-integration/src/shared-extension.js';

async function withTempHome<T>(run: (home: string, stateDir: string) => Promise<T>): Promise<T> {
  const home = mkdtempSync(path.join(tmpdir(), 'aevra-agent-cli-'));
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    return await run(home, path.join(home, 'state'));
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(home, { recursive: true, force: true });
  }
}

async function captureLog<T>(run: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...parts: unknown[]) => void lines.push(parts.join(' '));
  try {
    return { result: await run(), lines };
  } finally {
    console.log = original;
  }
}

test('uninstall rejects unknown flags and ignores unrelated commands', async () => {
  await withTempHome(async (_home, stateDir) => {
    const paths = resolvePaths({ AEVRA_BROWSER_HOME: stateDir });
    await assert.rejects(
      runBrowserAgentCli(['uninstall', '--force'], paths),
      /Usage: aevra-browser uninstall/,
    );
    assert.equal(await runBrowserAgentCli(['status'], paths), null);
    assert.equal(await runBrowserAgentCli(['mcp'], paths), null);
  });
});

test('mcp with arguments requires exactly --credential-file <file>', async () => {
  await withTempHome(async (_home, stateDir) => {
    const paths = resolvePaths({ AEVRA_BROWSER_HOME: stateDir });
    for (const argv of [
      ['mcp', 'x'],
      ['mcp', '--credential-file'],
      ['mcp', '--other', 'f'],
    ])
      await assert.rejects(runBrowserAgentCli(argv, paths), /Usage: aevra-browser mcp/);
  });
});

test('uninstall --dry-run reports without touching state', async () => {
  await withTempHome(async (home, stateDir) => {
    mkdirSync(stateDir, { recursive: true });
    markStateDirectory(stateDir, 'aevra-browser', home);
    const paths = resolvePaths({ AEVRA_BROWSER_HOME: stateDir });
    const { result, lines } = await captureLog(() =>
      runBrowserAgentCli(['uninstall', '--dry-run', '--purge'], paths),
    );
    assert.equal(result, 0);
    const report = JSON.parse(lines.join('\n'));
    // A dry run reports what the real release would do: here, nothing is owned.
    assert.equal(report.extension.message, 'No managed extension ownership');
    assert.ok(existsSync(stateDir));
  });
});

test('uninstall --purge removes the state directory when no daemon is running', async () => {
  await withTempHome(async (home, stateDir) => {
    const paths = resolvePaths({ AEVRA_BROWSER_HOME: stateDir });
    mkdirSync(stateDir, { recursive: true });
    markStateDirectory(stateDir, 'aevra-browser', home);
    const { result, lines } = await captureLog(() =>
      runBrowserAgentCli(['uninstall', '--purge'], paths),
    );
    assert.equal(result, 0);
    assert.ok(JSON.parse(lines.join('\n')).integrations);
    assert.equal(existsSync(stateDir), false);
  });
});

test('uninstall --purge keeps an extension copy that root Aevra still owns', async () => {
  await withTempHome(async (home, stateDir) => {
    const paths = resolvePaths({ AEVRA_BROWSER_HOME: stateDir });
    const parent = path.join(stateDir, 'extension');
    mkdirSync(stateDir, { recursive: true });
    markStateDirectory(stateDir, 'aevra-browser', home);
    mkdirSync(path.join(parent, 'aevra-extension'), { recursive: true });
    writeFileSync(path.join(parent, 'aevra-extension', 'manifest.json'), '{"version":"1.3.0"}');
    writeFileSync(path.join(stateDir, 'pairings.json'), '[]');
    claimExtension(home, 'aevra', parent);
    claimExtension(home, 'aevra-browser', parent);
    const { result } = await captureLog(() => runBrowserAgentCli(['uninstall', '--purge'], paths));
    assert.equal(result, 0);
    assert.ok(existsSync(path.join(parent, 'aevra-extension', 'manifest.json')));
    assert.equal(existsSync(path.join(stateDir, 'pairings.json')), false);
  });
});

test('uninstall --purge refuses an unmarked state directory and keeps the extension', async () => {
  await withTempHome(async (home, stateDir) => {
    const paths = resolvePaths({ AEVRA_BROWSER_HOME: stateDir });
    const parent = path.join(home, 'shared');
    mkdirSync(path.join(parent, 'aevra-extension'), { recursive: true });
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(path.join(parent, 'aevra-extension', 'manifest.json'), '{"version":"1.3.0"}');
    claimExtension(home, 'aevra-browser', parent);
    await assert.rejects(runBrowserAgentCli(['uninstall', '--purge'], paths), /STATE_/);
    assert.ok(existsSync(path.join(parent, 'aevra-extension', 'manifest.json')));
  });
});

test('uninstall --dry-run --purge previews the state it would remove', async () => {
  await withTempHome(async (home, stateDir) => {
    const paths = resolvePaths({ AEVRA_BROWSER_HOME: stateDir });
    mkdirSync(stateDir, { recursive: true });
    markStateDirectory(stateDir, 'aevra-browser', home);
    writeFileSync(path.join(stateDir, 'pairings.json'), '[]');
    const { result, lines } = await captureLog(() =>
      runBrowserAgentCli(['uninstall', '--dry-run', '--purge'], paths),
    );
    assert.equal(result, 0);
    const { state } = JSON.parse(lines.join('\n'));
    assert.ok(state.remove.some((file: string) => file.endsWith('pairings.json')));
    assert.ok(existsSync(path.join(stateDir, 'pairings.json')));
  });
});

test('a refused purge leaves agent integrations installed', async () => {
  await withTempHome(async (home, stateDir) => {
    const paths = resolvePaths({ AEVRA_BROWSER_HOME: stateDir });
    await captureLog(() => runBrowserAgentCli(['agent', 'install', 'claude-code'], paths));
    rmSync(path.join(stateDir, '.aevra-state-owner.json'));
    await assert.rejects(runBrowserAgentCli(['uninstall', '--purge'], paths), /STATE_/);
    const { lines } = await captureLog(() =>
      runBrowserAgentCli(['agent', 'status', 'claude-code'], paths),
    );
    assert.match(lines.join('\n'), /"state": "installed"/);
    assert.ok(home);
  });
});

test('an extension that cannot be released is kept while the purge finishes', async () => {
  await withTempHome(async (home, stateDir) => {
    const paths = resolvePaths({ AEVRA_BROWSER_HOME: stateDir });
    const parent = path.join(stateDir, 'extension');
    mkdirSync(path.join(parent, 'aevra-extension'), { recursive: true });
    markStateDirectory(stateDir, 'aevra-browser', home);
    const manifest = path.join(parent, 'aevra-extension', 'manifest.json');
    writeFileSync(manifest, '{"version":"1.3.0"}');
    claimExtension(home, 'aevra-browser', parent);
    writeFileSync(manifest, '{"version":"1.3.0","edited":true}');
    writeFileSync(path.join(stateDir, 'pairings.json'), '[]');
    const { result, lines } = await captureLog(() =>
      runBrowserAgentCli(['uninstall', '--purge'], paths),
    );
    assert.equal(result, 0);
    assert.equal(JSON.parse(lines.join('\n')).extension.removed, false);
    assert.ok(existsSync(manifest));
    assert.equal(existsSync(path.join(stateDir, 'pairings.json')), false);
  });
});
