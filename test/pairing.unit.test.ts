import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { PairingCodes } from '../src/daemon/pairing-codes.js';
import { PairingStore } from '../src/daemon/pairing-store.js';
import {
  createPairingServer,
  PairingError,
  redeemPairing,
  type RedeemDeps,
} from '../src/daemon/pairing-server.js';
import { verifyExtensionToken } from '../src/vendor.js';

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const PROFILE_ID = '3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b';

function setup(t: TestContext, now: () => number = () => Date.now()) {
  const dir = mkdtempSync(path.join(tmpdir(), 'aevra-browser-pair-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new PairingStore({
    tokenKeyFile: path.join(dir, 'token.key'),
    pairingsFile: path.join(dir, 'pairings.json'),
  });
  const codes = new PairingCodes(now);
  const deps: RedeemDeps = { codes, store, wsPort: 47843, now };
  return { store, codes, deps };
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof PairingError);
    return error.code;
  }
  assert.fail('expected a PairingError');
}

test('codes use the unambiguous alphabet and are 8 characters', () => {
  const codes = new PairingCodes();
  for (let index = 0; index < 50; index += 1) {
    assert.match(codes.create().code, /^[0-9A-HJKMNP-TV-Z]{8}$/);
  }
});

test('a code expires after five minutes', () => {
  let clock = 1_000_000;
  const codes = new PairingCodes(() => clock);
  const { code, expiresAt } = codes.create();
  assert.equal(Date.parse(expiresAt), 1_000_000 + 5 * 60_000);
  clock += 5 * 60_000;
  assert.equal(codes.consume(code), false);
});

test('a code is accepted case-insensitively and only once', () => {
  const codes = new PairingCodes();
  const { code } = codes.create();
  assert.equal(codes.consume(code.toLowerCase()), true);
  assert.equal(codes.consume(code), false);
});

test('creating a new code invalidates the previous one', () => {
  const codes = new PairingCodes();
  const first = codes.create().code;
  codes.create();
  assert.equal(codes.consume(first), false);
});

test('a wrong code burns the live code', async (t) => {
  const { codes, deps } = setup(t);
  const { code } = codes.create();
  const wrong = { code: 'ZZZZZZZZ', extensionId: EXTENSION_ID, profileId: PROFILE_ID };
  assert.equal(await rejection(redeemPairing(wrong, deps)), 'PAIRING_CODE_INVALID');
  const right = { code, extensionId: EXTENSION_ID, profileId: PROFILE_ID };
  assert.equal(await rejection(redeemPairing(right, deps)), 'PAIRING_CODE_INVALID');
});

test('a bad extension id is rejected', async (t) => {
  const { codes, deps } = setup(t);
  const { code } = codes.create();
  const input = { code, extensionId: 'not-an-id', profileId: PROFILE_ID };
  assert.equal(await rejection(redeemPairing(input, deps)), 'EXTENSION_ID_INVALID');
});

test('a bad profile id is rejected', async (t) => {
  const { codes, deps } = setup(t);
  const { code } = codes.create();
  const input = { code, extensionId: EXTENSION_ID, profileId: 'nope' };
  assert.equal(await rejection(redeemPairing(input, deps)), 'PROFILE_ID_INVALID');
});

test('a successful redeem mints a token the extension server accepts', async (t) => {
  const { codes, store, deps } = setup(t);
  const { code } = codes.create();
  const result = await redeemPairing(
    {
      code,
      extensionId: EXTENSION_ID,
      profileId: PROFILE_ID.toUpperCase(),
      profileName: '  Work  ',
    },
    deps,
  );
  assert.equal(result.wsUrl, 'ws://127.0.0.1:47843');
  const claims = verifyExtensionToken(store.key(), result.token, { epoch: store.epoch() });
  assert.equal(claims.profileId, PROFILE_ID);
  const [stored] = store.pairings();
  assert.equal(stored?.profileName, 'Work');
  assert.equal(stored?.credentialId, claims.credentialId);
});

test('a missing profile name falls back to the profile id prefix', async (t) => {
  const { codes, store, deps } = setup(t);
  const { code } = codes.create();
  await redeemPairing({ code, extensionId: EXTENSION_ID, profileId: PROFILE_ID }, deps);
  assert.equal(store.pairings()[0]?.profileName, 'Browser profile 3f2b8c1e');
});

test('onPairingsChanged runs after a successful redeem', async (t) => {
  const { codes, deps } = setup(t);
  let called = 0;
  const { code } = codes.create();
  await redeemPairing(
    { code, extensionId: EXTENSION_ID, profileId: PROFILE_ID },
    { ...deps, onPairingsChanged: () => void (called += 1) },
  );
  assert.equal(called, 1);
});

interface Reply {
  status: number;
  body: string;
}

function post(
  server: Server,
  urlPath: string,
  body: string,
  headers: Record<string, string> = {},
  method = 'POST',
): Promise<Reply> {
  const { port } = server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: { 'content-type': 'application/json', ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

async function listening(t: TestContext, deps: RedeemDeps): Promise<Server> {
  const server = createPairingServer(deps);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return server;
}

test('HTTP: the happy path returns exactly token and wsUrl', async (t) => {
  const { codes, deps } = setup(t);
  const server = await listening(t, deps);
  const { code } = codes.create();
  const body = JSON.stringify({ code, extensionId: EXTENSION_ID, profileId: PROFILE_ID });
  const reply = await post(server, '/api/browser/pair', body, {
    origin: `chrome-extension://${EXTENSION_ID}`,
  });
  assert.equal(reply.status, 200);
  assert.deepEqual(Object.keys(JSON.parse(reply.body)).sort(), ['token', 'wsUrl']);
});

test('HTTP: errors use the { error: { code } } shape with status 400', async (t) => {
  const { deps } = setup(t);
  const server = await listening(t, deps);
  const body = JSON.stringify({
    code: 'AAAAAAAA',
    extensionId: EXTENSION_ID,
    profileId: PROFILE_ID,
  });
  const reply = await post(server, '/api/browser/pair', body);
  assert.equal(reply.status, 400);
  assert.deepEqual(JSON.parse(reply.body), { error: { code: 'PAIRING_CODE_INVALID' } });
});

test('HTTP: other paths and methods are 404', async (t) => {
  const { deps } = setup(t);
  const server = await listening(t, deps);
  assert.equal((await post(server, '/api/browser', '{}')).status, 404);
  assert.equal((await post(server, '/api/browser/pair', '', {}, 'GET')).status, 404);
});

test('HTTP: a web page Origin is refused', async (t) => {
  const { deps } = setup(t);
  const server = await listening(t, deps);
  const reply = await post(server, '/api/browser/pair', '{}', { origin: 'https://evil.test' });
  assert.equal(reply.status, 403);
});

test('HTTP: invalid JSON is 400 and an oversized body is 413', async (t) => {
  const { deps } = setup(t);
  const server = await listening(t, deps);
  assert.equal((await post(server, '/api/browser/pair', '{nope')).status, 400);
  assert.equal((await post(server, '/api/browser/pair', 'x'.repeat(20_000))).status, 413);
});
