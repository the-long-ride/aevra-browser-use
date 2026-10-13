import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export { SCRIPT } from './script.js';
export { STYLE } from './style.js';
export { HTML, FAVICON_BUFFER, FAVICON_PNG_BASE64 } from './html.js';

export function getLlmTxt(): string {
  const candidates = [
    path.resolve(import.meta.dirname, '../../llm.txt'),
    path.resolve(import.meta.dirname, '../../../llm.txt'),
    path.resolve(process.cwd(), 'llm.txt'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
  }
  return '# Aevra Browser\n\nArchitecture & Usage Guide for AI Assistants (llm.txt)';
}
