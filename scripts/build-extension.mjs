import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Builds the unmodified aevra extension with aevra's own packer, from the
// pinned submodule, and copies the zip to build/aevra-browser-extension.zip.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const aevra = join(root, 'vendor', 'aevra');
const shared = join(root, 'shared', 'aevra');
assert.ok(
  existsSync(join(aevra, 'package.json')),
  'vendor/aevra is missing: run `git submodule update --init`',
);

// npm is invoked through its own entry point under this Node, so no shell or
// .cmd shim is involved.
const npmCli = [
  join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  resolve(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  process.env.npm_execpath,
].find((candidate) => candidate && existsSync(candidate) && candidate.endsWith('npm-cli.js'));
assert.ok(npmCli, 'Cannot locate npm-cli.js');

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: aevra,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// The packer needs TypeScript and @types/chrome. Install scripts stay off so
// nothing from the dependency tree runs. Only install if not already present.
if (!existsSync(join(aevra, 'node_modules', '@types', 'chrome'))) {
  run([npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error']);
}
const sharedManifest = JSON.parse(readFileSync(join(root, 'shared/aevra-source.json'), 'utf8'));
// The snapshot must say which root release it came from (scripts/export-browser-shared.mjs).
assert.match(
  String(sharedManifest.rootVersion),
  /^\d+\.\d+\.\d+/,
  'shared/aevra-source.json has no rootVersion',
);
assert.ok(sharedManifest.rootCommit, 'shared/aevra-source.json has no rootCommit');
for (const [file, expected] of Object.entries(sharedManifest.files)) {
  const actual = createHash('sha256')
    .update(readFileSync(join(shared, file)))
    .digest('hex');
  assert.equal(actual, expected, `Shared source hash mismatch: ${file}`);
}
const packed = spawnSync(
  process.execPath,
  [
    join(shared, 'scripts/pack-extension.mjs'),
    '--typescript',
    join(root, 'node_modules/typescript/bin/tsc'),
    '--type-roots',
    join(aevra, 'node_modules/@types'),
  ],
  { cwd: shared, stdio: 'inherit', windowsHide: true },
);
assert.equal(packed.status, 0, 'Shared extension packaging failed');

const built = join(shared, 'apps', 'extension', 'build', 'aevra-extension.zip');
assert.ok(existsSync(built), `the packer did not produce ${built}`);
const outDir = join(root, 'build');
mkdirSync(outDir, { recursive: true });
const zip = join(outDir, 'aevra-browser-extension.zip');
copyFileSync(built, zip);
const digest = createHash('sha256').update(readFileSync(zip)).digest('hex');
writeFileSync(`${zip}.sha256`, `${digest}  aevra-browser-extension.zip\n`);
console.log(`[build-extension] ${zip}`);
console.log(`[build-extension] sha256 ${digest}`);
