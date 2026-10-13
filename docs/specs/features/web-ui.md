---
schema_version: 1
id: "feature.web-ui"
title: "Settings, Guide, and About Web UI"
kind: "feature"
status: "verified"
summary: "Single-use bootstrap authentication, CSRF protection, interactive settings management, llm.txt prompt bundling, and release download modal."
tags: ["ui", "web", "settings", "guide", "about", "modal"]
source_paths: ["src/ui/actions.ts", "src/ui/assets.ts", "src/ui/html.ts", "src/ui/script.ts", "src/ui/server.ts", "src/ui/session.ts", "src/ui/style.ts"]
related_specs: ["architecture.daemon-and-lifecycle", "feature.agent-integration", "feature.extension-pairing"]
last_doc_update_at: "2026-10-28T17:25:00Z"
last_verified_at: "2026-10-28T17:25:00Z"
last_verified_code_commit: "3e1f006"
last_source_change_commit: "3e1f006"
last_source_change_at: "2026-10-28T17:25:00+07:00"
source_fingerprint: "sha256:82a4123ac905d8d49a7129ac9e4a6842f820e32771a552ce1368df32aa68bd93"
---

# Settings, Guide, and About Web UI

## Purpose and boundaries
Aevra Browser includes an authenticated, zero-dependency browser management interface served directly from the daemon on loopback. It provides a visual dashboard to monitor daemon health, generate extension pairing codes, inspect active browser profiles, install/uninstall AI agent integrations, adjust configuration ports and idle timeout, copy AI prompt bundles with raw `llm.txt`, and download matching extension releases.

## Observable behavior
- **Security Model**:
  - Single-use bootstrap token exchanged via `POST /api/session`.
  - Authenticated session established via `HttpOnly; SameSite=Strict` cookie.
  - State-mutating requests (`POST /api/action`) require exact loopback `Origin` and `x-aevra-csrf` header.
- **Top Navigation Bar**:
  - Brand identity with live connection port indicator.
  - Health cluster chips: `Daemon`, `Browser` (clickable button), and `MCP`.
  - Theme toggle (dark/light) with `localStorage` persistence.
- **Three Core Tabs**:
  1. **Settings**:
     - Browser Connection panel with pairing code generator and paired profiles list.
     - AI Agents panel with real-time green/red dot status indicators and install/uninstall actions.
     - Daemon Listeners, Idle Timeout & Paths form to modify ports, idle timeout limit (minutes, 0 to disable), and file locations.
  2. **Guide**:
     - One-click button to copy AI Assistant prompt automatically bundled with full `llm.txt` specification.
     - Formatted markdown preview of `llm.txt`.
  3. **About**:
     - System overview and version badge.
     - 2×2 Spec tile grid (`Author`, `License`, `Engines`, `Protocols`).
     - Interactive ecosystem resource cards with animated external SVG link arrows.
     - Full-width Support banner with official GitHub Octicon Star and Sponsor Heart SVGs.
- **Extension Download Modal**:
  - Triggered by clicking the topbar `Browser` status chip.
  - Dynamically binds download links to matching GitHub release tags (`v<version>`).
  - Displays quick 3-step installation guide and CLI install command.

## Workflow
1. **Launch**: `aevra-browser ui` mints a single-use token and prints the URL (e.g., `http://127.0.0.1:47841/#<token>`).
2. **Session Exchange**: The page extracts `#<token>`, posts to `/api/session`, receives an authenticated cookie and CSRF token, and clears the hash.
3. **Data Fetch**: The frontend calls `GET /api/settings` to retrieve runtime status, configuration sources, pairings, and agent states.
4. **Action Dispatch**: User interactions (pairing, agent toggle, saving ports) dispatch `POST /api/action` with the CSRF header.

## Code map
- `src/ui/server.ts` — HTTP server request dispatcher, static asset routing, and API endpoint routing.
- `src/ui/session.ts` — In-memory session store, bootstrap token expiration, and CSRF token verification.
- `src/ui/actions.ts` — Business logic backend handling `snapshot` queries and `mutate` commands.
- `src/ui/assets.ts` — Static asset bundler serving HTML, CSS, JS, and reading `llm.txt`.
- `src/ui/html.ts` — Single-page HTML markup including tabs, modals, and SVG icons.
- `src/ui/style.ts` — Embedded CSS styles featuring light/dark variables, responsive grids, and clean developer console aesthetics.
- `src/ui/script.ts` — Vanilla ES6 frontend application logic, API communication, DOM rendering, and tab routing.

## Interfaces and data
- **API Endpoints**:
  - `POST /api/session`: Body `{ token }`. Sets session cookie; returns `{ csrf }`.
  - `GET /api/settings`: Returns `{ snapshot, csrf }`.
  - `POST /api/action`: Body `{ action, ...args }`. Returns operation result.
  - `GET /llm.txt`: Raw architecture and tool documentation for AI agents.

## Verification
- `test/ui.integration.test.ts` verifies single-use bootstrap tokens, CSRF protection, and hostile Host header rejection.
- `test/settings.integration.test.ts` tests configuration mutations, agent actions, and pairing revocation via UI action dispatcher.

## Related documentation
- [Browser Daemon and Process Lifecycle](../architecture/daemon-and-lifecycle.md)
- [AI Agent Discovery and Integrations](agent-integration.md)
- [Browser Extension Pairing and Transport](extension-pairing.md)

## Known limitations and open questions
- Port modifications take effect on the next daemon restart; active connections remain on existing bound listeners until restarted.

<!-- BEGIN MANUAL NOTES -->
<!-- END MANUAL NOTES -->
