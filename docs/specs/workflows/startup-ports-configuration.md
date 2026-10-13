---
schema_version: 1
id: "workflow.startup-ports-configuration"
title: "Startup Ports and Configuration Resolution"
kind: "workflow"
status: "verified"
summary: "Resolution precedence across CLI flags, environment variables, and config.json for pairing, MCP, and WebSocket listener ports."
tags: ["ports", "configuration", "precedence", "cli", "startup"]
source_paths: ["src/cli-args.ts", "src/cli-commands.ts", "src/cli.ts", "src/config-cli.ts", "src/config.ts", "src/startup-ports.ts", "src/vendor.ts", "src/version.ts"]
related_specs: ["architecture.daemon-and-lifecycle", "feature.agent-integration", "feature.web-ui"]
last_doc_update_at: "2026-10-28T17:25:00Z"
last_verified_at: "2026-10-28T17:25:00Z"
last_verified_code_commit: "3e1f006"
last_source_change_commit: "3e1f006"
last_source_change_at: "2026-10-28T17:25:00+07:00"
source_fingerprint: "sha256:15c76c7cdbd2fc90cbb66dff4eea1f747b1e1d5d776f678d58592c986174ca74"
---

# Startup Ports and Configuration Resolution

## Purpose and boundaries
Aevra Browser requires binding three loopback ports: pairing/settings HTTP (`pairPort`), MCP HTTP (`mcpPort`), and extension WebSocket (`wsPort`), alongside an optional CDP debugging port (`cdpPort`) and daemon auto-idle timeout (`idleTimeout`). This specification defines the hierarchical resolution precedence among command-line arguments, environment variables, and persisted `config.json` settings, as well as port validation and collision prevention.

## Observable behavior
- **Default Ports & Timeout**:
  - `pairPort`: 47841
  - `mcpPort`: 47842
  - `wsPort`: 47843
  - `cdpPort`: 9222
  - `idleTimeout`: 30 (minutes; 0 to disable)
- **Precedence Hierarchy**:
  1. **CLI Invocation Flags**: Highest priority (e.g., `--basePort=50000`, `--ui-port=50010`, or `--idle-timeout=15`).
  2. **Environment Variables**: Overrides config file (e.g., `AEVRA_BROWSER_PAIR_PORT`, `AEVRA_BROWSER_MCP_PORT`, `AEVRA_BROWSER_IDLE_TIMEOUT`).
  3. **Persisted Configuration**: `<stateDir>/config.json`.
  4. **Hardcoded Defaults**: Built-in fallback ports.
- **Port Block Allocation (`--basePort=N`)**:
  - Derives three consecutive listener ports:
    - `pairPort = N`
    - `mcpPort = N + 1`
    - `wsPort = N + 2`
  - Valid range: `1 <= N <= 65533`.
  - Does not alter the CDP target port (retains `9222`).
- **Validation Rules**:
  - Rejects mixing `--basePort` with individual listener flags.
  - Rejects ports `<= 0` or `> 65535`.
  - Rejects intra-daemon port collisions (two listeners attempting to bind the same port number).

## Workflow
1. **CLI Parsing**: `parseCliArgs()` parses positionals and flags into a normalized command object.
2. **Environment & File Read**: `resolvePaths()` and `readConfig()` load active environment variables and `<stateDir>/config.json`.
3. **Merging & Normalization**: `withStartupPorts()` merges CLI overrides onto effective configuration.
4. **Collision Check**: Verifies that `pairPort`, `mcpPort`, and `wsPort` are all distinct numbers.
5. **Execution**: Selected ports are passed to `serve()` or propagated to auto-spawned child processes.

## Code map
- `src/startup-ports.ts` — Port normalization, `--basePort` consecutive block derivation, environment variable mapping, and conflict validation.
- `src/cli-args.ts` — Command-line argument tokenizer, command routing, and syntax verification.
- `src/cli-commands.ts` — Execution handlers for CLI subcommands (`serve`, `pair`, `status`, `config`, `extension`).
- `src/cli.ts` — Process entrypoint, global unhandled exception catcher, and exit code mapper.
- `src/config.ts` — Persistent configuration storage and JSON serialization in `<stateDir>/config.json`.
- `src/config-cli.ts` — CLI `aevra-browser config get/set/reset` management handler.
- `src/version.ts` — Dynamic package version loader reading `package.json`.
- `src/vendor.ts` — Pinned upstream Aevra core protocol and driver re-exports.

## Interfaces and data
- **CLI Flags**:
  - `--basePort=<N>`: Binds `N`, `N+1`, `N+2`.
  - `--ui-port=<N>`, `--up=<N>`: Overrides pairing HTTP port.
  - `--mcp-port=<N>`, `--mp=<N>`: Overrides MCP HTTP port.
  - `--ws-port=<N>`, `--wp=<N>`: Overrides WebSocket listener port.
  - `--port=<N>`: Specifies target Chrome remote debugging port.
  - `--idle-timeout=<N>`, `--it=<N>`: Specifies auto-shutdown idle timeout in minutes (`0` disables).
- **Environment Overrides**:
  - `AEVRA_BROWSER_HOME`: Custom state directory root.
  - `AEVRA_BROWSER_PAIR_PORT`: Pairing HTTP port.
  - `AEVRA_BROWSER_MCP_PORT`: MCP HTTP port.
  - `AEVRA_BROWSER_WS_PORT`: WebSocket listener port.
  - `AEVRA_BROWSER_CDP_PORT`: CDP target port.
  - `AEVRA_BROWSER_IDLE_TIMEOUT`: Auto-shutdown idle timeout in minutes.

## Verification
- `test/startup-ports.unit.test.ts` validates consecutive derivations, flag aliases, and invalid port rejections.
- `test/startup-ports.integration.test.ts` tests daemon foreground and background port propagation.
- `test/config.unit.test.ts` verifies `config.json` loading, mutation, and collision isolation.

## Related documentation
- [Browser Daemon and Process Lifecycle](../architecture/daemon-and-lifecycle.md)
- [MCP Protocol and Tools Engine](../architecture/mcp-protocol.md)
- [Settings, Guide, and About Web UI](../features/web-ui.md)

## Known limitations and open questions
- If a requested port is already in use by another application on the system, startup fails with `BROWSER_LISTENER_FAILED (EADDRINUSE)`.

<!-- BEGIN MANUAL NOTES -->
<!-- END MANUAL NOTES -->
