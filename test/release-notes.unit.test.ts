import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(root, 'scripts', 'release-notes.mjs');

const CHANGELOG = `# Changelog

## [0.2.0] - 2026-11-01

### Added

- Second thing.

## [0.1.0] - 2026-10-20

### Added

- First thing.
`;

function notesFor(tag: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'aevra-browser-notes-'));
  try {
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@scope/pkg' }));
    writeFileSync(path.join(dir, 'CHANGELOG.md'), CHANGELOG);
    const result = spawnSync(process.execPath, [script, tag, 'notes.md'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_REPOSITORY: 'owner/repo' },
    });
    const notes = result.status === 0 ? readFileSync(path.join(dir, 'notes.md'), 'utf8') : '';
    return { status: result.status, stderr: result.stderr, notes };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('release notes carry the changelog section and a compare link', () => {
  const { status, notes } = notesFor('v0.2.0');
  assert.equal(status, 0);
  assert.match(notes, /Second thing\./);
  assert.ok(!notes.includes('First thing.'));
  assert.match(notes, /https:\/\/github\.com\/owner\/repo\/compare\/v0\.1\.0\.\.\.v0\.2\.0/);
  assert.match(notes, /npx -y @scope\/pkg@0\.2\.0 extension install/);
});

test('the oldest version has no compare link', () => {
  const { status, notes } = notesFor('v0.1.0');
  assert.equal(status, 0);
  assert.match(notes, /First thing\./);
  assert.ok(!notes.includes('Full Changelog'));
});

test('an unknown version fails and lists what exists', () => {
  const { status, stderr } = notesFor('v9.9.9');
  assert.notEqual(status, 0);
  assert.match(stderr, /Version "9.9.9" not found/);
  assert.match(stderr, /0\.2\.0, 0\.1\.0/);
});
