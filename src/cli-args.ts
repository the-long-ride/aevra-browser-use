export type Command =
  | {
      command: 'config';
      action: 'get' | 'set' | 'reset';
      key?: string;
      value?: string;
      json: boolean;
    }
  | { command: 'ui' }
  | { command: 'serve' }
  | { command: 'mcp' }
  | { command: 'pair' }
  | { command: 'unpair'; id?: string; all: boolean }
  | { command: 'status'; json: boolean; showToken: boolean }
  | { command: 'stop' }
  | { command: 'cdp'; port?: number }
  | { command: 'extension-install'; dir?: string; yes: boolean }
  | { command: 'version' }
  | { command: 'help' };

export const USAGE = `aevra-browser - browser control for MCP clients

Usage:
  aevra-browser agent install <codex|claude-code|opencode|antigravity|all> [--transport stdio|http] [--dry-run]
  aevra-browser agent uninstall <target|all> [--dry-run] | agent status [--json]
  aevra-browser uninstall [--purge] [--dry-run]
  aevra-browser config get [key] [--json] | set <key> <value> | reset <key>
  aevra-browser ui                          open authenticated local settings
  aevra-browser mcp                         stdio MCP server (what MCP clients launch)
  aevra-browser serve                       run the browser daemon in the foreground
  aevra-browser pair                        print a one-time code for the extension popup
  aevra-browser unpair <id> | --all         remove one pairing, or every pairing
  aevra-browser status [--json] [--show-token]
  aevra-browser stop                        stop the daemon
  aevra-browser cdp [--port <n>]            drive a browser started with --remote-debugging-port
  aevra-browser extension install [--dir <path>] [--yes]
  aevra-browser --version | --help
`;

interface Flags {
  values: Map<string, string | true>;
  positionals: string[];
}

/** Parses `--flag`, `--flag value` and `--flag=value` against a fixed set of known flags. */
function parseFlags(args: string[], valued: string[], boolean: string[]): Flags {
  const values = new Map<string, string | true>();
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] as string;
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
    if (boolean.includes(name)) {
      if (inline !== undefined) throw new Error(`--${name} does not take a value`);
      values.set(name, true);
    } else if (valued.includes(name)) {
      const value = inline ?? args[++index];
      if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`);
      values.set(name, value);
    } else {
      throw new Error(`unknown option --${name}`);
    }
  }
  return { values, positionals };
}

function noPositionals(flags: Flags, command: string): void {
  if (flags.positionals.length > 0) {
    throw new Error(`${command} takes no argument: ${flags.positionals[0]}`);
  }
}

function parsePort(value: string | true | undefined): number | undefined {
  if (value === undefined) return undefined;
  const port = /^\d+$/.test(String(value)) ? Number(value) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('--port must be an integer from 1 to 65535');
  }
  return port;
}

export function parseArgs(argv: string[]): Command {
  const [first, ...rest] = argv;
  if (first === undefined || first === '--help' || first === '-h' || first === 'help') {
    return { command: 'help' };
  }
  if (first === '--version' || first === '-v') return { command: 'version' };

  if (first === 'serve' || first === 'mcp' || first === 'pair' || first === 'stop') {
    noPositionals(parseFlags(rest, [], []), first);
    return { command: first };
  }
  if (first === 'ui') {
    noPositionals(parseFlags(rest, [], []), first);
    return { command: 'ui' };
  }
  if (first === 'config') {
    const [action, ...tail] = rest;
    if (!['get', 'set', 'reset'].includes(action ?? ''))
      throw new Error('config requires get, set or reset');
    const flags = parseFlags(tail, [], action === 'get' ? ['json'] : []);
    const [key, value] = flags.positionals;
    if (
      (action === 'get' && flags.positionals.length > 1) ||
      (action === 'set' && flags.positionals.length !== 2) ||
      (action === 'reset' && flags.positionals.length !== 1)
    )
      throw new Error('Invalid config arguments');
    return {
      command: 'config',
      action: action as 'get' | 'set' | 'reset',
      ...(key === undefined ? {} : { key }),
      ...(value === undefined ? {} : { value }),
      json: flags.values.has('json'),
    };
  }
  if (first === 'unpair') {
    const flags = parseFlags(rest, [], ['all']);
    const all = flags.values.has('all');
    const id = flags.positionals[0];
    if (flags.positionals.length > 1) throw new Error('unpair takes one <id>');
    if (!all && id === undefined) throw new Error('unpair requires <id> or --all');
    if (all && id !== undefined) throw new Error('unpair takes <id> or --all, not both');
    return { command: 'unpair', ...(id === undefined ? {} : { id }), all };
  }
  if (first === 'status') {
    const flags = parseFlags(rest, [], ['json', 'show-token']);
    noPositionals(flags, 'status');
    return {
      command: 'status',
      json: flags.values.has('json'),
      showToken: flags.values.has('show-token'),
    };
  }
  if (first === 'cdp') {
    const flags = parseFlags(rest, ['port'], []);
    noPositionals(flags, 'cdp');
    const port = parsePort(flags.values.get('port'));
    return { command: 'cdp', ...(port === undefined ? {} : { port }) };
  }
  if (first === 'extension') {
    const [sub, ...tail] = rest;
    if (sub !== 'install') throw new Error('extension requires a subcommand: install');
    const flags = parseFlags(tail, ['dir'], ['yes']);
    noPositionals(flags, 'extension install');
    const dir = flags.values.get('dir');
    return {
      command: 'extension-install',
      ...(typeof dir === 'string' ? { dir } : {}),
      yes: flags.values.has('yes'),
    };
  }
  throw new Error(`unknown command: ${first}`);
}
