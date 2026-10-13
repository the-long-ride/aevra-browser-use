import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Packs the package, installs it (cache preferred) into a temp dir and checks that every
// relative import under the installed dist resolves, so a vendor file missing
// from `files` fails here instead of on a user's machine.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = [
  join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  resolve(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  process.env.npm_execpath,
].find((candidate) => candidate && existsSync(candidate) && candidate.endsWith('npm-cli.js'));
assert.ok(npmCli, 'Cannot locate npm-cli.js');
const tempRoot = mkdtempSync(join(tmpdir(), 'aevra-browser-package-'));

function run(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
}

function walk(root, accept) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (accept(file)) files.push(file);
    }
  };
  visit(root);
  return files;
}

function missingRelativeImports(packageRoot) {
  const missing = new Set();
  for (const file of walk(join(packageRoot, 'dist'), (name) => name.endsWith('.js'))) {
    const source = readFileSync(file, 'utf8');
    const imports = /\b(?:from\s*|import\s*\(\s*|import\s*)(['"])(\.[^'"\n]+)\1/g;
    for (const match of source.matchAll(imports)) {
      const target = resolve(dirname(file), match[2]);
      if (!existsSync(target)) missing.add(relative(packageRoot, target));
    }
  }
  return [...missing].sort();
}

try {
  const packed = JSON.parse(
    run(process.execPath, [
      npmCli,
      'pack',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      tempRoot,
    ]),
  )[0];
  const installRoot = join(tempRoot, 'install');
  run(process.execPath, [
    npmCli,
    'install',
    '--prefix',
    installRoot,
    join(tempRoot, packed.filename),
    '--ignore-scripts',
    '--prefer-offline',
    '--no-audit',
    '--no-fund',
  ]);

  const packageRoot = join(installRoot, 'node_modules', '@the-long-ride', 'aevra-browser');
  const missingImports = missingRelativeImports(packageRoot);
  assert.deepEqual(missingImports, [], `Missing packaged imports:\n${missingImports.join('\n')}`);

  const stray = walk(packageRoot, () => true)
    .map((file) => relative(packageRoot, file).replaceAll('\\', '/'))
    .filter((file) => /(^|\/)tests?\//.test(file) || file.endsWith('.map'));
  assert.deepEqual(stray, [], `Test or map files were packed:\n${stray.join('\n')}`);

  const installedManifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  assert.deepEqual(
    Object.keys(installedManifest.dependencies ?? {}).sort(),
    ['jsonc-parser', 'smol-toml'],
    'the package runtime dependencies must be exactly the two config-format parsers',
  );
  for (const name of ['jsonc-parser', 'smol-toml'])
    assert.ok(
      existsSync(join(installRoot, 'node_modules', name, 'package.json')),
      name + ' was not installed with the package',
    );
  const cli = join(packageRoot, installedManifest.bin['aevra-browser']);
  const version = spawnSync(process.execPath, [cli, '--version'], {
    cwd: installRoot,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
  assert.ifError(version.error);
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), installedManifest.version);

  // The daemon-free path end to end: argument parsing, state-dir resolution and
  // the lock probe, all through the installed vendor closure.
  const status = spawnSync(process.execPath, [cli, 'status', '--json'], {
    cwd: installRoot,
    env: { ...process.env, AEVRA_BROWSER_HOME: join(tempRoot, 'state') },
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
  assert.equal(status.status, 0, status.stderr);
  assert.deepEqual(JSON.parse(status.stdout), { running: false });

  console.log(
    `OK: packed aevra-browser ${installedManifest.version}: no missing imports; CLI starts.`,
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
