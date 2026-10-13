#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnDaemonProcess } from './bridge/stdio-bridge.js';
import { parseArgs, USAGE } from './cli-args.js';
import { runCommand, type CliContext } from './cli-commands.js';
import { downloadArchive } from './extension/install.js';
import { resolvePaths } from './paths.js';
import { runBrowserAgentCli } from './agent-command.js';
import { extractStartupPorts, withStartupPorts, type StartupPorts } from './startup-ports.js';

export { parseArgs } from './cli-args.js';

function defaultContext(env: NodeJS.ProcessEnv, ports?: StartupPorts): CliContext {
  return {
    paths: resolvePaths(env, undefined, undefined, ports),
    out: (line) => void process.stdout.write(`${line}\n`),
    err: (line) => void process.stderr.write(`${line}\n`),
    fetch,
    spawnDaemon: spawnDaemonProcess,
    download: (url) => downloadArchive(url),
    io: { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
  };
}

/** Runs one CLI invocation and returns its exit code. `context` is for tests. */
export async function main(
  argv: string[],
  context?: Partial<CliContext>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  let ctx: CliContext;
  try {
    const { args, ports } = extractStartupPorts(argv);
    argv = args;
    ctx = { ...defaultContext(env, ports), ...context };
    ctx.paths = withStartupPorts(ctx.paths, ports);
    ctx.spawnDaemon = context?.spawnDaemon ?? (() => spawnDaemonProcess(env, ctx.paths));
  } catch (error) {
    (context?.err ?? ((line: string) => process.stderr.write(`${line}\n`)))(
      error instanceof Error ? error.message : String(error),
    );
    return 2;
  }
  if (ctx.paths.configProblem) ctx.err(ctx.paths.configProblem);
  let command;
  try {
    const special = await runBrowserAgentCli(argv, ctx.paths);
    if (special !== null) return special;
    command = parseArgs(argv);
  } catch (error) {
    ctx.err(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return 2;
  }
  try {
    return await runCommand(command, ctx);
  } catch (error) {
    ctx.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

const invoked = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (invoked === realpathSync(fileURLToPath(import.meta.url))) {
  const code = await main(process.argv.slice(2));
  process.exitCode = code;
  // A keep-alive socket from fetch can outlive the command; do not wait on it.
  setTimeout(() => process.exit(code), 250).unref();
}
