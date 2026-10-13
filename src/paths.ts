import os from 'node:os';
import path from 'node:path';
import { readConfigLenient } from './config.js';

export interface Ports {
  pair: number;
  mcp: number;
  ws: number;
  cdp: number;
}

export interface Paths {
  stateDir: string;
  lockFile: string;
  tokenKeyFile: string;
  pairingsFile: string;
  extensionDir: string;
  ports: Ports;
  /** True when the state directory is the platform default, however it was named. */
  isDefaultStateDir?: boolean;
  /** True when extensionDir was saved or set in the environment. */
  extensionDirExplicit?: boolean;
  /** Set when config.json is unusable or collides with the environment. */
  configProblem?: string;
}

type Env = Record<string, string | undefined>;

const PORT_ENV = {
  pair: ['AEVRA_BROWSER_PAIR_PORT', 47841],
  mcp: ['AEVRA_BROWSER_MCP_PORT', 47842],
  ws: ['AEVRA_BROWSER_WS_PORT', 47843],
  cdp: ['AEVRA_BROWSER_CDP_PORT', 9222],
} as const;

function readPort(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`INVALID_PORT: ${name}`);
  }
  return value;
}

function defaultStateDir(env: Env, platform: NodeJS.Platform, home: string): string {
  const p = platform === 'win32' ? path.win32 : path.posix;
  if (platform === 'win32') {
    const base = env.LOCALAPPDATA || p.join(home, 'AppData', 'Local');
    return p.join(base, 'aevra-browser');
  }
  if (platform === 'darwin') return p.join(home, 'Library', 'Application Support', 'aevra-browser');
  const base = env.XDG_STATE_HOME || p.join(home, '.local', 'state');
  return p.join(base, 'aevra-browser');
}

// Compared by path, not by whether AEVRA_BROWSER_HOME is set: an agent's
// `mcp --credential-file` names the default folder explicitly when it starts the daemon.
function isDefault(stateDir: string, env: Env, platform: NodeJS.Platform, home: string): boolean {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const fold = (value: string) => {
    const resolved = p.resolve(value).replace(/[\\/]+$/, '');
    return platform === 'win32' || platform === 'darwin' ? resolved.toLowerCase() : resolved;
  };
  return fold(stateDir) === fold(defaultStateDir(env, platform, home));
}

export function resolvePaths(
  env: Env = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir(),
): Paths {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const stateDir = env.AEVRA_BROWSER_HOME || defaultStateDir(env, platform, home);
  for (const [key, fallback] of Object.values(PORT_ENV)) readPort(env, key, fallback);
  // A broken or colliding file must not lock the user out of the commands that repair it.
  const { config: snapshot, problem: configProblem } = readConfigLenient(stateDir, env);
  const config = snapshot.effective;
  return {
    stateDir,
    lockFile: p.join(stateDir, 'daemon.lock'),
    tokenKeyFile: p.join(stateDir, 'token.key'),
    pairingsFile: p.join(stateDir, 'pairings.json'),
    extensionDir: config.extensionDir || p.join(stateDir, 'extension'),
    ports: {
      pair: readPort(env, PORT_ENV.pair[0], config.pairPort),
      mcp: readPort(env, PORT_ENV.mcp[0], config.mcpPort),
      ws: readPort(env, PORT_ENV.ws[0], config.wsPort),
      cdp: readPort(env, PORT_ENV.cdp[0], config.cdpPort),
    },
    isDefaultStateDir: isDefault(stateDir, env, platform, home),
    extensionDirExplicit: Boolean(config.extensionDir),
    ...(configProblem ? { configProblem } : {}),
  };
}
