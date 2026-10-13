import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { PairingStore } from '../src/daemon/pairing-store.js';

function tempPaths(t: TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), 'aevra-browser-store-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, tokenKeyFile: path.join(dir, 'token.key'), pairingsFile: path.join(dir, 'p.json') };
}

function pairing(profileId: string, credentialId = 'cred-1') {
  return {
    pairingId: profileId,
    profileId,
    profileName: `Profile ${profileId}`,
    extensionId: 'abcdefghijklmnopabcdefghijklmnop',
    credentialId,
    legacy: false,
  };
}

test('the signing key is 32 bytes and stable across store instances', (t) => {
  const paths = tempPaths(t);
  const first = new PairingStore(paths).key();
  assert.equal(first.length, 32);
  assert.deepEqual(new PairingStore(paths).key(), first);
  if (process.platform !== 'win32') {
    assert.equal(statSync(paths.tokenKeyFile).mode & 0o777, 0o600);
  }
});

test('a key file of the wrong length is replaced', (t) => {
  const paths = tempPaths(t);
  writeFileSync(paths.tokenKeyFile, Buffer.from('short'));
  assert.equal(new PairingStore(paths).key().length, 32);
});

test('upsert replaces an entry with the same profileId', (t) => {
  const store = new PairingStore(tempPaths(t));
  store.upsert(pairing('p1', 'a'));
  store.upsert(pairing('p1', 'b'));
  store.upsert(pairing('p2'));
  const list = store.pairings();
  assert.equal(list.length, 2);
  assert.equal(list.find((item) => item.profileId === 'p1')?.credentialId, 'b');
});

test('pairings persist across instances', (t) => {
  const paths = tempPaths(t);
  new PairingStore(paths).upsert(pairing('p1'));
  const reloaded = new PairingStore(paths);
  assert.equal(reloaded.pairings().length, 1);
  assert.equal(JSON.parse(readFileSync(paths.pairingsFile, 'utf8')).version, 1);
});

test('remove reports whether an entry existed', (t) => {
  const store = new PairingStore(tempPaths(t));
  store.upsert(pairing('p1'));
  assert.equal(store.remove('missing'), false);
  assert.equal(store.remove('p1'), true);
  assert.equal(store.pairings().length, 0);
});

test('revokeAll clears pairings and advances the epoch', (t) => {
  const paths = tempPaths(t);
  const store = new PairingStore(paths);
  store.upsert(pairing('p1'));
  store.upsert(pairing('p2'));
  assert.equal(store.epoch(), 1);
  assert.equal(store.revokeAll(), 2);
  assert.equal(store.pairings().length, 0);
  assert.equal(new PairingStore(paths).epoch(), 2);
});

test('a corrupt pairings file starts at epoch 1 with no pairings', (t) => {
  const paths = tempPaths(t);
  writeFileSync(paths.pairingsFile, '{not json');
  const store = new PairingStore(paths);
  assert.equal(store.epoch(), 1);
  assert.deepEqual(store.pairings(), []);
});

test('invalid entries and epochs in the file are dropped', (t) => {
  const paths = tempPaths(t);
  writeFileSync(
    paths.pairingsFile,
    JSON.stringify({ epoch: 'x', pairings: [null, { pairingId: 1 }, { ...pairing('ok') }] }),
  );
  const store = new PairingStore(paths);
  assert.equal(store.epoch(), 1);
  assert.deepEqual(
    store.pairings().map((item) => item.profileId),
    ['ok'],
  );
});
