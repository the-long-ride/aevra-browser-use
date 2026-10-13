# Changelog

## [1.0.0] - 2026-10-18

First stable source release. The package version is independent of the bundled upstream extension version.

### Changed

- `extension install` keeps a same-or-newer extension copy (`--yes` still repairs a same-version copy whose files were edited), refuses a folder other than the one the shared record names before downloading, and copies under the integration lock shared with root Aevra. `uninstall --purge` checks state ownership before touching integrations or stopping the daemon, keeps an extension it cannot release, and `--dry-run` previews the state it would remove. `mcp --credential-file` connects to the live daemon port. A saved port that collides with an environment override is ignored on its own instead of the whole file, and the problem is shown in the CLI and the settings page. Changing `mcpPort` reminds you to re-run `agent install <target> --transport http`.
- Add persisted settings with CLI and authenticated Web UI, shared root-extension source snapshots and port-based switching, durable agent HTTP credentials, four-agent stdio/HTTP registration, canonical skill links and owned-resource cleanup.

- Enforce LF text checkouts and formatting across platforms; fix the download-timeout regression fixture so coverage runs cannot cancel on an empty event loop. Keep the 85% coverage gate.

- Standardize current runtime/build CI on Node.js 24 and GitHub-maintained Actions `@v6`; add local `.node-version` files and keep independently versioned Rust cache support.
- Add manual CI/release dispatch while retaining push/PR builds and version-tag releases. Validate the tag/version and bind reusable CI, packaging and publishing to the same immutable commit SHA before release.

### Added

- A single browser daemon (`aevra-browser serve`) that owns aevra's extension WebSocket server and
  CDP driver, behind an exclusive lock file with stale-lock recovery.
- `aevra-browser mcp`, a stdio bridge that starts the daemon on demand and lets any number of MCP
  clients share one paired browser.
- aevra's ten `browser_*` MCP tools over an authenticated loopback HTTP endpoint (bearer token,
  loopback `Origin` and `Host` only, 8 MiB body cap).
- Pairing over aevra's existing extension contract (`POST /api/browser/pair`) with one-time codes,
  `pair`, `unpair <id>` and `unpair --all`, which invalidates every token.
- `status`, `stop` and `cdp` commands, and `extension install`, which downloads the extension zip
  with a size cap and unpacks it with path-traversal checks.
- The aevra v1.2.1 extension, built unmodified from the pinned submodule, as a release zip with a
  `.sha256`.
- Minimal guards: blocked and secret-carrying navigation, sensitive-origin screenshot refusal,
  outbound secret refusal, bounded `wait_for`, and redacted, untrusted page results.
- CI on Windows, macOS and Linux with Node 22.5 and 24, and a release workflow that publishes to
  npm with provenance.
