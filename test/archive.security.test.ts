import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { readZipEntries, safeEntryPath } from '../src/extension/archive.js';
import {
  downloadArchive,
  extensionZipUrl,
  installExtension,
  MAX_ARCHIVE_BYTES,
} from '../src/extension/install.js';
import { buildZip } from './helpers/zip.js';

const ROOT = path.resolve(tmpdir(), 'aevra-browser-root');

function archiveCode(action: () => unknown): void {
  assert.throws(action, (error: { code?: string }) => error.code === 'EXTENSION_ARCHIVE_INVALID');
}

test('safeEntryPath accepts a normal nested entry', () => {
  assert.equal(
    safeEntryPath(ROOT, 'aevra-extension/js/popup.js'),
    path.join(ROOT, 'aevra-extension', 'js', 'popup.js'),
  );
});

test('safeEntryPath rejects traversal, absolute and backslash names', () => {
  for (const name of [
    '../x',
    'a/../../x',
    './x',
    'a/./x',
    'C:/x',
    'c:x',
    '/etc/x',
    'a\\b',
    'a\u0000b',
    '',
  ]) {
    archiveCode(() => safeEntryPath(ROOT, name));
  }
});

test('readZipEntries reads stored and deflated entries and skips directories', () => {
  const zip = buildZip([
    { name: 'aevra-extension/', data: '' },
    { name: 'aevra-extension/a.txt', data: 'hello' },
    { name: 'aevra-extension/b.txt', data: 'world'.repeat(100), deflate: true },
  ]);
  const entries = readZipEntries(zip);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ['aevra-extension/a.txt', 'aevra-extension/b.txt'],
  );
  assert.equal(entries[1]?.data.toString(), 'world'.repeat(100));
});

test('a bad CRC is EXTENSION_ARCHIVE_INVALID', () => {
  archiveCode(() => readZipEntries(buildZip([{ name: 'aevra-extension/a', data: 'x', crc: 1 }])));
});

test('an entry that inflates past its declared size is refused', () => {
  const zip = buildZip([
    { name: 'aevra-extension/a', data: 'x'.repeat(10_000), deflate: true, declaredSize: 4 },
  ]);
  archiveCode(() => readZipEntries(zip));
});

test('non-zip data, an empty archive and a truncated archive are refused', () => {
  archiveCode(() => readZipEntries(Buffer.from('definitely not a zip file at all')));
  archiveCode(() => readZipEntries(Buffer.alloc(5)));
  archiveCode(() => readZipEntries(buildZip([])));
  const good = buildZip([{ name: 'aevra-extension/a', data: 'hello' }]);
  archiveCode(() => readZipEntries(good.subarray(10)));
});

function tempDir(t: TestContext): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'aevra-browser-install-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function installer(dir: string, zip: Buffer, extra: { yes?: boolean } = {}) {
  const logs: string[] = [];
  const errors: string[] = [];
  let downloads = 0;
  return {
    logs,
    errors,
    downloads: () => downloads,
    run: () =>
      installExtension({
        version: '9.9.9',
        dir,
        yes: extra.yes ?? false,
        download: async () => {
          downloads += 1;
          return zip;
        },
        log: (line) => logs.push(line),
        error: (line) => errors.push(line),
      }),
  };
}

const GOOD = buildZip([
  { name: 'aevra-extension/manifest.json', data: '{"name":"x"}' },
  { name: 'aevra-extension/js/popup.js', data: 'void 0;' },
]);

test('install writes the files and prints the load-unpacked steps', async (t) => {
  const dir = tempDir(t);
  const run = installer(dir, GOOD);
  assert.equal(await run.run(), 0);
  assert.equal(
    readFileSync(path.join(dir, 'aevra-extension', 'js', 'popup.js'), 'utf8'),
    'void 0;',
  );
  const text = run.logs.join('\n');
  assert.match(text, /chrome:\/\/extensions/);
  assert.match(text, /Load unpacked/);
  assert.match(text, /aevra-browser pair/);
  assert.ok(text.includes(extensionZipUrl('9.9.9')));
});

test('install into a non-empty destination without --yes returns 1 and writes nothing', async (t) => {
  const dir = tempDir(t);
  const destination = path.join(dir, 'aevra-extension');
  mkdirSync(destination, { recursive: true });
  writeFileSync(path.join(destination, 'keep.txt'), 'mine');
  const run = installer(dir, GOOD);
  assert.equal(await run.run(), 1);
  assert.equal(run.downloads(), 0);
  assert.match(run.errors.join('\n'), /--yes/);
  assert.equal(readFileSync(path.join(destination, 'keep.txt'), 'utf8'), 'mine');
  assert.equal(existsSync(path.join(destination, 'manifest.json')), false);
});

test('install replaces an existing install with --yes', async (t) => {
  const dir = tempDir(t);
  const destination = path.join(dir, 'aevra-extension');
  mkdirSync(destination, { recursive: true });
  writeFileSync(path.join(destination, 'old.txt'), 'old');
  assert.equal(await installer(dir, GOOD, { yes: true }).run(), 0);
  assert.equal(existsSync(path.join(destination, 'old.txt')), false);
  assert.equal(existsSync(path.join(destination, 'manifest.json')), true);
});

