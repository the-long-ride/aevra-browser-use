import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const DEFAULT_CONFIG = {
  pairPort: 47841,
  mcpPort: 47842,
  wsPort: 47843,
  cdpPort: 9222,
  extensionDir: '',
  idleTimeout: 30,
};
export type Config = typeof DEFAULT_CONFIG;
export type ConfigKey = keyof Config;
type Env = Record<string, string | undefined>;
const ENV_KEYS: Record<ConfigKey, string> = {
  pairPort: 'AEVRA_BROWSER_PAIR_PORT',
  mcpPort: 'AEVRA_BROWSER_MCP_PORT',
  wsPort: 'AEVRA_BROWSER_WS_PORT',
  cdpPort: 'AEVRA_BROWSER_CDP_PORT',
  extensionDir: 'AEVRA_BROWSER_EXTENSION_DIR',
  idleTimeout: 'AEVRA_BROWSER_IDLE_TIMEOUT',
};

export function configKey(key: string): ConfigKey {
  if (!Object.hasOwn(DEFAULT_CONFIG, key)) throw new Error(`CONFIG_KEY_UNKNOWN: ${key}`);
  return key as ConfigKey;
}

function validate(input: Record<string, unknown>): Partial<Config> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    configKey(key);
    if (key === 'extensionDir') {
      if (typeof value !== 'string' || value.includes('\0') || (value && !path.isAbsolute(value)))
        throw new Error('CONFIG_INVALID: extensionDir must be an absolute path');
      result[key] = value;
    } else if (key === 'idleTimeout') {
      const minutes = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
      if (
        typeof minutes !== 'number' ||
        !Number.isInteger(minutes) ||
        minutes < 0 ||
        minutes > 525600
      )
        throw new Error(
          'CONFIG_INVALID: idleTimeout must be an integer >= 0 (minutes, 0 to disable)',
        );
      result[key] = minutes;
    } else {
      const port = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
      if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error(`CONFIG_INVALID: ${key} must be a port from 1 to 65535`);
      result[key] = port;
    }
  }
  return result;
}

const COLLISION = 'CONFIG_INVALID: ports must be distinct';

function noCollisions(config: Config): void {
  const listeners = [config.pairPort, config.mcpPort, config.wsPort, config.cdpPort];
  if (new Set(listeners).size !== listeners.length) throw new Error(COLLISION);
}

function savedConfig(stateDir: string): Partial<Config> {
  const file = path.join(stateDir, 'config.json');
  if (!existsSync(file)) return {};
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (
      value.version !== 1 ||
      !value.settings ||
      typeof value.settings !== 'object' ||
      Array.isArray(value.settings)
    )
      throw new Error('Unsupported schema');
    return validate(value.settings);
  } catch (error) {
    throw new Error(`CONFIG_INVALID: ${file}: ${(error as Error).message}`);
  }
}

function environmentSettings(env: Env): Partial<Config> {
  const environment: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_CONFIG) as ConfigKey[]) {
    const value = env[ENV_KEYS[key]];
    if (value !== undefined && value !== '') environment[key] = value;
  }
  return validate(environment);
}

/**
 * `useSaved: false` ignores config.json; an object is used in its place. Both serve
 * the fallbacks in `readConfigLenient`.
 */
export function readConfig(
  stateDir: string,
  env: Env = process.env,
  flags: Partial<Config> = {},
  useSaved: boolean | Partial<Config> = true,
) {
  const saved = useSaved === true ? savedConfig(stateDir) : useSaved || {};
  const effective: Config = { ...DEFAULT_CONFIG, ...saved };
  const sources = Object.fromEntries(
    Object.keys(DEFAULT_CONFIG).map((k) => [k, Object.hasOwn(saved, k) ? 'saved' : 'default']),
  ) as Record<ConfigKey, string>;
  const environment = environmentSettings(env);
  for (const key of Object.keys(environment) as ConfigKey[]) sources[key] = 'environment';
  Object.assign(effective, environment, validate(flags));
  for (const key of Object.keys(flags) as ConfigKey[]) sources[key] = 'flag';
  noCollisions(effective);
  return { version: 1, saved, effective, sources };
}

export type ConfigSnapshot = ReturnType<typeof readConfig>;

/**
 * Never fails on config.json, so the commands and the page that repair it keep working.
 * A saved port that collides with an environment override drops only the colliding saved
 * ports; a broken file falls back to defaults. `problem` says which happened and what to do.
 * An environment that collides with itself still throws: no saved value can fix that.
 */
export function readConfigLenient(
  stateDir: string,
  env: Env = process.env,
): { config: ConfigSnapshot; problem?: string } {
  try {
    return { config: readConfig(stateDir, env) };
  } catch (error) {
    const message = (error as Error).message;
    if (!message.startsWith('CONFIG_INVALID')) throw error;
    let saved: Partial<Config> | null = null;
    try {
      saved = savedConfig(stateDir);
    } catch {
      // The file itself is unreadable: handled below.
    }
    if (saved && message === COLLISION) {
      const overridden = new Set(Object.values(environmentSettings(env)));
      const kept = Object.fromEntries(
        Object.entries(saved).filter(
          ([key, value]) =>
            key === 'extensionDir' || key === 'idleTimeout' || !overridden.has(value),
        ),
      ) as Partial<Config>;
      const ignored = Object.keys(saved).filter((key) => !Object.hasOwn(kept, key));
      return {
        config: readConfig(stateDir, env, {}, kept),
        problem:
          `${message}: saved ${ignored.join(', ') || 'ports'} collide with environment overrides and are ignored. ` +
          'Choose another port with `aevra-browser config set <key> <port>`.',
      };
    }
    const previous = path.join(stateDir, 'config.previous.json');
    const restore = existsSync(previous) ? `Restore ${previous} as config.json, or run` : 'Run';
    return {
      config: readConfig(stateDir, env, {}, false),
      problem: `${message}. Running on defaults. ${restore} \`aevra-browser config reset <key>\` to write a new file.`,
    };
  }
}

export function atomicWrite(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, text, { mode: 0o600, flag: 'wx' });
    renameSync(temp, file);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

/**
 * Saves `changes`. Collisions are checked against the environment the daemon will
 * really run with. A broken config.json can still be repaired here; it is not copied
 * over config.previous.json, which keeps the last valid snapshot.
 */
export function updateConfig(
  stateDir: string,
  changes: Record<string, unknown>,
  env: Env = process.env,
) {
  let current: Partial<Config> = {};
  let broken = false;
  try {
    current = savedConfig(stateDir);
  } catch {
    broken = true;
  }
  const saved: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(changes)) {
    configKey(key);
    if (value === null) delete saved[key];
    else Object.assign(saved, validate({ [key]: value }));
  }
  noCollisions({ ...DEFAULT_CONFIG, ...validate(saved), ...environmentSettings(env) });
  const file = path.join(stateDir, 'config.json');
  if (existsSync(file) && !broken)
    atomicWrite(path.join(stateDir, 'config.previous.json'), readFileSync(file, 'utf8'));
  atomicWrite(file, `${JSON.stringify({ version: 1, settings: saved }, null, 2)}\n`);
  return readConfig(stateDir, env);
}
