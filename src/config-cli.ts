import { spawn } from 'node:child_process';
import os from 'node:os';
import { configKey, readConfigLenient, updateConfig } from './config.js';
import { tryMarkStateDirectory } from '../shared/aevra/packages/agent-integration/src/cleanup.js';
import { liveLock } from './bridge/stdio-bridge.js';
import type { CliContext } from './cli-commands.js';
import type { Command } from './cli-args.js';

export function runConfig(
  command: Extract<Command, { command: 'config' }>,
  ctx: CliContext,
): number {
  const key = command.key === undefined ? undefined : configKey(command.key);
  if (command.action !== 'get') {
    // config.json may be the first file in the state folder: mark it as Browser's first.
    const problem = tryMarkStateDirectory(
      ctx.paths.stateDir,
      'aevra-browser',
      os.homedir(),
      ctx.paths.isDefaultStateDir ?? false,
    );
    if (problem) ctx.err(`aevra-browser: ${problem}`);
    updateConfig(ctx.paths.stateDir, {
      [key!]: command.action === 'reset' ? null : command.value,
    });
  }
  const { config: current, problem } = readConfigLenient(ctx.paths.stateDir);
  if (problem && command.action !== 'get') ctx.err(problem);
  if (key && command.action === 'get') {
    ctx.out(
      command.json
        ? JSON.stringify({ value: current.effective[key], source: current.sources[key] })
        : `${key} = ${current.effective[key]} (${current.sources[key]})`,
    );
  } else ctx.out(JSON.stringify(current, null, command.json ? 0 : 2));
  if (command.action !== 'get') ctx.out('Saved. Restart the daemon to apply listener changes.');
  if (command.action !== 'get' && key === 'mcpPort')
    // Stdio agents follow the live port; HTTP registrations store the URL.
    ctx.out(
      'Agents registered with --transport http still use the old port: re-run `aevra-browser agent install <target> --transport http` after the restart.',
    );
  return 0;
}

export function openSettings(url: string): void {
  const command =
    process.platform === 'win32'
      ? 'rundll32.exe'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () =>
    process.stderr.write('Browser could not open. Use the printed settings URL.\n'),
  );
  child.unref();
}

export async function runUi(ctx: CliContext): Promise<number> {
  const info = await liveLock({ paths: ctx.paths, spawnDaemon: ctx.spawnDaemon, fetch: ctx.fetch });
  if (!info) throw new Error('Start the daemon with aevra-browser serve before opening settings.');
  const response = await ctx.fetch(`http://127.0.0.1:${info.ports.mcp}/ui-bootstrap`, {
    method: 'POST',
    headers: { authorization: `Bearer ${info.mcpToken}` },
  });
  if (!response.ok) throw new Error(`Settings unavailable: HTTP ${response.status}`);
  const { token } = (await response.json()) as { token: string };
  const url = `http://127.0.0.1:${info.ports.pair}/#${token}`;
  ctx.out(url);
  (ctx.openUrl ?? openSettings)(url);
  return 0;
}
