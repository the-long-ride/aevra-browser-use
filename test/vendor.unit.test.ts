import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BrowserSessionRegistry,
  mintExtensionToken,
  scanNavigateUrl,
  verifyExtensionToken,
} from '../src/vendor.js';

test('the vendored registry is reachable through src/vendor', () => {
  assert.equal(typeof BrowserSessionRegistry, 'function');
});

test('a minted extension token verifies at the same epoch', () => {
  const key = Buffer.alloc(32, 7);
  const claims = {
    extensionId: 'abcdefghijklmnopabcdefghijklmnop',
    epoch: 1,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
  const verified = verifyExtensionToken(key, mintExtensionToken(key, claims), { epoch: 1 });
  assert.equal(verified.extensionId, claims.extensionId);
});

test('a navigation URL carrying a token-shaped query value is blocked', () => {
  const url = 'https://x.test/?k=ghp_' + 'a'.repeat(36);
  assert.equal(scanNavigateUrl(url).blocked, true);
});
