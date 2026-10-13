import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.test-dist');
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

function collect(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(full));
    else if (entry.name.endsWith('.test.js')) files.push(full);
  }
  return files.sort();
}

rmSync(out, { recursive: true, force: true });
const compiled = spawnSync(
  process.execPath,
  [tsc, '-p', 'tsconfig.json', '--noEmit', 'false', '--outDir', out],
  { cwd: root, stdio: 'inherit' },
);
if (compiled.status !== 0) process.exit(compiled.status ?? 1);

const filter = process.argv[2];
const files = collect(path.join(out, 'test')).filter((file) => !filter || file.includes(filter));
if (files.length === 0) {
  console.error('[test] no test files found');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['--test', '--test-timeout=120000', ...files], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
