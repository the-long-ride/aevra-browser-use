import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAgentCommand } from '../shared/aevra/packages/agent-integration/src/command.js';
import {
  foldsCase,
  loosePath,
  projectKeyMatch,
  resolveClaudeProjectKey,
  rootKey,
} from '../shared/aevra/packages/agent-integration/src/claude-project-key.js';
import { AGENT_TARGETS } from '../shared/aevra/packages/agent-integration/src/types.js';

test('agent command parsing accepts each operation with its own flags', () => {
  const target = AGENT_TARGETS[0];
  assert.deepEqual(parseAgentCommand(['status']), {
    operation: 'status',
    target: 'all',
    transport: 'stdio',
    dryRun: false,
  });
  assert.equal(parseAgentCommand(['status', '--json', target]).target, target);
  assert.deepEqual(parseAgentCommand(['install', target, '--transport', 'http', '--dry-run']), {
    operation: 'install',
    target,
    transport: 'http',
    dryRun: true,
  });
  assert.equal(parseAgentCommand(['uninstall', 'all', '--dry-run']).dryRun, true);
});

test('agent command parsing rejects unsupported combinations', () => {
  const target = AGENT_TARGETS[0];
  assert.throws(() => parseAgentCommand([]), /requires install, uninstall or status/);
  assert.throws(() => parseAgentCommand(['remove']), /requires install, uninstall or status/);
  assert.throws(() => parseAgentCommand(['install']), /requires a target or all/);
  assert.throws(() => parseAgentCommand(['install', target, 'all']), /Invalid agent argument/);
  assert.throws(
    () => parseAgentCommand(['install', target, '--transport', 'ftp']),
    /stdio or http/,
  );
  assert.throws(() => parseAgentCommand(['install', target, '--transport']), /stdio or http/);
  assert.throws(() => parseAgentCommand(['uninstall', target, '--transport', 'http']), /Invalid/);
  assert.throws(() => parseAgentCommand(['status', '--dry-run']), /Invalid agent argument/);
  assert.throws(() => parseAgentCommand(['install', 'unknown-agent']), /Invalid agent argument/);
});

test('path identity folds case and slashes only where the platform does', () => {
  assert.equal(foldsCase('win32'), true);
  assert.equal(foldsCase('darwin'), true);
  assert.equal(foldsCase('linux'), false);
  assert.equal(loosePath('F:\\Work\\Proj\\'), 'f:/work/proj');
  assert.equal(loosePath('F:\\'), 'f:/');
  assert.equal(loosePath('/'), '/');
  assert.equal(loosePath(''), '');
  assert.equal(rootKey('/Src/Proj', 'linux'), '/Src/Proj');
  assert.equal(rootKey('/Src/Proj', 'darwin'), '/src/proj');
  assert.equal(projectKeyMatch('F:\\Work\\', 'win32'), 'f:/work');
  assert.equal(projectKeyMatch('/Src/Proj/', 'darwin'), '/src/proj');
  assert.equal(projectKeyMatch('/Src/Proj/', 'linux'), '/Src/Proj');
  assert.equal(projectKeyMatch('/', 'linux'), '/');
});

test('claude project key reuses an existing spelling of the same folder', () => {
  const config = JSON.stringify({ projects: { 'F:/Work/Proj': {}, '/other': {} } });
  assert.equal(resolveClaudeProjectKey(config, 'F:/Work/Proj', 'win32'), 'F:/Work/Proj');
  assert.equal(resolveClaudeProjectKey(config, 'f:\\work\\proj', 'win32'), 'F:/Work/Proj');
  assert.equal(resolveClaudeProjectKey(config, '/Other/', 'linux'), '/Other');
  assert.equal(resolveClaudeProjectKey(config, '/other/', 'linux'), '/other');
  assert.equal(resolveClaudeProjectKey('', 'C:\\New\\', 'win32'), 'C:/New');
  assert.equal(resolveClaudeProjectKey('{ // comment\n}', '/new/', 'linux'), '/new');
  assert.equal(resolveClaudeProjectKey('{"projects": []}', '/new', 'linux'), '/new');
  assert.equal(resolveClaudeProjectKey('[1]', '/new', 'linux'), '/new');
});
