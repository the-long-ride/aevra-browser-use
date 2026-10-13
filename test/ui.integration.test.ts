import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, request } from 'node:http';
import { UiSessions } from '../src/ui/session.js';
import { handleUiRequest } from '../src/ui/server.js';

test('UI bootstrap is single-use, session protected, exact-origin and CSRF guarded', async () => {
  const sessions = new UiSessions();
  const actions = {
    snapshot: async () => ({ effective: { pairPort: 1 } }),
    mutate: async () => ({ ok: true }),
  };
  const server = createServer((req, res) => {
    void handleUiRequest(req, res, sessions, actions);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as import('node:net').AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${origin}/api/settings`)).status, 401);
    const token = sessions.bootstrap();
    const exchange = () =>
      fetch(`${origin}/api/session`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    const auth = await exchange();
    assert.equal(auth.status, 200);
    const cookie = auth.headers.get('set-cookie')!.split(';')[0];
    assert.match(auth.headers.get('set-cookie')!, /HttpOnly; SameSite=Strict/);
    const { csrf } = (await auth.json()) as { csrf: string };
    assert.equal((await exchange()).status, 401);
    const snapshot = await fetch(`${origin}/api/settings`, { headers: { cookie } });
    assert.equal(snapshot.status, 200);
    assert.ok(!(await snapshot.text()).includes(token));
    const llm = await fetch(`${origin}/llm.txt`);
    assert.equal(llm.status, 200);
    assert.equal(llm.headers.get('content-type'), 'text/plain; charset=utf-8');
    const llmText = await llm.text();
    assert.ok(llmText.includes('Aevra Browser'));
    const faviconIco = await fetch(`${origin}/favicon.ico`);
    assert.equal(faviconIco.status, 200);
    assert.equal(faviconIco.headers.get('content-type'), 'image/png');
    assert.ok((await faviconIco.arrayBuffer()).byteLength > 100);
    const faviconPng = await fetch(`${origin}/favicon.png`);
    assert.equal(faviconPng.status, 200);
    assert.equal(faviconPng.headers.get('content-type'), 'image/png');
    const mutate = (headers: Record<string, string>) =>
      fetch(`${origin}/api/action`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json', ...headers },
        body: '{}',
      });
    assert.equal((await mutate({ origin })).status, 403);
    assert.equal((await mutate({ origin: 'http://evil.test', 'x-aevra-csrf': csrf })).status, 403);
    assert.equal((await mutate({ origin, 'x-aevra-csrf': csrf })).status, 200);
    const hostileHost = await new Promise<number>((resolve, reject) => {
      const call = request(origin, { headers: { host: 'evil.test' } }, (reply) => {
        reply.resume();
        resolve(reply.statusCode!);
      });
      call.on('error', reject);
      call.end();
    });
    assert.equal(hostileHost, 403);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