test('a hostile entry is refused before the existing install is touched', async (t) => {
  const dir = tempDir(t);
  const destination = path.join(dir, 'aevra-extension');
  mkdirSync(destination, { recursive: true });
  writeFileSync(path.join(destination, 'keep.txt'), 'mine');
  const hostile = buildZip([
    { name: 'aevra-extension/ok.txt', data: 'fine' },
    { name: 'aevra-extension/../../escape.txt', data: 'bad' },
  ]);
  const run = installer(dir, hostile, { yes: true });
  assert.equal(await run.run(), 1);
  assert.match(run.errors.join('\n'), /escapes the destination/);
  assert.equal(readFileSync(path.join(destination, 'keep.txt'), 'utf8'), 'mine');
  assert.equal(existsSync(path.join(dir, '..', 'escape.txt')), false);
});

test('entries outside the aevra-extension folder are refused', async (t) => {
  const dir = tempDir(t);
  const run = installer(dir, buildZip([{ name: 'other/file.txt', data: 'x' }]));
  assert.equal(await run.run(), 1);
  assert.match(run.errors.join('\n'), /outside aevra-extension/);
  assert.equal(existsSync(path.join(dir, 'other')), false);
});

test('a corrupt archive reports the failure and exits 1', async (t) => {
  const run = installer(tempDir(t), Buffer.from('not a zip, just some text of some length'));
  assert.equal(await run.run(), 1);
  assert.match(run.errors.join('\n'), /extension install failed: .*zip/);
});

const response = (
  body: ConstructorParameters<typeof Response>[0],
  init: ConstructorParameters<typeof Response>[1] = {},
) => (async () => new Response(body, init)) as unknown as typeof fetch;

test('downloadArchive returns the body', async () => {
  const data = await downloadArchive('https://example.test/x.zip', response('abc'));
  assert.equal(data.toString(), 'abc');
});

test('downloadArchive maps 404 and other failures to clear errors', async () => {
  await assert.rejects(
    () => downloadArchive('https://x.test/', response('', { status: 404 })),
    /No extension archive is published/,
  );
  await assert.rejects(
    () => downloadArchive('https://x.test/', response('', { status: 500 })),
    /HTTP 500/,
  );
});

test('downloadArchive refuses a declared length over 32 MiB', async () => {
  await assert.rejects(
    () =>
      downloadArchive(
        'https://x.test/',
        response('abc', { headers: { 'content-length': String(MAX_ARCHIVE_BYTES + 1) } }),
      ),
    /larger than/,
  );
});

test('downloadArchive stops reading a body that grows past 32 MiB with no length', async () => {
  let produced = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      produced += 1024 * 1024;
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
  });
  await assert.rejects(() => downloadArchive('https://x.test/', response(stream)), /larger than/);
  assert.ok(produced <= MAX_ARCHIVE_BYTES + 8 * 1024 * 1024);
});

test('downloadArchive aborts after its timeout', async (t) => {
  // A real stalled server keeps the pending network operation alive. A fake
  // unresolved fetch leaves only AbortSignal.timeout's unreferenced timer,
  // so Node can cancel the test when no unrelated handles remain.
  const server = createServer(() => {});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  await assert.rejects(
    () => downloadArchive(`http://127.0.0.1:${address.port}/stalled.zip`, fetch, 50),
    { name: 'TimeoutError' },
  );
});

function manifestZip(version: string): Buffer {
  return buildZip([
    { name: 'aevra-extension/manifest.json', data: JSON.stringify({ version }) },
    { name: 'aevra-extension/js/popup.js', data: `void "${version}";` },
  ]);
}

test('install keeps a same-or-newer copy, even with --yes, and still claims it', async (t) => {
  for (const existing of ['1.3.0', '1.2.1']) {
    const dir = tempDir(t);
    const destination = path.join(dir, 'aevra-extension');
    mkdirSync(destination, { recursive: true });
    writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ version: existing }));
    writeFileSync(path.join(destination, 'root.txt'), 'root files');
    const claimed: string[] = [];
    const code = await installExtension({
      version: '9.9.9',
      dir,
      yes: true,
      download: async () => manifestZip('1.2.1'),
      log: () => undefined,
      error: () => undefined,
      onInstalled: (parent) => claimed.push(parent),
    });
    assert.equal(code, 0, existing);
    assert.equal(readFileSync(path.join(destination, 'root.txt'), 'utf8'), 'root files');
    assert.deepEqual(claimed, [path.resolve(dir)]);
  }
});

test('install upgrades an older copy only with --yes', async (t) => {
  const dir = tempDir(t);
  const destination = path.join(dir, 'aevra-extension');
  mkdirSync(destination, { recursive: true });
  writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ version: '1.0.0' }));
  const refused = installer(dir, manifestZip('1.2.1'));
  assert.equal(await refused.run(), 1);
  assert.match(refused.errors.join('\n'), /--yes/);
  assert.equal(await installer(dir, manifestZip('1.2.1'), { yes: true }).run(), 0);
  assert.match(readFileSync(path.join(destination, 'manifest.json'), 'utf8'), /1\.2\.1/);
});
