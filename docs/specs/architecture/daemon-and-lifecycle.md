---
schema_version: 1
id: "architecture.daemon-and-lifecycle"
title: "Browser Daemon and Process Lifecycle"
kind: "architecture"
status: "verified"
summary: "Background daemon architecture, single-instance lock file management, stale lock recovery, auto-idle shutdown timeout, and transparent stdio bridge auto-spawning."
tags: ["daemon", "process", "lock", "lifecycle", "stdio-bridge", "idle-timeout"]
source_paths: ["src/bridge/stdio-bridge.ts", "src/daemon/browser-runtime.ts", "src/daemon/http-util.ts", "src/daemon/lock.ts", "src/daemon/serve.ts", "src/paths.ts"]
related_specs: ["architecture.mcp-protocol", "feature.extension-pairing", "workflow.startup-ports-configuration"]
last_doc_update_at: "2026-10-28T17:25:00Z"
last_verified_at: "2026-10-28T17:25:00Z"
last_verified_code_commit: "3e1f006"
last_source_change_commit: "3e1f006"
last_source_change_at: "2026-10-28T17:25:00+07:00"
source_fingerprint: "sha256:cd765d8d21c9958e67bed52eb82960c5a6fff2fcddad93c5eb4b1c12de35be7d"
---

# Browser Daemon and Process Lifecycle

## Purpose and boundaries
Aevra Browser coordinates local browser automation through a persistent background daemon (`aevra-browser serve`). The daemon manages browser sessions across MV3 extension WebSocket and Chrome DevTools Protocol (CDP) connections. It guarantees single-instance execution per state directory, detects dead process locks, automatically spawns silent background daemons on demand for MCP stdio clients, supports automatic shutdown when idle, and provides graceful shutdown controls.

## Observable behavior
- **Single Instance Enforcement**: Exactly one daemon instance may run per state directory (`<stateDir>/daemon.lock`).
- **Stale Lock Recovery**: When a daemon crashes or OS restarts, `liveLock()` probes both PID liveness (`process.kill(pid, 0)`) and an HTTP `/healthz` check. If either fails, the stale lock file is automatically cleared.
- **On-Demand Auto-Spawning**: If an AI agent invokes `aevra-browser mcp` while no daemon is running, the stdio bridge transparently spawns a detached background daemon (`aevra-browser serve`), polls `/healthz` until healthy, and forwards MCP traffic without requiring manual startup.
- **Auto-Idle Timeout**: To prevent orphaned background processes from running indefinitely after AI assistant sessions end, the daemon tracks activity timestamps across MCP requests, admin endpoints, pairing/UI routes, and active authenticated browser WebSocket peers. When no activity is observed for the configured duration (default: 30 minutes, unit: minutes, `0` disables), the daemon automatically terminates cleanly.
- **Graceful Termination**: The daemon listens for `POST /shutdown` on loopback authenticated with the bearer token from `daemon.lock`. When received, it closes listeners, drops WebSocket peers, deletes the lock file, and terminates cleanly.

## Workflow
1. **Startup Check**: `serve()` acquires an exclusive lock in `<stateDir>/daemon.lock` by writing PID, listening ports, and an ephemeral authentication token.
2. **Listener Initialization**: Starts the pairing/settings HTTP server, extension WebSocket listener, and MCP HTTP listener on loopback (`127.0.0.1`).
3. **Bridge Connection**: MCP clients connecting via stdio bridge read `daemon.lock` and connect over HTTP or spawn a new daemon if inactive.
4. **Shutdown Signal**: CLI `aevra-browser stop` reads `daemon.lock`, posts to `/shutdown`, waits for process termination, and ensures the lock file is removed.

## Code map
- `src/daemon/serve.ts` — Main daemon startup routine, signal handling (SIGINT/SIGTERM), HTTP/WS listener binding, and `/shutdown` handler.
- `src/daemon/lock.ts` — Exclusive lock file creation, validation, atomic temp-file rename, and stale lock removal.
- `src/daemon/browser-runtime.ts` — In-memory browser connection state manager, session tracking, and driver detachment.
- `src/bridge/stdio-bridge.ts` — Transparent JSON-RPC stdio bridge, auto-spawning detached daemon child process, and `/healthz` polling.
- `src/daemon/http-util.ts` — Loopback HTTP request guards, CORS origin enforcement, body parsing caps, and JSON response helpers.
- `src/paths.ts` — Platform-specific directory resolution (`LOCALAPPDATA` on Windows, `~/Library/Application Support` on macOS, `~/.local/state` on Linux).

## Interfaces and data
- **Lock File (`<stateDir>/daemon.lock`)**:
  - `pid`: Process identifier of running daemon.
  - `token`: 32-byte hex authentication token for admin endpoints.
  - `ports`: Active bound ports (`pair`, `mcp`, `ws`).
- **HTTP Endpoints**:
  - `GET /healthz`: Public loopback liveness probe returning `{ ok: true }`.
  - `POST /shutdown`: Authenticated daemon graceful termination.

## Verification
- `test/daemon.integration.test.ts` verifies single-instance locking, stale lock recovery, clean `/shutdown` handling, and automatic idle-timeout shutdown with touch resets.
- `test/bridge.integration.test.ts` verifies transparent daemon auto-spawn and stdio tool forwarding.
- `test/paths.unit.test.ts` validates cross-platform path resolution and `AEVRA_BROWSER_HOME` override.

## Related documentation
- [MCP Protocol and Tools Engine](mcp-protocol.md)
- [Browser Extension Pairing and Transport](../features/extension-pairing.md)
- [Startup Ports and Configuration Resolution](../workflows/startup-ports-configuration.md)

## Known limitations and open questions
- Windows file locking can occasionally cause transient `EPERM` collisions if a file handle is briefly held by anti-virus scanners during rapid process teardown.

<!-- BEGIN MANUAL NOTES -->
<!-- END MANUAL NOTES -->
