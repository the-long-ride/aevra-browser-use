# Aevra Browser Specifications Index

Welcome to the Aevra Browser repository knowledge map. This directory contains evidence-grounded, verified specifications mapping code components, observable behaviors, interfaces, and testing verification.

## Architecture & Core Protocols
- [Browser Daemon and Process Lifecycle](architecture/daemon-and-lifecycle.md)
  - *Summary*: Background daemon architecture, single-instance lock file management, stale lock recovery, and transparent stdio bridge auto-spawning.
  - *Tags*: `daemon`, `process`, `lock`, `lifecycle`, `stdio-bridge`
  - *Sources*: `src/daemon/serve.ts`, `src/daemon/lock.ts`, `src/daemon/browser-runtime.ts`, `src/bridge/stdio-bridge.ts`, `src/paths.ts`
- [MCP Protocol and Browser Tools Engine](architecture/mcp-protocol.md)
  - *Summary*: Exposes 10 browser automation tools via JSON-RPC 2.0 stdio bridge and loopback HTTP transport with bearer token security.
  - *Tags*: `mcp`, `tools`, `protocol`, `jsonrpc`, `automation`
  - *Sources*: `src/daemon/mcp-http.ts`, `src/mcp/handlers.ts`, `src/mcp/tools.ts`, `src/mcp/schemas.ts`, `src/mcp/operations.ts`, `src/mcp/jsonrpc.ts`, `src/mcp/validate.ts`

## Features & Integrations
- [Browser Extension Pairing and Transport](features/extension-pairing.md)
  - *Summary*: Ephemeral 8-character pairing codes, chrome-extension origin validation, persistent credentials, and GitHub release extension packaging.
  - *Tags*: `extension`, `pairing`, `websocket`, `chromium`, `mv3`
  - *Sources*: `src/daemon/pairing-server.ts`, `src/daemon/pairing-codes.ts`, `src/daemon/pairing-store.ts`, `src/extension/install.ts`, `src/extension/archive.ts`
- [AI Agent Discovery and Integrations](features/agent-integration.md)
  - *Summary*: Automatic discovery, configuration, and provisioning for 6 AI coding assistants (Codex, Claude Code, OpenCode, Antigravity, Antigravity CLI, Antigravity IDE).
  - *Tags*: `agents`, `codex`, `claude-code`, `opencode`, `antigravity`, `integration`
  - *Sources*: `src/agent-command.ts`, `src/cli-support.ts`, `src/daemon/client-credentials.ts`
- [Settings, Guide, and About Web UI](features/web-ui.md)
  - *Summary*: Single-use bootstrap authentication, CSRF protection, interactive settings management, llm.txt prompt bundling, and release download modal.
  - *Tags*: `ui`, `web`, `settings`, `guide`, `about`, `modal`
  - *Sources*: `src/ui/server.ts`, `src/ui/session.ts`, `src/ui/actions.ts`, `src/ui/assets.ts`, `src/ui/html.ts`, `src/ui/style.ts`, `src/ui/script.ts`

## Workflows & Operational Mechanics
- [Startup Ports and Configuration Resolution](workflows/startup-ports-configuration.md)
  - *Summary*: Resolution precedence across CLI flags, environment variables, and config.json for pairing, MCP, and WebSocket listener ports.
  - *Tags*: `ports`, `configuration`, `precedence`, `cli`, `startup`
  - *Sources*: `src/startup-ports.ts`, `src/cli-args.ts`, `src/cli-commands.ts`, `src/cli.ts`, `src/config.ts`, `src/config-cli.ts`, `src/version.ts`, `src/vendor.ts`
