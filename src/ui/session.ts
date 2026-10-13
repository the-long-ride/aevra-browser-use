import { randomBytes, createHash } from 'node:crypto';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');

export class UiSessions {
  private bootstraps = new Map<string, number>();
  private sessions = new Map<string, { expires: number; csrf: string }>();

  constructor(private now = Date.now) {}

  private sweep(): void {
    for (const [key, expires] of this.bootstraps)
      if (expires <= this.now()) this.bootstraps.delete(key);
    for (const [key, value] of this.sessions)
      if (value.expires <= this.now()) this.sessions.delete(key);
  }

  bootstrap(): string {
    this.sweep();
    if (this.bootstraps.size >= 32) this.bootstraps.delete(this.bootstraps.keys().next().value!);
    const token = secret();
    this.bootstraps.set(hash(token), this.now() + 60_000);
    return token;
  }

  exchange(token: string): { cookie: string; csrf: string } | null {
    this.sweep();
    if (!this.bootstraps.delete(hash(token))) return null;
    if (this.sessions.size >= 32) this.sessions.delete(this.sessions.keys().next().value!);
    const cookie = secret();
    const csrf = secret();
    this.sessions.set(hash(cookie), { csrf, expires: this.now() + 8 * 60 * 60_000 });
    return { cookie, csrf };
  }

  authenticate(cookie: string | undefined): { csrf: string } | null {
    this.sweep();
    const token = cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('aevra_browser_ui='))
      ?.slice(17);
    return token ? (this.sessions.get(hash(token)) ?? null) : null;
  }
}
