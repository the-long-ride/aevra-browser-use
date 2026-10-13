---
schema_version: 1
id: "feature.extension-pairing"
title: "Browser Extension Pairing and Transport"
kind: "feature"
status: "verified"
summary: "Ephemeral 8-character pairing codes, chrome-extension origin validation, persistent credentials, and GitHub release extension packaging."
tags: ["extension", "pairing", "websocket", "chromium", "mv3"]
source_paths: ["src/daemon/pairing-codes.ts", "src/daemon/pairing-server.ts", "src/daemon/pairing-store.ts", "src/extension/archive.ts", "src/extension/install.ts"]
related_specs: ["architecture.daemon-and-lifecycle", "architecture.mcp-protocol", "feature.web-ui"]
last_doc_update_at: "2026-10-28T17:15:00Z"
last_verified_at: "2026-10-28T17:15:00Z"
last_verified_code_commit: "3e1f006"
last_source_change_commit: "3e1f006"
last_source_change_at: "2026-10-28T11:33:34+07:00"
source_fingerprint: "sha256:1521b4dbec29e4b64a7c7efc7a1120a6a554fead44bfe6328c15b57dc3d42df7"
---

# Browser Extension Pairing and Transport

## Purpose and boundaries
Aevra Browser pairs with Chromium-based browsers (Chrome, Edge, Brave, Chromium) via an unpacked Manifest V3 (MV3) extension. Pairing establishes bidirectional, secure WebSocket communication over loopback without third-party cloud brokers or external servers. Ephemeral one-time pairing codes authenticate browser profile registrations, which persist in local storage.

## Observable behavior
- **Pairing Code Generation**: `aevra-browser pair` (or UI action `Create pairing code`) mints a high-entropy 8-character uppercase alphanumeric code with a 5-minute time-to-live (TTL).
- **Origin Gate**: `POST /api/browser/pair` strictly requires an Origin header matching `chrome-extension://<extensionId>`. Ordinary webpage origins (`http://`, `https://`) are rejected with 403 Forbidden.
- **Single-Use Redemption**: Each code can only be redeemed once. Redeeming returns a cryptographic session token and WebSocket URL.
- **Persistent Pairing Profiles**: Successfully paired browser extension IDs and profile names are saved in `<stateDir>/pairings.json`.
- **Revocation**: Specific profiles can be revoked (`unpair <id>`), or all pairings invalidated at once (`unpair --all`), which immediately disconnects active extension WebSockets.

## Workflow
1. **Extension Installation**: User downloads and unzips `aevra-browser-extension.zip` or runs `aevra-browser extension install`.
2. **Developer Mode**: In `chrome://extensions`, user clicks **Load unpacked** pointing to the `aevra-extension` folder.
3. **Code Creation**: User runs `aevra-browser pair` to generate an 8-character code.
4. **Redemption**: User enters code and pairing port in the extension popup. The extension posts to `/api/browser/pair`.
5. **WebSocket Link**: The extension establishes an authenticated WebSocket link to the daemon's extension listener port (`47843` by default).

## Code map
- `src/daemon/pairing-codes.ts` — Ephemeral 8-character pairing code generation, expiration management, and single-use redemption tracking.
- `src/daemon/pairing-server.ts` — Loopback pairing HTTP endpoint (`POST /api/browser/pair`), origin validation, and error reporting.
- `src/daemon/pairing-store.ts` — Persistent JSON storage for paired extension profiles (`<stateDir>/pairings.json`).
- `src/extension/install.ts` — Extension download from GitHub releases, version comparison, unpacking, and installation lifecycle.
- `src/extension/archive.ts` — ZIP archive decompression safety, CRC verification, and zip-slip path traversal guards.

## Interfaces and data
- **Pairing API**:
  - `POST /api/browser/pair`: Body `{ code, extensionId, profileName }`. Returns `{ token, wsUrl }`.
- **Pairing Store Schema (`pairings.json`)**:
  - `version`: Store format version (integer).
  - `epoch`: Global revocation counter; incrementing drops all sessions.
  - `items`: Array of `{ pairingId, extensionId, profileName, createdAt }`.

## Verification
- `test/pairing.unit.test.ts` validates code generation, 5-minute expiration, and single-use redemption.
- `test/pairing-store.unit.test.ts` verifies profile persistence, profile name fallback, and atomic file saves.
- `test/extension-install.unit.test.ts` tests zip downloading, path validation, and `--yes` upgrade behaviors.
- `test/archive.security.test.ts` ensures path traversal and oversized zip bombs are rejected.

## Related documentation
- [Browser Daemon and Process Lifecycle](../architecture/daemon-and-lifecycle.md)
- [Settings, Guide, and About Web UI](web-ui.md)
- [Startup Ports and Configuration Resolution](../workflows/startup-ports-configuration.md)

## Known limitations and open questions
- Moving the unpacked extension directory on disk changes Chromium's computed extension ID, requiring re-pairing.

<!-- BEGIN MANUAL NOTES -->
<!-- END MANUAL NOTES -->
