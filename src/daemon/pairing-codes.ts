import { randomInt } from 'node:crypto';

// Crockford-style: no I, L, O or U, so a code read off a screen is unambiguous.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 8;
export const CODE_TTL_MS = 5 * 60_000;

export class PairingCodes {
  private pending: { code: string; expiresAt: number } | null = null;

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly random: (max: number) => number = randomInt,
  ) {}

  /** Issuing a new code invalidates any outstanding one: at most one is live. */
  create(): { code: string; expiresAt: string } {
    let code = '';
    for (let index = 0; index < LENGTH; index += 1) code += ALPHABET[this.random(ALPHABET.length)];
    const expiresAt = this.now() + CODE_TTL_MS;
    this.pending = { code, expiresAt };
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }

  /**
   * Consumes up front, so a wrong guess burns the live code instead of leaving
   * it available for the next attempt.
   */
  consume(code: string): boolean {
    const pending = this.pending;
    this.pending = null;
    if (!pending || pending.expiresAt <= this.now()) return false;
    return pending.code === String(code ?? '').toUpperCase();
  }
}
