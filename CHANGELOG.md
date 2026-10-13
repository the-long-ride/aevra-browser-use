# Changelog

## [1.0.0] - 2026-10-19

First stable source release. The package version is independent of the bundled upstream extension version.

### Added

- Configurable Auto-Idle Timeout for background daemon self-termination when inactive (default: 30 minutes; unit: minute; configurable via CLI flags `--idle-timeout`/`--it`, environment variable `AEVRA_BROWSER_IDLE_TIMEOUT`, and Web UI settings). Active MCP calls, admin routes, pairing requests, and authenticated browser extension WebSocket connections automatically refresh the activity timer, and `0` disables shutdown.
- Support for 6 AI coding assistant integrations (`codex`, `claude-code`, `opencode`, `antigravity`, `antigravity-cli`, `antigravity-ide`) across CLI and Web UI with automated detection, configuration injection, rollback protection, and skill linking.
- Redesigned 3-tab Web UI featuring `Settings`, `Guide`, and `About` navigation with theme toggle (dark/light), local storage persistence, and responsive mobile layout.
- Clickable `Browser` status health chip in the top navigation opening an extension download modal linked directly to the corresponding GitHub release tag (`v<version>`).
- Dedicated `Guide` tab with one-click "Copy prompt + llm.txt" button bundling the AI prompt and complete architecture specification.
- Full `llm.txt` system specification at repository root, served dynamically over loopback HTTP at `/llm.txt` and rendered inside the Guide tab.
- Compact green (`●`) and red (`●`) status dot indicators positioned to the left of AI agent names in the Settings UI.
- Balanced `About` view with 2×2 specification tiles (`Author`, `License`, `Engines`, `Protocols`), ecosystem resource cards with animated SVG link arrows, and a full-width Support banner featuring GitHub Octicon Star and Sponsor Heart SVGs.
- Comprehensive `docs/specs/` repository knowledge map with verified specifications covering daemon lifecycle, MCP protocol, extension pairing, agent integrations, Web UI, and startup ports configuration.
- Single browser daemon (`aevra-browser serve`) that owns aevra's extension WebSocket server and CDP driver, behind an exclusive lock file with stale-lock recovery.
- `aevra-browser mcp`, a stdio bridge that starts the daemon on demand and lets any number of MCP clients share one paired browser.
- aevra's ten `browser_*` MCP tools over an authenticated loopback HTTP endpoint (bearer token, loopback `Origin` and `Host` only, 8 MiB body cap).
- Pairing over aevra's existing extension contract (`POST /api/browser/pair`) with one-time codes, `pair`, `unpair <id>` and `unpair --all`, which invalidates every token.
- `status`, `stop` and `cdp` commands, and `extension install`, which downloads the extension zip with a size cap and unpacks it with path-traversal checks.
- The aevra v1.2.1 extension, built unmodified from the pinned submodule, as a release zip with a `.sha256`.
- Minimal guards: blocked and secret-carrying navigation, sensitive-origin screenshot refusal, outbound secret refusal, bounded `wait_for`, and redacted, untrusted page results.
- Select a consecutive daemon listener block with `--basePort=N`: pairing/settings on N, MCP HTTP on N+1 and extension WebSocket on N+2 (N between 1 and 65533).
- Set any subset independently with `--ui-port`/`--up`, `--mcp-port`/`--mp` and `--ws-port`/`--wp`. Unchanged defaults remain pairing/settings 47841, MCP 47842, WebSocket 47843 and CDP target 9222.
- CLI choices override environment and saved settings for the invocation without rewriting `config.json`. Foreground `serve`, detached `pair`, MCP bridges and CDP auto-start propagate selected listeners.
- Explicit agent installations remember selected listeners per credential for stdio auto-start. HTTP registration uses the actual live MCP endpoint when available.
- Rejection of mixed base/individual modes, logical duplicates including aliases, malformed or out-of-range ports, derived overflow and listener collisions.
- Persisted settings with CLI and authenticated Web UI, shared root-extension source snapshots and port-based switching, durable agent HTTP credentials, canonical skill links, and owned-resource cleanup.
- Replaced deprecated `whatwg-encoding` with `@exodus/bytes` and updated dependency security audits.
- CI on Windows, macOS and Linux with Node 22.5 and 24, and a release workflow that publishes to npm with provenance.
