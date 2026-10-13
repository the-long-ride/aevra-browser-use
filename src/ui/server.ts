import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  HttpError,
  isLoopbackAddress,
  readJsonBody,
  sendError,
  sendJson,
} from '../daemon/http-util.js';
import type { UiSessions } from './session.js';
import { FAVICON_BUFFER, getLlmTxt, HTML, SCRIPT, STYLE } from './assets.js';

export interface SettingsActions {
  snapshot(): Promise<unknown>;
  mutate(input: unknown): Promise<unknown>;
}

export async function handleUiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  sessions: UiSessions,
  actions: SettingsActions,
): Promise<boolean> {
  const route = req.url?.split('?')[0];
  if (
    ![
      '/',
      '/settings.js',
      '/settings.css',
      '/llm.txt',
      '/favicon.ico',
      '/favicon.png',
      '/favicon-32x32.png',
      '/api/session',
      '/api/settings',
      '/api/action',
    ].includes(route ?? '')
  )
    return false;
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader(
    'content-security-policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  try {
    const expected = `http://127.0.0.1:${req.socket.localPort}`;
    if (
      !isLoopbackAddress(req.socket.remoteAddress) ||
      req.headers.host !== `127.0.0.1:${req.socket.localPort}`
    )
      throw new HttpError(403, 'FORBIDDEN');
    if (
      req.method === 'GET' &&
      [
        '/',
        '/settings.js',
        '/settings.css',
        '/llm.txt',
        '/favicon.ico',
        '/favicon.png',
        '/favicon-32x32.png',
      ].includes(route!)
    ) {
      if (route === '/favicon.ico' || route === '/favicon.png' || route === '/favicon-32x32.png') {
        res.setHeader('content-type', 'image/png');
        res.setHeader('cache-control', 'public, max-age=86400');
        res.end(FAVICON_BUFFER);
        return true;
      }
      res.setHeader(
        'content-type',
        route === '/'
          ? 'text/html; charset=utf-8'
          : route === '/settings.js'
            ? 'text/javascript'
            : route === '/settings.css'
              ? 'text/css'
              : 'text/plain; charset=utf-8',
      );
      res.end(
        route === '/'
          ? HTML
          : route === '/settings.js'
            ? SCRIPT
            : route === '/settings.css'
              ? STYLE
              : getLlmTxt(),
      );
      return true;
    }
    if (req.method === 'POST' && req.headers.origin !== expected)
      throw new HttpError(403, 'ORIGIN_REJECTED');
    if (req.method === 'POST' && route === '/api/session') {
      const body = (await readJsonBody(req, 4096)) as { token?: unknown };
      const session = typeof body?.token === 'string' ? sessions.exchange(body.token) : null;
      if (!session)
        throw new HttpError(401, 'BOOTSTRAP_EXPIRED', 'Open settings again with aevra-browser ui');
      res.setHeader(
        'set-cookie',
        `aevra_browser_ui=${session.cookie}; Path=/; HttpOnly; SameSite=Strict`,
      );
      sendJson(res, 200, { csrf: session.csrf });
      return true;
    }
    const session = sessions.authenticate(req.headers.cookie);
    if (!session)
      throw new HttpError(401, 'UI_LOGIN_REQUIRED', 'Open settings with aevra-browser ui');
    if (req.method === 'GET' && route === '/api/settings') {
      sendJson(res, 200, { snapshot: await actions.snapshot(), csrf: session.csrf });
    } else if (req.method === 'POST' && route === '/api/action') {
      if (req.headers['x-aevra-csrf'] !== session.csrf) throw new HttpError(403, 'CSRF_REJECTED');
      sendJson(res, 200, await actions.mutate(await readJsonBody(req, 16 * 1024)));
    } else throw new HttpError(405, 'METHOD_NOT_ALLOWED');
  } catch (error) {
    sendError(res, error);
  }
  return true;
}
