import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Builds GitHub release notes from the CHANGELOG.md section for a tag, e.g.
// `node scripts/release-notes.mjs v1.0.0 release-notes.md`.

export function tagToVersion(tag) {
  return String(tag ?? '')
    .replace(/^refs\/tags\//, '')
    .trim()
    .replace(/^v/, '');
}

export function parseChangelogSections(content) {
  const header = /^##\s+\[?v?([0-9A-Za-z.-]+)\]?(?:\s*-\s*([^\n\r]*))?$/gm;
  const found = [...content.matchAll(header)];
  return found.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = found[index + 1]?.index ?? content.length;
    return {
      version: match[1],
      body: content.slice(start, end).trim(),
      previous: found[index + 1]?.[1] ?? null,
    };
  });
}

export function generateReleaseNotes({
  tag,
  changelog,
  packageName = '@the-long-ride/aevra-browser',
  repoUrl = 'https://github.com/the-long-ride/aevra-browser',
}) {
  const version = tagToVersion(tag);
  const sections = parseChangelogSections(changelog);
  const section = sections.find((entry) => entry.version === version);
  if (!section) {
    throw new Error(
      `Version "${version}" not found in CHANGELOG.md. Found: ${sections.map((s) => s.version).join(', ')}`,
    );
  }
  const parts = [
    `**npm**: https://www.npmjs.com/package/${packageName}`,
    '',
    '```bash',
    `npx -y ${packageName}@${version} extension install`,
    '```',
    '',
    '---',
    '',
    section.body,
  ];
  if (section.previous) {
    parts.push(
      '',
      '---',
      `**Full Changelog**: ${repoUrl}/compare/v${section.previous}...v${version}`,
    );
  }
  return `${parts.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [tag, output] = process.argv.slice(2);
  const root = process.cwd();
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const notes = generateReleaseNotes({
    tag: tag || process.env.GITHUB_REF_NAME || `v${manifest.version}`,
    changelog: readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'),
    packageName: manifest.name,
    repoUrl: process.env.GITHUB_REPOSITORY
      ? `https://github.com/${process.env.GITHUB_REPOSITORY}`
      : undefined,
  });
  if (output) writeFileSync(path.resolve(root, output), notes);
  else process.stdout.write(notes);
}
