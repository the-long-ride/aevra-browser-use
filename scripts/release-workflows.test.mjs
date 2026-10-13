import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

const ci = readFileSync('.github/workflows/ci.yml', 'utf8').replaceAll('\r\n', '\n');
const release = readFileSync('.github/workflows/release.yml', 'utf8').replaceAll('\r\n', '\n');

test('CI builds pushes/PRs/manual runs and releases test/package the resolved tag SHA', () => {
  for (const trigger of ['push', 'pull_request', 'workflow_dispatch', 'workflow_call'])
    assert.match(ci, new RegExp(`^  ${trigger}:`, 'm'));
  assert.match(release, /workflow_dispatch:/);
  assert.match(release, /v\*\.\*\.\*/);
  assert.match(release, /release-sha:.*steps\.target\.outputs\.release-sha/);
  assert.match(release, /uses: \.\/\.github\/workflows\/ci.yml/);
  assert.match(release, /ref:.*needs\.resolve\.outputs\.release-sha/);
  assert.match(release, /needs:.*(?:resolve|ci)/);
  assert.match(release, /node scripts\/release-target.mjs/);
  assert.match(release, /  ci:\n    needs: resolve/);
  assert.match(release, /needs: \[resolve, ci\]/);
  if (release.includes('  publish:')) assert.match(release, /needs: \[resolve, package\]/);
  for (const step of ci.matchAll(/uses: actions\/checkout@v6\s+with:([\s\S]*?)(?=\n\s+- |$)/g))
    assert.match(step[1], /ref:.*inputs\.ref \|\| github\.sha/);
  assert.doesNotMatch(release, /pull_request_target/);
  for (const text of [ci, release]) {
    for (const use of text.matchAll(/uses:\s+(actions\/[^\s]+)@(\S+)/g))
      assert.equal(use[2], 'v6', use[1]);
    for (const version of text.matchAll(/node-version:\s*['"]?([^'"\s]+)/g))
      assert.equal(version[1], '24');
  }
  assert.equal(readFileSync('.node-version', 'utf8').trim(), '24');
});

test('release target validates an existing versioned tag and emits its exact commit', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'aevra-release-'));
  t.after(() => {
    assert.ok(resolve(dir).startsWith(join(resolve(tmpdir()), 'aevra-release-')));
    rmSync(dir, { recursive: true, force: true });
  });
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  git('init', '-q');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Release fixture');
  git('add', 'package.json');
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
  git('tag', 'v1.0.0');
  const script = resolve('scripts/release-target.mjs');
  const output = join(dir, 'outputs');
  const run = (tag) =>
    spawnSync(process.execPath, [script, tag], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, RELEASE_TAG: tag, GITHUB_OUTPUT: output },
    });
  const valid = run('v1.0.0');
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(readFileSync(output, 'utf8'), new RegExp(`release-sha=${git('rev-parse', 'HEAD')}`));
  assert.match(readFileSync(output, 'utf8'), /release-tag=v1.0.0/);
  for (const tag of ['main', 'v1.0.0;echo unsafe', 'v1.0.1'])
    assert.notEqual(run(tag).status, 0, tag);
  git('tag', 'v2.0.0');
  assert.notEqual(run('v2.0.0').status, 0);
  // Desktop uses workspace metadata and permits a prerelease of the same base version.
  rmSync(join(dir, 'package.json'));
  writeFileSync(join(dir, 'Cargo.toml'), '[workspace.package]\nversion = "1.0.0"\n');
  assert.notEqual(run('v1.0.0-rc.2').status, 0, 'refuse a missing tag with matching Cargo version');
  git('tag', 'v1.0.0-rc.1');
  assert.equal(run('v1.0.0-rc.1').status, 0);
  git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'another commit');
  assert.notEqual(run('v1.0.0-rc.1').status, 0, 'refuse a checkout different from the tag SHA');
});
