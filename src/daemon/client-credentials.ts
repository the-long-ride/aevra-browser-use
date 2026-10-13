import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { atomicWrite } from '../config.js';

interface ClientRecord {
  id: string;
  name: string;
  verifier: string;
}
const digest = (value: string) => createHash('sha256').update(value).digest();

export class ClientCredentials {
  private file: string;
  constructor(stateDir: string) {
    this.file = path.join(stateDir, 'client-credentials.json');
  }

  private read(): ClientRecord[] {
    if (!existsSync(this.file)) return [];
    const value = JSON.parse(readFileSync(this.file, 'utf8'));
    if (value.version !== 1 || !Array.isArray(value.clients))
      throw new Error('CLIENT_CREDENTIAL_STORE_INVALID');
    return value.clients;
  }

  async create(name: string) {
    const token = randomBytes(32).toString('base64url');
    const record = { id: randomUUID(), name, verifier: digest(token).toString('hex') };
    atomicWrite(
      this.file,
      JSON.stringify({ version: 1, clients: [...this.read(), record] }) + '\n',
    );
    return { id: record.id, token };
  }

  verify(token: string): boolean {
    const candidate = digest(token);
    return this.read().some(
      (record) =>
        /^[a-f0-9]{64}$/.test(record.verifier) &&
        timingSafeEqual(candidate, Buffer.from(record.verifier, 'hex')),
    );
  }

  async revoke(id: string): Promise<void> {
    atomicWrite(
      this.file,
      JSON.stringify({ version: 1, clients: this.read().filter((record) => record.id !== id) }) +
        '\n',
    );
  }
}
