import { readConfigLenient, updateConfig } from '../config.js';
import type { Paths } from '../paths.js';
import type { AdminHooks } from '../daemon/mcp-http.js';
import type { SettingsActions } from './server.js';
import { HttpError } from '../daemon/http-util.js';
import { manageBrowserAgent } from '../agent-command.js';
import { parseAgentCommand } from '../../shared/aevra/packages/agent-integration/src/command.js';
import { VERSION } from '../version.js';

export function settingsActions(
  paths: Paths,
  admin: AdminHooks,
  status: () => unknown,
  home?: string,
): SettingsActions {
  return {
    async snapshot() {
      // Lenient, so the page that can repair a broken or colliding file still opens.
      const { config, problem } = readConfigLenient(paths.stateDir);
      const restartRequired =
        config.effective.pairPort !== paths.ports.pair ||
        config.effective.mcpPort !== paths.ports.mcp ||
        config.effective.wsPort !== paths.ports.ws;
      const agents = await manageBrowserAgent(
        { operation: 'status', target: 'all', transport: 'stdio', dryRun: false },
        paths,
        home,
      );
      return {
        version: VERSION,
        config: { ...config, restartRequired, ...(problem ? { problem } : {}) },
        ports: paths.ports,
        status: await status(),
        pairings: admin.listPairings(),
        agents: agents.registrations,
      };
    },
    async mutate(input) {
      const value = input as {
        action?: string;
        settings?: Record<string, unknown>;
        id?: string;
        operation?: string;
        target?: string;
        transport?: string;
      } | null;
      if (value?.action === 'agent') {
        const args = [String(value.operation), String(value.target)];
        if (value.operation === 'install') args.push('--transport', String(value.transport));
        try {
          return await manageBrowserAgent(parseAgentCommand(args), paths, home);
        } catch (error) {
          throw new HttpError(400, 'AGENT_ACTION_FAILED', (error as Error).message);
        }
      }
      if (value?.action === 'pair') return admin.createPairingCode();
      if (value?.action === 'unpair' && typeof value.id === 'string') return admin.revoke(value.id);
      if (value?.action === 'config' && value.settings && typeof value.settings === 'object') {
        try {
          return updateConfig(paths.stateDir, value.settings);
        } catch (error) {
          throw new HttpError(400, 'CONFIG_INVALID', (error as Error).message);
        }
      }
      throw new HttpError(400, 'ACTION_INVALID', 'Unsupported settings action');
    },
  };
}
