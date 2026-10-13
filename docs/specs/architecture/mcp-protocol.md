---
schema_version: 1
id: "architecture.mcp-protocol"
title: "MCP Protocol and Browser Tools Engine"
kind: "architecture"
status: "verified"
summary: "Exposes 10 browser automation tools via JSON-RPC 2.0 stdio bridge and loopback HTTP transport with bearer token security."
tags: ["mcp", "tools", "protocol", "jsonrpc", "automation"]
source_paths: ["src/daemon/mcp-http.ts", "src/mcp/handlers.ts", "src/mcp/jsonrpc.ts", "src/mcp/operations.ts", "src/mcp/schemas.ts", "src/mcp/tools.ts", "src/mcp/validate.ts"]
related_specs: ["architecture.daemon-and-lifecycle", "feature.agent-integration", "feature.extension-pairing"]
last_doc_update_at: "2026-10-28T17:15:00Z"
last_verified_at: "2026-10-28T17:15:00Z"
last_verified_code_commit: "3e1f006"
last_source_change_commit: "3e1f006"
last_source_change_at: "2026-10-28T11:33:34+07:00"
source_fingerprint: "sha256:82040c65e402510f3513ad7fc57ae55242c233fe39f17abcb9f278ab439c5df7"
---

# MCP Protocol and Browser Tools Engine

## Purpose and boundaries
Aevra Browser exposes ten browser control tools compliant with the Model Context Protocol (MCP) standard. The tools allow AI assistants (such as Claude Code, Codex, and Antigravity) to inspect web page structure, interact with elements, navigate URLs, capture screenshots, and execute scripts in real user browsers. Tools operate over both a standard JSON-RPC stdio pipe (`aevra-browser mcp`) and an authenticated HTTP SSE endpoint (`POST /mcp`).

## Observable behavior
- **10 Standard Tools**:
  1. `browser_connect`: Attaches to a paired extension profile or CDP endpoint.
  2. `browser_tabs`: Lists open browser tabs with tab IDs, titles, and URLs.
  3. `browser_navigate`: Navigates a tab to a specified URL with navigation guardrails.
  4. `browser_snapshot`: Captures accessibility-tree snapshots and page structural DOM nodes.
  5. `browser_act_many`: Executes a sequence of DOM actions (clicks, keyboard input, select, hover).
  6. `browser_read`: Reads text or DOM contents of a targeted element or the whole page.
  7. `browser_execute_script`: Evaluates JavaScript in the tab execution context.
  8. `browser_logs`: Retrieves recent console and runtime logs from the page.
  9. `browser_status`: Reports connection state, attached tabs, and next-action guidance.
  10. `browser_disconnect`: Detaches from the active browser session.
- **Security & Redaction**: Rejects file URLs and sensitive-origin navigation. Tokens and bearer secrets in URLs or snapshots are redacted.
- **Dual Transport**: Supports `stdio` transport for native local subprocess integration and `http` transport with bearer credentials for persistent agents.

## Workflow
1. **Initialize**: Client sends JSON-RPC `initialize` request detailing protocol version and capabilities.
2. **Tool Discovery**: Client requests `tools/list`, daemon returns full schemas for all 10 tools.
3. **Execution**: Client issues `tools/call` with tool name and arguments.
4. **Validation**: Arguments are validated strictly against schemas; unknown properties or malformed types return JSON-RPC error `-32602`.
5. **Execution & Response**: Request is routed to `browser-runtime` driver; output is formatted into standard MCP text/image content items.

## Code map
- `src/daemon/mcp-http.ts` — HTTP POST `/mcp` transport handler, bearer authentication check, body length limit, and error mapping.
- `src/mcp/handlers.ts` — High-level tool dispatch router and execution coordinator.
- `src/mcp/tools.ts` — Canonical list of 10 browser tools with human-readable descriptions.
- `src/mcp/schemas.ts` — JSON Schema definitions matching root Aevra tools parity.
- `src/mcp/operations.ts` — Low-level browser operation execution via runtime drivers.
- `src/mcp/jsonrpc.ts` — JSON-RPC 2.0 message parsing, serialization, and error code constants.
- `src/mcp/validate.ts` — Argument schema validation and payload sanity checking.

## Interfaces and data
- **JSON-RPC Methods**:
  - `initialize`, `notifications/initialized`, `ping`
  - `tools/list`, `tools/call`
- **Error Codes**:
  - `-32700`: Parse error (invalid JSON).
  - `-32600`: Invalid Request (missing standard fields).
  - `-32601`: Method not found.
  - `-32602`: Invalid params (schema validation failure).
  - `-32000`: Internal browser daemon error.

## Verification
- `test/tools-parity.contract.test.ts` validates tool name, schema property, and required fields parity with vendor schemas.
- `test/handlers.unit.test.ts` verifies argument parsing, missing parameter detection, and execution error reporting.
- `test/mcp-http.security.test.ts` verifies bearer token authorization, origin rejection, and payload size bounds.

## Related documentation
- [Browser Daemon and Process Lifecycle](daemon-and-lifecycle.md)
- [AI Agent Discovery and Integrations](../features/agent-integration.md)
- [Browser Extension Pairing and Transport](../features/extension-pairing.md)

## Known limitations and open questions
- Coordinate-based clicks attach Chrome Debugger temporarily in extension mode when accessibility targets are unavailable.

<!-- BEGIN MANUAL NOTES -->
<!-- END MANUAL NOTES -->
