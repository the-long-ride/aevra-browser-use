import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { main, parseArgs } from '../src/cli.js';
import { USAGE } from '../src/cli-args.js';
import { resolvePaths } from '../src/paths.js';
import { VERSION } from '../src/version.js';

test('parseArgs maps every command', () => {
  assert.deepEqual(parseArgs(['serve']), { command: 'serve' });
  assert.deepEqual(parseArgs(['mcp']), { command: 'mcp' });
  assert.deepEqual(parseArgs(['pair']), { command: 'pair' });
  assert.deepEqual(parseArgs(['stop']), { command: 'stop' });
  assert.deepEqual(parseArgs(['status']), { command: 'status', json: false, showToken: false });
  assert.deepEqual(parseArgs(['status', '--json', '--show-token']), {
    command: 'status',
    json: true,
    showToken: true,
  });
  assert.deepEqual(parseArgs(['unpair', 'abc']), { command: 'unpair', id: 'abc', all: false });
  assert.deepEqual(parseArgs(['unpair', '--all']), { command: 'unpair', all: true });
  assert.deepEqual(parseArgs(['cdp']), { command: 'cdp' });
  assert.deepEqual(parseArgs(['cdp', '--port', '9333']), { command: 'cdp', port: 9333 });
  assert.deepEqual(parseArgs(['cdp', '--port=9444']), { command: 'cdp', port: 9444 });
  assert.deepEqual(parseArgs(['extension', 'install']), {
    command: 'extension-install',
    yes: false,
  });
  assert.deepEqual(parseArgs(['extension', 'install', '--dir', 'x', '--yes']), {
    command: 'extension-install',
    dir: 'x',
    yes: true,
  });
  assert.deepEqual(parseArgs(['--version']), { command: 'version' });
  assert.deepEqual(parseArgs(['-v']), { command: 'version' });
  assert.deepEqual(parseArgs(['--help']), { command: 'help' });
  assert.deepEqual(parseArgs([]), { command: 'help' });
});

test('unpair needs an id or --all', () => {
  assert.throws(() => parseArgs(['unpair']), /unpair requires <id> or --all/);
  assert.throws(() => parseArgs(['unpair', 'a', '--all']), /not both/);
  assert.throws(() => parseArgs(['unpair', 'a', 'b']), /one <id>/);
});

test('bad input is rejected with a clear message', () => {
  assert.throws(() => parseArgs(['nope']), /unknown command: nope/);
  assert.throws(() => parseArgs(['serve', 'extra']), /takes no argument/);
  assert.throws(() => parseArgs(['serve', '--wat']), /unknown option --wat/);
  assert.throws(() => parseArgs(['status', '--json=1']), /does not take a value/);
  assert.throws(() => parseArgs(['cdp', '--port']), /needs a value/);
  assert.throws(() => parseArgs(['cdp', '--port', '0']), /--port must be/);
  assert.throws(() => parseArgs(['cdp', '--port', 'abc']), /--port must be/);
  assert.throws(() => parseArgs(['extension']), /extension requires a subcommand/);
  assert.throws(() => parseArgs(['extension', 'remove']), /extension requires a subcommand/);
});

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, ctx: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
}

test('main prints the version and usage', async () => {
  const version = capture();
  assert.equal(await main(['--version'], version.ctx), 0);
  assert.deepEqual(version.out, [VERSION]);
  const help = capture();
  assert.equal(await main(['--help'], help.ctx), 0);
  assert.ok(help.out[0]?.includes('aevra-browser mcp'));
  assert.equal(help.out[0], USAGE);
});

test('main returns 2 and the usage for a usage error', async () => {
  const cap = capture();
  assert.equal(await main(['unpair'], cap.ctx), 2);
  assert.match(cap.err[0] ?? '', /unpair requires <id> or --all/);
  assert.match(cap.err[0] ?? '', /Usage:/);
});

test('main returns 2 for an invalid port variable', async () => {
  const cap = capture();
  const code = await main(
    ['status'],
    { out: cap.ctx.out, err: cap.ctx.err },
    {
      AEVRA_BROWSER_MCP_PORT: '0',
    },
  );
  assert.equal(code, 2);
});

test('commands that need a daemon report that none is running', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'aevra-browser-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const paths = resolvePaths({ AEVRA_BROWSER_HOME: dir });
  const base = {
    paths,
    io: { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() },
  };
  for (const argv of [['status'], ['stop']]) {
    const cap = capture();
    assert.equal(await main(argv, { ...base, ...cap.ctx }), 0, argv.join(' '));
    assert.match(cap.out.join('\n'), /not running/);
  }
  const json = capture();
  await main(['status', '--json'], { ...base, ...json.ctx });
  assert.deepEqual(JSON.parse(json.out[0] ?? ''), { running: false });
  const unpair = capture();
  assert.equal(await main(['unpair', '--all'], { ...base, ...unpair.ctx }), 1);
  assert.match(unpair.err.join('\n'), /not running/);
});
