import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { manageAgent } from '../shared/aevra/packages/agent-integration/src/manage.js';
import {
  parseAgentCommand,
  type AgentCommand,
} from '../shared/aevra/packages/agent-integration/src/command.js';
import {
  runStdio,
  type StdioTransport,
} from '../shared/aevra/packages/agent-integration/src/stdio.js';
import {
  httpTransport,
  readCredential,
} from '../shared/aevra/packages/agent-integration/src/stdio-http.js';
import { ClientCredentials } from './daemon/client-credentials.js';
import { ensureDaemon, liveLock, spawnDaemonProcess } from './bridge/stdio-bridge.js';
import { resolvePaths, type Paths } from './paths.js';
import {
  prepareStatePurge,
  tryMarkStateDirectory,
} from '../shared/aevra/packages/agent-integration/src/cleanup.js';
import {
  previewRelease,
  releaseExtensionOrKeep,
} from '../shared/aevra/packages/agent-integration/src/shared-extension.js';

/** Process boundaries, replaceable in tests. */
export interface AgentCliDeps {
  fetch: typeof fetch;
  spawnDaemon(env?: NodeJS.ProcessEnv): void;
  home: string;
}

const defaults = (): AgentCliDeps => ({
  fetch,
  spawnDaemon: spawnDaemonProcess,
  home: os.homedir(),
});

export async function manageBrowserAgent(
  command: AgentCommand,
  paths: Paths,
  home = os.homedir(),
  env: NodeJS.ProcessEnv = process.env,
) {
  // `agent install` is often the first command to write state: mark the folder before it does,
  // so a later purge knows these files are Browser's own.
  if (command.operation === 'install' && !command.dryRun) {
    const problem = tryMarkStateDirectory(
      paths.stateDir,
      'aevra-browser',
      home,
      paths.isDefaultStateDir ?? false,
    );
    if (problem) console.warn(`aevra-browser: ${problem}`);
  }
  return manageAgent({
    ...command,
    home,
    env,
    product: 'aevra-browser',
    stateDir: paths.stateDir,
    executable: process.execPath,
    entrypoint: fileURLToPath(new URL('./cli.js', import.meta.url)),
    endpoint: `http://127.0.0.1:${paths.ports.mcp}/mcp`,
    credentials: new ClientCredentials(paths.stateDir),
  });
}

/** Stops a running daemon and waits until its lock is no longer live. */
export async function stopDaemon(paths: Paths, deps: AgentCliDeps): Promise<void> {
  const bridge = { paths, fetch: deps.fetch, spawnDaemon: () => deps.spawnDaemon() };
  const info = await liveLock(bridge);
  if (!info) return;
  const response = await deps.fetch(`http://127.0.0.1:${info.ports.mcp}/shutdown`, {
    method: 'POST',
    headers: { authorization: `Bearer ${info.mcpToken}` },
  });
  if (!response.ok) throw new Error('BROWSER_STOP_FAILED');
  for (let i = 0; i < 40 && (await liveLock(bridge)); i++)
    await new Promise((resolve) => setTimeout(resolve, 100));
  if (await liveLock(bridge)) throw new Error('STATE_PURGE_BUSY');
}

async function uninstall(args: string[], paths: Paths, deps: AgentCliDeps): Promise<number> {
  if (args.slice(1).some((arg) => !['--purge', '--dry-run'].includes(arg)))
    throw new Error('Usage: aevra-browser uninstall [--purge] [--dry-run]');
  const dryRun = args.includes('--dry-run'),
    purge = args.includes('--purge');
  // Ownership is checked first, so a refused purge changes nothing at all.
  const statePurge = purge ? prepareStatePurge(paths.stateDir, 'aevra-browser', deps.home) : null;
  const integrations = await manageBrowserAgent(
    { operation: 'uninstall', target: 'all', transport: 'stdio', dryRun },
    paths,
    deps.home,
  );
  if (statePurge && !dryRun) await stopDaemon(paths, deps);
  // The extension is released first: a copy root Aevra still owns stays, even in stateDir.
  const extension = dryRun
    ? previewRelease(deps.home, 'aevra-browser', purge)
    : releaseExtensionOrKeep(deps.home, 'aevra-browser', purge);
  const keep = extension.retained ? [extension.retained] : [];
  const state = statePurge && (dryRun ? statePurge.preview(keep) : statePurge.run(keep));
  console.log(
    JSON.stringify(
      {
        integrations,
        extension,
        ...(state ? { state } : {}),
        message: 'Use your package manager to remove the npm package if desired.',
      },
      null,
      2,
    ),
  );
  return 0;
}

/**
 * The transport behind `mcp --credential-file`: it starts the daemon if needed and connects to
 * the live daemon's port with the saved token, so a port change does not break the agent.
 */
export async function credentialTransport(
  file: string,
  deps: AgentCliDeps = defaults(),
): Promise<StdioTransport> {
  const credential = readCredential(file);
  const stateDir = path.dirname(path.dirname(path.resolve(file)));
  const env = { ...process.env, AEVRA_BROWSER_HOME: stateDir };
  const info = await ensureDaemon({
    paths: resolvePaths(env),
    fetch: deps.fetch,
    spawnDaemon: () => deps.spawnDaemon(env),
  });
  if (!info) throw new Error('BROWSER_DAEMON_UNAVAILABLE: run aevra-browser serve');
  return httpTransport({ ...credential, endpoint: `http://127.0.0.1:${info.ports.mcp}/mcp` });
}

export async function runBrowserAgentCli(
  args: string[],
  paths: Paths,
  deps: AgentCliDeps = defaults(),
): Promise<number | null> {
  if (args[0] === 'uninstall') return uninstall(args, paths, deps);
  if (args[0] === 'agent') {
    console.log(
      JSON.stringify(
        await manageBrowserAgent(parseAgentCommand(args.slice(1)), paths, deps.home),
        null,
        2,
      ),
    );
    return 0;
  }
  if (args[0] === 'mcp' && args.length > 1) {
    if (args.length !== 3 || args[1] !== '--credential-file')
      throw new Error('Usage: aevra-browser mcp --credential-file <file>');
    return runStdio(
      { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
      await credentialTransport(args[2], deps),
    );
  }
  return null;
}
