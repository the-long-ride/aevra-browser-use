import type { Paths, Ports } from './paths.js';

export type StartupPorts = Partial<Pick<Ports, 'pair' | 'mcp' | 'ws'>>;
const FLAGS: Record<string, keyof StartupPorts | 'base'> = {
  basePort: 'base',
  'ui-port': 'pair',
  up: 'pair',
  'mcp-port': 'mcp',
  mp: 'mcp',
  'ws-port': 'ws',
  wp: 'ws',
};
const ENV = {
  pair: 'AEVRA_BROWSER_PAIR_PORT',
  mcp: 'AEVRA_BROWSER_MCP_PORT',
  ws: 'AEVRA_BROWSER_WS_PORT',
};

export function extractStartupPorts(argv: string[]) {
  const args: string[] = [];
  const found = new Map<keyof StartupPorts | 'base', number>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
    const key = arg.startsWith('--') && Object.hasOwn(FLAGS, name!) ? FLAGS[name!] : undefined;
    if (!key) {
      args.push(arg);
      continue;
    }
    if (
      !['serve', 'mcp', 'pair', 'cdp', 'ui'].includes(argv[0] ?? '') &&
      !(argv[0] === 'agent' && argv[1] === 'install')
    )
      throw new Error(`--${name} is only supported by daemon startup commands and agent install`);
    if (found.has(key)) throw new Error(`duplicate listener option --${name}`);
    const raw = inline ?? argv[++i];
    if (raw === undefined || raw.startsWith('--')) throw new Error(`--${name} needs a value`);
    const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(value) || value < 1 || value > 65535)
      throw new Error(`--${name} must be an integer from 1 to 65535`);
    found.set(key, value);
  }
  if (!found.size) return { args, ports: undefined };
  const base = found.get('base');
  if (base !== undefined && found.size > 1)
    throw new Error('cannot combine --basePort with individual listener options');
  if (base !== undefined && base > 65533) throw new Error('--basePort must be at most 65533');
  const ports: StartupPorts =
    base === undefined ? Object.fromEntries(found) : { pair: base, mcp: base + 1, ws: base + 2 };
  if (new Set(Object.values(ports)).size !== Object.values(ports).length)
    throw new Error('listener ports must be distinct');
  return { args, ports };
}

export function portEnvironment(env: NodeJS.ProcessEnv, ports: StartupPorts): NodeJS.ProcessEnv {
  const result = { ...env };
  for (const key of Object.keys(ENV) as (keyof StartupPorts)[])
    if (ports[key] !== undefined) result[ENV[key]] = String(ports[key]);
  return result;
}

export function withStartupPorts(paths: Paths, ports?: StartupPorts): Paths {
  if (!ports) return paths;
  const resolved = { ...paths.ports, ...ports };
  const listeners = [resolved.pair, resolved.mcp, resolved.ws].filter((port) => port !== 0);
  if (new Set(listeners).size !== listeners.length)
    throw new Error('listener ports must be distinct');
  return { ...paths, ports: resolved, startupPorts: ports };
}

export function assertRequestedPorts(paths: Paths, actual: Ports): void {
  for (const key of Object.keys(paths.startupPorts ?? {}) as (keyof StartupPorts)[]) {
    if (paths.startupPorts![key] !== actual[key])
      throw new Error(
        `BROWSER_PORT_MISMATCH: running daemon uses ${key} port ${actual[key]}, requested ${paths.startupPorts![key]}. Run aevra-browser stop, then retry with the desired listener options.`,
      );
  }
}

export function startupPortArgs(ports: StartupPorts = {}): string[] {
  const flags = { pair: 'ui-port', mcp: 'mcp-port', ws: 'ws-port' };
  return (Object.keys(ports) as (keyof StartupPorts)[]).map(
    (key) => `--${flags[key]}=${ports[key]}`,
  );
}
