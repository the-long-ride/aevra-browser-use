import { readFileSync } from 'node:fs';

/** Read from the package manifest two levels above `dist/src` (and `.test-dist/src`). */
export const VERSION: string = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;
