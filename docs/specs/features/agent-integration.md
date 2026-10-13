---
schema_version: 1
id: "feature.agent-integration"
title: "AI Agent Discovery and Integrations"
kind: "feature"
status: "verified"
summary: "Automatic discovery, configuration, and provisioning for 6 AI coding assistants (Codex, Claude Code, OpenCode, Antigravity, Antigravity CLI, Antigravity IDE)."
tags: ["agents", "codex", "claude-code", "opencode", "antigravity", "integration"]
source_paths: ["src/agent-command.ts", "src/cli-support.ts", "src/daemon/client-credentials.ts"]
related_specs: ["architecture.mcp-protocol", "feature.web-ui", "workflow.startup-ports-configuration"]
last_doc_update_at: "2026-10-28T17:15:00Z"
last_verified_at: "2026-10-28T17:15:00Z"
last_verified_code_commit: "3e1f006"
last_source_change_commit: "3e1f006"
last_source_change_at: "2026-10-28T11:33:34+07:00"
source_fingerprint: "sha256:b8a2fe888431531b874442f5cc65d2ab045542a65194e7c4e4dba879499cb0ec"
---

# AI Agent Discovery and Integrations

## Purpose and boundaries
Aevra Browser provides one-click and CLI-driven integration for six major AI coding agents: OpenAI Codex, Anthropic Claude Code, OpenCode, Google Antigravity, Antigravity CLI, and Antigravity IDE. It discovers existing agent configurations, manages local configuration edits (JSON, JSONC, TOML), provisions unique client credentials, links canonical agent skills, and performs atomic rollbacks if an installation fails.

## Observable behavior
- **Supported Targets**:
  - `codex`
  - `claude-code`
  - `opencode`
  - `antigravity`
  - `antigravity-cli`
  - `antigravity-ide`
- **Operations**:
  - `install`: Provisions credentials, updates agent configuration file, and links skills.
  - `uninstall`: Removes integration from agent configuration and unlinks skills.
  - `status`: Reports whether each agent target is currently installed, missing, or colliding.
- **Transports**:
  - `stdio`: Registers `aevra-browser mcp` with per-credential startup ports for automatic background daemon activation.
  - `http`: Registers `http://127.0.0.1:<mcpPort>/mcp` with durable client tokens stored in `<stateDir>/agent-credentials/`.
- **Integrity & Rollback**: Preserves existing comments and format in JSONC/TOML configs. Any failure during batch installation rolls back configuration without touching unrelated user settings.

## Workflow
1. **Discovery & Preflight**: Checks agent home paths and config files for collisions or malformed syntax.
2. **Credential Provisioning**: Issues a persistent UUID client credential saved in `<stateDir>/agent-credentials/<target>-<uuid>.json`.
3. **Configuration Injection**: Modifies agent MCP registry (`~/.codex/config.toml`, `~/.claude.json`, `~/.gemini/antigravity/mcp_config.json`, etc.).
4. **Skill Symlinking**: Links canonical skill instructions (`.agents/skills/aevra-browser/SKILL.md`) to agent skill directories.
5. **State Recording**: Updates central integration manifest at `<home>/.agents/aevra/aevra-browser.json`.

## Code map
- `src/agent-command.ts` — High-level CLI dispatch for `agent install`, `agent uninstall`, and `agent status`.
- `src/cli-support.ts` — Shared agent target normalization and supported target enumeration.
- `src/daemon/client-credentials.ts` — Client credential file persistence, verification, and startup-port metadata association.

## Interfaces and data
- **CLI Commands**:
  - `aevra-browser agent status [target]`
  - `aevra-browser agent install <target> [--transport stdio|http] [--dry-run]`
  - `aevra-browser agent uninstall <target> [--dry-run]`
- **Manifest Record (`~/.agents/aevra/aevra-browser.json`)**:
  - `version`: Manifest schema version (2).
  - `product`: `"aevra-browser"`.
  - `registrations`: Array of `{ target, scope, transport, config, entryPath, credentialId, credentialFile, links }`.

## Verification
- `test/agent-cli.unit.test.ts` tests agent detection, config formatting, and rollback handling.
- `test/agent-daemon.unit.test.ts` verifies durable HTTP credential survival across daemon restarts.
- `test/agent-startup-ports.integration.test.ts` tests listener preservation in stdio agent configurations.

## Related documentation
- [MCP Protocol and Tools Engine](../architecture/mcp-protocol.md)
- [Settings, Guide, and About Web UI](web-ui.md)
- [Startup Ports and Configuration Resolution](../workflows/startup-ports-configuration.md)

## Known limitations and open questions
- Antigravity IDE requires restarting the IDE window after installation to detect newly linked MCP servers.

<!-- BEGIN MANUAL NOTES -->
<!-- END MANUAL NOTES -->
