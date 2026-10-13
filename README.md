# @the-long-ride/aevra-browser

Browser control for any MCP client, without the aevra gateway.

One local daemon owns [aevra](https://github.com/the-long-ride/aevra)'s browser
extension and CDP drivers. It exposes aevra's ten `browser_*` tools over loopback
HTTP, and a stdio bridge lets any number of MCP clients share the same paired
browser. The package needs Node.js 24 or newer. Native agent configuration uses small TOML and JSONC parser dependencies.

**Release:** `1.0.0`. **Compatibility:** the browser drivers are pinned to the aevra v1.2.1 snapshot. The
extension is built from the checked root-source snapshot in `shared/aevra` and is
published as a zip release asset.

## Keep browsing while the agent works

Aevra Browser supports mouse-free, tab-targeted automation. An agent can read and interact with its task tab through the extension or CDP while you keep using your mouse and keyboard in another tab or application. Browser actions are delivered to the selected browser target rather than through system-wide mouse movement or keyboard injection.

Keep an explicit `tabId` for the agent's task and reuse that tab's element refs. Ordinary target selection does not activate the tab. DOM focus and browser input events stay within that target; they can still change the page the agent is working on. Using separate tabs avoids competing with the agent over the same field or page state.

Explicit `browser_tabs` focus requests activate the requested tab. The extension's visible-tab screenshot path requires an active tab and refuses an inactive target instead of activating it silently; screenshot support depends on the chosen transport. Multiple MCP clients share the daemon's browser state, so coordinate which client owns each task tab. Mouse-free targeting does not provide separate browser profiles or merge simultaneous edits.

## Why Aevra Browser?

Use this project for browser automation alongside your own browsing, with one local connection shared by your MCP clients.

- **One daemon, multiple clients:** stdio bridges share the paired browser instead of each starting its own extension server. The daemon stays available after an individual client exits.
- **Two connection paths:** pair the Aevra extension for a browser profile, or attach through CDP to a browser you started with a debugging port.
- **A bounded browser toolset:** ten `browser_*` tools expose navigation, observation and actions. `browser_execute_script` accepts a bounded action grammar; the drivers retain credential-field refusals and untrusted/redacted page results.
- **A small local deployment:** Node.js 24+, an npm command and native TOML/JSONC configuration editing. stdio starts the daemon on demand; authenticated loopback HTTP is available for clients that need it.
- **A stable upstream boundary:** the browser drivers are pinned to the Aevra v1.2.1 snapshot and the extension is built from the checked shared-source snapshot. Package and schema compatibility do not depend on the gateway running beside it.

## How it differs from the other Aevra repositories

| Project                                                             | Focus                                                                               | Access and workflow                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Aevra Browser — this repository**                                 | Browser tabs through an extension or CDP                                            | Shared loopback daemon, one-time pairing, stdio bridges or bearer-authenticated HTTP |
| [Aevra](https://github.com/the-long-ride/aevra)                     | Files, commands, Git, processes, browser/desktop tools and upstream MCP aggregation | Gateway Web UI, workspace/connector policy, approvals and hash-chained auditing      |
| [Aevra Desktop](https://github.com/the-long-ride/aevra-desktop-use) | Native application windows and accessibility controls                               | Application allowlist, native settings/tray UI and local Activity history            |

Choose Browser for browser-only automation on a single-user machine. Choose the gateway when browser actions need centralized workspace policy, approvals and audit. Choose Desktop for native applications outside browser tabs. All clients connected to this daemon share browser state and authority; the pairing/token model does not create isolated per-client browsing sessions.

## Current release and compatibility

Version **1.0.0** includes custom startup listener ports through a consecutive base block or individual listener options, including daemon auto-start and installed stdio agents. It retains the standalone daemon/bridge, one-time pairing, extension installation, explicit CDP attachment, listener health and loopback authentication. See the [changelog](CHANGELOG.md) for release changes and the [documentation index](docs/README.md) for implemented specifications.

The browser drivers remain pinned to **Aevra v1.2.1**. The shared extension and agent integration sources are separately recorded in `shared/aevra-source.json`. Root Aevra and Aevra Desktop have independent release scopes; updating a sibling repository does not update this package's bundled snapshot. Use the [gateway](https://github.com/the-long-ride/aevra) for its current MCP management, token statistics and wider workspace features.

## Quick start

1. Install the extension, then load it unpacked.

   ```bash
   npx -y @the-long-ride/aevra-browser extension install
   ```

   Open `chrome://extensions` (or `edge://extensions`), turn on Developer mode,
   choose **Load unpacked** and select the folder the command prints. Keep that
   folder where it is: Chrome derives the extension id from its path, and the
   pairing is bound to that id.

2. Pair the browser profile.

   ```bash
   npx -y @the-long-ride/aevra-browser pair
   ```

   It prints an 8-character code. In the Aevra extension popup, enter the code and
   port `47841`. A code is valid for 5 minutes and works once.

3. Add the server to your MCP clients.

   ```json
   {
     "mcpServers": {
       "aevra-browser": {
         "command": "npx",
         "args": ["-y", "@the-long-ride/aevra-browser", "mcp"]
       }
     }
   }
   ```

   Every client that launches this command drives the same paired browser. The first
   one starts the daemon in the background and it keeps running after a client exits.
   `browser_status` tells the agent what to do next (`not_paired`,
   `waiting_for_extension`, `ready_to_connect`, `attached`).

## Other ways to connect

### HTTP with a bearer token

The daemon serves MCP over Streamable HTTP (JSON responses) at
`http://127.0.0.1:47842/mcp`. Every request needs the daemon's token:

```bash
aevra-browser status --show-token
```

```json
{
  "mcpServers": {
    "aevra-browser": {
      "url": "http://127.0.0.1:47842/mcp",
      "headers": { "Authorization": "Bearer <token from status --show-token>" }
    }
  }
}
```

The token is generated each time the daemon starts, so the stdio configuration above
is the better default. The endpoint answers `401` without the token and `403` to any
request whose `Origin` or `Host` is not loopback, so a web page cannot reach it.

### CDP mode

To drive a browser without the extension, start it with a debugging port and attach:

```bash
chrome --remote-debugging-port=9222
aevra-browser cdp --port 9222
```

This is the same as an agent calling `browser_connect` with `transport: "cdp"`. The
browser is never discovered or launched for you.

## Settings and local agent installation

```sh
aevra-browser ui
aevra-browser config get --json
aevra-browser config set pairPort 50141
aevra-browser config reset pairPort
aevra-browser agent install codex
aevra-browser agent install all --transport stdio
aevra-browser agent install claude-code --transport http --dry-run
aevra-browser agent status --json
aevra-browser agent uninstall all
aevra-browser uninstall --purge --dry-run
```

Start the daemon before opening `ui`. Its one-use local login opens a settings page
for listener configuration, pairing, profile removal, transport examples and
agent integrations. Configuration is saved atomically; listener changes require
an explicit daemon restart. Effective settings show whether values come from
defaults, saved configuration or environment overrides.

Install from a persistent npm location before registering agents. The installer
supports Codex, Claude Code, OpenCode and Antigravity, with native stdio or HTTP
configuration. Each registration gets a separate credential. HTTP credentials
survive daemon restarts and grant MCP access only. Refresh/restart the agent to
load registration changes.

Skills are canonical at `~/.agents/skills/aevra-browser`; agent-specific folders
receive links (Windows directory junctions), while Codex discovers the canonical
folder directly. Existing custom entries, modified skills and conflicting links
are retained with a conflict report. `agent uninstall` revokes only that target's
credential and removes its managed resources. `uninstall --purge` also stops the
daemon and removes owned state; package-manager removal remains separate.

Both products install to a shared stable extension location. Load one copy. In
its popup use root Aevra's pairing port `47831` or Browser's `47841` with a fresh
code; custom configured ports work too. Pairing failure keeps the old connection.
The selected server's port appears in the popup. Shared files remain until their
last owner is removed. Remove the browser's load-unpacked registration manually
when neither product needs it.

## Commands

| Command                                               | What it does                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| `aevra-browser mcp`                                   | Stdio MCP server. Starts the daemon when none is running.       |
| `aevra-browser serve`                                 | Runs the daemon in the foreground. Exits 0 if one already runs. |
| `aevra-browser pair`                                  | Prints a one-time pairing code.                                 |
| `aevra-browser unpair <id>` / `--all`                 | Removes one pairing. `--all` also invalidates every token.      |
| `aevra-browser status [--json] [--show-token]`        | Shows the daemon, ports, connection state and paired profiles.  |
| `aevra-browser stop`                                  | Stops the daemon.                                               |
| `aevra-browser cdp [--port <n>]`                      | Attaches to a browser started with `--remote-debugging-port`.   |
| `aevra-browser extension install [--dir <p>] [--yes]` | Downloads the extension zip and unpacks it safely.              |

## Ports and environment

The [implemented startup-port specification](docs/specs/custom-startup-ports.md) describes validation, precedence and daemon reuse in detail.

Choose listener ports for one invocation with either a consecutive block or individual options:

```bash
aevra-browser serve --basePort=51000
# Pairing/settings: 51000; MCP: 51001; extension WebSocket: 51002
aevra-browser pair --up 51010 --mp=51020 --wp 51030
aevra-browser cdp --port=9222 --basePort=51000
aevra-browser agent install codex --basePort=51000
```

`--ui-port` (`--up`), `--mcp-port` (`--mp`) and `--ws-port` (`--wp`) accept any subset;
the remaining listeners keep their environment or saved defaults. Both `--flag=N` and
`--flag N` work on `serve`, `mcp`, `pair`, `cdp`, `ui` and `agent install`.
CLI choices override environment and saved settings without rewriting `config.json`.
Explicit agent installations remember those choices per credential for stdio auto-start;
HTTP installations use the actual running MCP listener URL when the daemon is already running.

Do not mix `--basePort` with individual options or repeat a listener through either alias.
Listener values must be decimal integers from 1 to 65535, distinct from one another;
`--basePort` must be at most 65533. If an explicitly requested listener differs from a
running daemon, stop it with `aevra-browser stop` and retry. A command without listener
options can continue using the running daemon's actual ports. CDP's existing `--port`
still selects the browser debugging target independently.

All listeners bind `127.0.0.1` only. The defaults do not overlap aevra's `47830-47833`,
so both can run on one machine.

| Listener                             | Default | Environment variable      |
| ------------------------------------ | ------- | ------------------------- |
| Pairing HTTP (`/api/browser/pair`)   | `47841` | `AEVRA_BROWSER_PAIR_PORT` |
| MCP HTTP (`/mcp`)                    | `47842` | `AEVRA_BROWSER_MCP_PORT`  |
| Extension WebSocket                  | `47843` | `AEVRA_BROWSER_WS_PORT`   |
| CDP target (browser's debugger port) | `9222`  | `AEVRA_BROWSER_CDP_PORT`  |

If a port is taken, `serve` exits non-zero with
`BROWSER_LISTENER_FAILED: port <n> in use (set AEVRA_BROWSER_..._PORT)`.

State (the token signing key, pairings, the daemon lock and the unpacked extension)
lives in `AEVRA_BROWSER_HOME` when set, otherwise `%LOCALAPPDATA%\aevra-browser` on
Windows, `~/Library/Application Support/aevra-browser` on macOS and
`$XDG_STATE_HOME/aevra-browser` (default `~/.local/state/aevra-browser`) on Linux.

## What the tools refuse

Governance is deliberately minimal. These guards always apply:

- credential, one-time-code and payment fields are refused by the extension and CDP
  drivers;
- `browser_navigate` and `browser_tabs` with `action: "open"` refuse browser-internal
  schemes, aevra's and this daemon's own ports, and URLs that carry secret-shaped data;
- vision snapshots of sensitive origins (banking, mail, identity providers and
  similar) are refused, because pixels cannot be redacted;
- text that looks like a secret is refused before it is typed into a page;
- `browser_execute_script` accepts only aevra's bounded action grammar, never
  arbitrary JavaScript;
- page text, logs and tab titles are redacted and marked untrusted before they reach
  the model.

There are no approvals, per-connection grants or audit log. Any client of the daemon
can act on the paired browser, which suits a single-user machine.

## Known limits

- Reconnect uses the saved pairing origin, including custom ports. The server must be available and the saved credential valid.
- One loaded extension can switch between products by pairing port. Only one server controls it at a time; entering a fresh code switches the connection.
- **No signed extension.** Install is load-unpacked, as with aevra.

## Development

```bash
git clone --recurse-submodules https://github.com/the-long-ride/aevra-browser
cd aevra-browser
npm ci
npm test            # compiles, then runs node:test
npm run typecheck
npm run lint        # .ts files stay under 350 lines
npm run coverage    # 85% gate on src/
npm run build && npm run test:package
npm run build:extension
```

`src/vendor.ts` is the only file that imports from `vendor/aevra`. The vendored files
are compiled into `dist/vendor` by the same `tsc` run, and `test:package` fails if a
file the package needs is not shipped. Bumping the submodule is its own commit.

## License

[MIT](LICENSE).
