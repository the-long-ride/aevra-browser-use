import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { installExtension, type InstallOptions } from '../src/extension/install.js';
import { buildZip } from './helpers/zip.js';

function existing(t: TestContext, version: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'aevra-install-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const destination = path.join(dir, 'aevra-extension');
  mkdirSync(destination, { recursive: true });
  writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ version }));
  writeFileSync(path.join(destination, 'popup.js'), 'edited by hand');
  return dir;
}

function options(dir: string, events: string[], extra: Partial<InstallOptions>): InstallOptions {
  return {
    version: '1.3.0',
    dir,
    yes: true,
    download: async () => {
      events.push('download');
      return buildZip([
        { name: 'aevra-extension/manifest.json', data: JSON.stringify({ version: '1.3.0' }) },
        { name: 'aevra-extension/popup.js', data: 'shipped' },
      ]);
    },
    log: () => undefined,
    error: (message) => void events.push(`error:${message}`),
    onInstalled: () => void events.push('installed'),
    onKept: () => void events.push('kept'),
    ...extra,
  };
}

test('a folder recorded elsewhere is refused before anything is downloaded', async (t) => {
  const dir = existing(t, '1.2.1');
  const events: string[] = [];
  const code = await installExtension(
    options(dir, events, { checkParent: () => 'SHARED_EXTENSION_CONFLICT: elsewhere' }),
  );
  assert.equal(code, 1);
  assert.deepEqual(events, ['error:SHARED_EXTENSION_CONFLICT: elsewhere']);
});

test('a kept same-version copy is claimed without re-recording its files', async (t) => {
  const dir = existing(t, '1.3.0');
  const events: string[] = [];
  const code = await installExtension(options(dir, events, { modified: () => false }));
  assert.equal(code, 0);
  assert.deepEqual(events, ['download', 'kept']);
  assert.equal(
    readFileSync(path.join(dir, 'aevra-extension', 'popup.js'), 'utf8'),
    'edited by hand',
  );
});

test('--yes repairs a same-version copy whose files were changed', async (t) => {
  const dir = existing(t, '1.3.0');
  const events: string[] = [];
  const code = await installExtension(options(dir, events, { modified: () => true }));
  assert.equal(code, 0);
  assert.deepEqual(events, ['download', 'installed']);
  assert.equal(readFileSync(path.join(dir, 'aevra-extension', 'popup.js'), 'utf8'), 'shipped');
});

test('the copy and the claim run inside one transaction', async (t) => {
  const dir = existing(t, '1.2.1');
  const events: string[] = [];
  const transaction = <T>(run: () => T): T => {
    events.push('begin');
    const result = run();
    events.push('end');
    return result;
  };
  const code = await installExtension(options(dir, events, { transaction }));
  assert.equal(code, 0);
  assert.deepEqual(events, ['download', 'begin', 'installed', 'end']);
});
