import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ClientCredentials } from '../src/daemon/client-credentials.js';

test('HTTP agent credentials survive restart and revoke independently without storing raw tokens', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'aevra-client-'));
  try {
    const store = new ClientCredentials(dir);
    const a = await store.create('codex'),
      b = await store.create('claude-code');
    assert.equal(new ClientCredentials(dir).verify(a.token), true);
    assert.equal(store.verify('invalid'), false);
    assert.ok(!readFileSync(path.join(dir, 'client-credentials.json'), 'utf8').includes(a.token));
    await store.revoke(a.id);
    assert.equal(new ClientCredentials(dir).verify(a.token), false);
    assert.equal(new ClientCredentials(dir).verify(b.token), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
