export const FAVICON_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAEqUlEQVR4AYxWPU8dVxA9++KAaIyhJJJN/oBTUcQdrpCgBCQqE9E6FqSICwqncQooeCAZd3GPnAJkaLDkVPyHEMk0YCmhChECh0ibc2bux+6yPHF1587MmTNz5927u9AB8ITyN6XsLUVLvA1DC68V055P1MAGN75L8Vm4SmvyVTehwQhY4gT4dkp7bqgBGTmFNWv1ypqXeFXUziFFZFSj8huSw3fVQD3KIHtIWKHTI5aAYFhfAY/84JIhJHvZYkhTYemiABtohGMQPsy1BWgw0fzlgQYf2csWWKNSpSzVQDWMG4fSEjM40ZfridGK2lFwW01wlDpR6ujzBOQFaeYF+JrSzuTyBC2Ur0MBQVHLltDnlOVSpNOrN1AjOdVXexLcjCu5PEH3aMcf5gDiD0T7iOdQ6Apwi6EdetEKC/pq5i0XewZu5uaCFSuZyWABNkiXK23NxokxJrRN8hXEC62wcsGKRXNrawu7u+8ouy7vqCmrq6vwMiRV6uTrud5JJ0IFL9RsW2J2zcHAwADW1tZwcHCA/f19ynsK9XsK/U8nn/Dy5c8xOelchY1lx+IdQgBBaUm9W0PQHJuvX6O73kW3uwbXtNfX8eG3D1hcXDTp7+9PabUqNacID6FANoE4aNdvkQBjFxcXWFpawr+fP8MbJa5cxsATlIqnJC0/CpnBpOX3RL/6EMZChMEXu+r6bkxUTIoyMvIVRkcfUEZNvh4dxcjIiBhJCh2tvMIruMnKoVn5/hCSICdJ8xtrASaaBu58cQc7O9s4PDx0+eMQv9Pe3t4ODFfxbUdOzWbYs2PUCqHVNzAs5J6enmJ6ehp9fX0uX1L392FsbCyTgnWjYh3FvAFZbRK6RDjKwcFBHB0d4dG3j3B8coLaCAVdxUTXvpKdDNqccjuhNt08FShCoDDYy3Y6Hbvv4+Nj/Hd1ZZHm4nyhsjyPj5SA/CC4Z9fRsTUAUSnN7o/G0PAw5r+bx8TERAzjxU8vMDQ0lHwZDx9+g6mpKSwvL8ulMJk9cNY2Ti8AGZodLb3k/v0HePPLG/z4/DkuLy/R7Xbx/dOnWFhYwPz8fJLHj8dx9s8ZNjc3rdzc3ByG2TzbQDhMaOgFsKbkUKyBKkAsTeF/nf5pm/769i3id2B7Zwfj4+OYmZlJ0scHcmN9A1e8mr29PTuNe4P3vJZ1Ae+DRc2lBod9ig2gU50F6cL1eV36YQmvNl+BEDRmZ2cxOTlJmaJIT2JlZUUhnJ+fB2wKHz8eGVbYCr9tFZUftH+KBTSkrH4LRDaJpQC/S4EII8cMsPxqnGiDQiR8imU1pZELSy5dcdVd1lPKFteS/JczB+l1cFwJ9gzIMCHOSdNXGnmG+l4jOCqaGQ1PgbKClQQkIOYaHPUGiHMS9pUGyEYebMw7CFCFR6TuEeCsY8yvYUWPK4AGE1iBqxz4f5IE0HsU9a6NXGi154KGOdSo/jWUf018M18ZTAZtm7FS1AaybJ1YFOGPe4SpY0b9Cjzf1kiI2kAuTZ9Qy6yzyutPLJt0jho4a6lAgqNs1o3WNUajjqSq7xtdvxXjnKmBZ0wLTQQygZumpSVaMir0OhY+P0khd6I9n/0PAAD//7Xkv/kAAAAGSURBVAMAcbVx2W9fsqsAAAAASUVORK5CYII=';

export const FAVICON_BUFFER = Buffer.from(FAVICON_PNG_BASE64, 'base64');

export const HTML = String.raw`<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Aevra Browser · Settings &amp; Guide</title>
    <link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,${FAVICON_PNG_BASE64}" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="stylesheet" href="/settings.css" />
    <script defer src="/settings.js"></script>
  </head>
  <body>
    <header class="topbar">
      <div class="brand">
        <span class="brand-badge"><img class="brand-logo" src="data:image/png;base64,${FAVICON_PNG_BASE64}" alt="Aevra" width="18" height="18" /></span>
        <div class="brand-text">
          <strong class="brand-title">AEVRA / BROWSER</strong>
          <small id="connection" class="brand-status">Local daemon</small>
        </div>
      </div>
      <div class="topbar-center">
        <div id="message" role="status" aria-live="polite">Connecting…</div>
      </div>
      <div class="topbar-actions">
        <div class="health-cluster" aria-label="System status">
          <span class="health-chip" id="chip-daemon" data-state="ok"><i></i><span>Daemon</span></span>
          <button type="button" class="health-chip clickable" id="chip-browser" data-state="pending" title="Browser status · Click to download extension"><i></i><span>Browser</span></button>
          <span class="health-chip" id="chip-mcp" data-state="ok"><i></i><span>MCP</span></span>
        </div>
        <button type="button" class="theme-toggle" id="theme-btn" title="Toggle dark/light theme" aria-label="Toggle theme">◐</button>
      </div>
    </header>
    <nav class="top-nav" aria-label="Main tabs">
      <button type="button" class="tab-btn active" data-tab="settings">Settings</button>
      <button type="button" class="tab-btn" data-tab="guide">Guide</button>
      <button type="button" class="tab-btn" data-tab="about">About</button>
    </nav>
    <main class="page">
      <div id="tab-settings" class="tab-panel active">
        <div class="settings-grid">
          <section class="panel" aria-labelledby="runtime-title">
            <div class="panel-head">
              <div>
                <h3 id="runtime-title">Browser Connection</h3>
                <p class="muted">Chromium MV3 extension &amp; CDP attachment</p>
              </div>
              <span id="runtime-status" class="status-badge">Checking…</span>
            </div>
            <div class="actions">
              <button type="button" class="primary" data-action="pair">Create pairing code</button>
              <button type="button" data-action="refresh">Refresh</button>
            </div>
            <div id="pair-box" class="pair-box" hidden>
              <span class="pair-label">ONE-TIME PAIRING CODE</span>
              <output id="pair-code" aria-live="polite"></output>
              <span class="pair-hint">Enter this code into the extension popup. Expires in 5 minutes.</span>
            </div>
            <div class="sub-head">Paired Profiles</div>
            <div id="profiles" class="profiles-list"></div>
          </section>

          <section class="panel" aria-labelledby="agents-title">
            <div class="panel-head">
              <div>
                <h3 id="agents-title">AI Agents</h3>
                <p class="muted">Provision local MCP credentials for coding assistants</p>
              </div>
              <div class="transport-control">
                <label for="transport">Transport:</label>
                <select id="transport">
                  <option value="stdio">stdio</option>
                  <option value="http">HTTP</option>
                </select>
              </div>
            </div>
            <div id="agents" class="agents-list"></div>
          </section>

          <section class="panel full-width" aria-labelledby="config-title">
            <div class="panel-head">
              <div>
                <h3 id="config-title">Daemon Listeners &amp; Paths</h3>
                <p class="muted">Changes take effect on daemon restart. Saved connection stays open.</p>
              </div>
              <button type="submit" form="config" class="primary">Save Configuration</button>
            </div>
            <form id="config">
              <div id="fields" class="config-grid"></div>
            </form>
            <details class="examples-details">
              <summary>HTTP and stdio client connection examples</summary>
              <pre id="examples"></pre>
            </details>
          </section>
        </div>
        <footer class="settings-foot">
          Extension pairing port: root Aevra 47831 · Aevra Browser 47841. Pair with a fresh code to switch servers.
        </footer>
      </div>

      <div id="tab-guide" class="tab-panel">
        <section class="panel guide-ai-section">
          <div class="guide-ai-header">
            <div class="guide-ai-title-wrap">
              <span class="guide-ai-badge">AI Assistant Prompt</span>
              <h3>Connect AI Assistants to Aevra Browser</h3>
              <p>Paste this prompt into Claude Code, Codex, Antigravity, ChatGPT, or Cursor. Automatically bundles the prompt and complete llm.txt specification.</p>
            </div>
            <button type="button" id="copy-prompt-btn" class="primary">Copy prompt + llm.txt</button>
          </div>
          <div class="guide-ai-prompt-display">
            <pre id="guide-prompt-text">You have access to local browser automation via Aevra Browser MCP (10 tools: browser_connect, browser_tabs, browser_navigate, browser_snapshot, browser_act_many, browser_read, browser_execute_script, browser_logs, browser_status, browser_disconnect). Follow the architecture specification below (also available at https://github.com/the-long-ride/aevra-browser/blob/main/llm.txt):</pre>
          </div>
        </section>
        <section class="panel guide-doc-card">
          <div class="guide-doc-header">
            <div>
              <h3>llm.txt — System Specification</h3>
              <p class="muted">Raw specification served at <a href="/llm.txt" target="_blank" rel="noreferrer">/llm.txt</a> · <a href="https://github.com/the-long-ride/aevra-browser/blob/main/llm.txt" target="_blank" rel="noreferrer">GitHub (llm.txt)</a></p>
            </div>
            <button type="button" id="copy-llm-btn">Copy llm.txt</button>
          </div>
          <div id="llm-rendered" class="manual-content">Loading llm.txt…</div>
        </section>
      </div>

      <div id="tab-about" class="tab-panel">
        <div class="about-grid">
          <section class="panel about-card">
            <div class="panel-head">
              <div>
                <h3>Aevra Browser</h3>
                <p class="muted">Local browser automation engine for AI assistants</p>
              </div>
              <span class="about-version-badge" id="about-version">v1.0.0</span>
            </div>
            <p class="about-description">
              Aevra Browser gives AI assistants deep, deterministic control over real web browsers
              on your machine with zero cloud dependencies, physical authority preservation, and focus-free background execution.
            </p>
            <div class="about-spec-grid">
              <div class="spec-item"><span class="spec-label">Author</span><span class="spec-value">the-long-ride</span></div>
              <div class="spec-item"><span class="spec-label">License</span><span class="spec-value">MIT</span></div>
              <div class="spec-item"><span class="spec-label">Engines</span><span class="spec-value">Node &gt;= 24.0.0</span></div>
              <div class="spec-item"><span class="spec-label">Protocols</span><span class="spec-value">MCP · MV3 · CDP</span></div>
            </div>
          </section>

          <section class="panel about-card">
            <div class="panel-head">
              <div>
                <h3>Links &amp; Resources</h3>
                <p class="muted">Ecosystem repositories and documentation</p>
              </div>
            </div>
            <div class="about-links-grid">
              <a class="resource-link-item" href="https://github.com/the-long-ride/aevra-browser" target="_blank" rel="noreferrer">
                <div class="resource-link-info"><strong>GitHub Repository</strong><small>aevra-browser source &amp; releases</small></div>
                <svg class="link-arrow" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 1.5h7v7M10.5 1.5 1.5 10.5"/></svg>
              </a>
              <a class="resource-link-item" href="https://github.com/the-long-ride" target="_blank" rel="noreferrer">
                <div class="resource-link-info"><strong>GitHub Profile</strong><small>@the-long-ride</small></div>
                <svg class="link-arrow" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 1.5h7v7M10.5 1.5 1.5 10.5"/></svg>
              </a>
              <a class="resource-link-item" href="https://github.com/the-long-ride/aevra" target="_blank" rel="noreferrer">
                <div class="resource-link-info"><strong>Aevra Core</strong><small>Root gateway &amp; routing engine</small></div>
                <svg class="link-arrow" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 1.5h7v7M10.5 1.5 1.5 10.5"/></svg>
              </a>
              <a class="resource-link-item" href="https://github.com/the-long-ride/aevra-desktop-use" target="_blank" rel="noreferrer">
                <div class="resource-link-info"><strong>aevra-desktop-use</strong><small>Desktop OS automation companion</small></div>
                <svg class="link-arrow" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 1.5h7v7M10.5 1.5 1.5 10.5"/></svg>
              </a>
              <a class="resource-link-item" href="https://github.com/the-long-ride/aevra-browser/issues" target="_blank" rel="noreferrer">
                <div class="resource-link-info"><strong>GitHub Issues</strong><small>Bug reports &amp; feature requests</small></div>
                <svg class="link-arrow" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 1.5h7v7M10.5 1.5 1.5 10.5"/></svg>
              </a>
              <a class="resource-link-item" href="/llm.txt" target="_blank" rel="noreferrer">
                <div class="resource-link-info"><strong>llm.txt Specification</strong><small>Architecture &amp; MCP tool schema</small></div>
                <svg class="link-arrow" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 1.5h7v7M10.5 1.5 1.5 10.5"/></svg>
              </a>
            </div>
          </section>

          <section class="panel about-card support-card">
            <div class="support-layout">
              <div class="support-content">
                <div class="support-title-row">
                  <span class="support-heart-icon" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="m8 14.25-.345-.666c-.602-.3-1.48-.752-2.45-1.343-1.954-1.189-4.205-3.04-4.205-5.991 0-2.35 1.83-4.25 4.1-4.25 1.34 0 2.456.634 2.9 1.455.444-.821 1.56-1.455 2.9-1.455 2.27 0 4.1 1.9 4.1 4.25 0 2.951-2.251 4.802-4.205 5.99-1.026.626-1.93 1.096-2.528 1.396L8 14.25z"/></svg></span>
                  <h3>Support &amp; Community</h3>
                </div>
                <p class="about-description">
                  Aevra Browser is 100% free and open-source software built for the AI community.
                  If it helped your automation workflows or saved you development hours, consider
                  starring the repo or supporting the author!
                </p>
              </div>
              <div class="support-actions">
                <a class="support-btn primary" href="https://github.com/the-long-ride/aevra-browser" target="_blank" rel="noreferrer">
                  <svg class="support-btn-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z"/></svg>
                  <span>Star on GitHub</span>
                </a>
                <a class="support-btn" href="https://github.com/the-long-ride" target="_blank" rel="noreferrer">
                  <svg class="support-btn-icon heart" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="m8 14.25-.345-.666c-.602-.3-1.48-.752-2.45-1.343-1.954-1.189-4.205-3.04-4.205-5.991 0-2.35 1.83-4.25 4.1-4.25 1.34 0 2.456.634 2.9 1.455.444-.821 1.56-1.455 2.9-1.455 2.27 0 4.1 1.9 4.1 4.25 0 2.951-2.251 4.802-4.205 5.99-1.026.626-1.93 1.096-2.528 1.396L8 14.25z"/></svg>
                  <span>Sponsor &amp; Donate</span>
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
    <dialog id="extension-modal" class="modal-dialog">
      <div class="modal-card">
        <div class="modal-head">
          <div class="modal-title-wrap">
            <span class="modal-badge">Chromium MV3</span>
            <h3>Aevra Browser Extension</h3>
          </div>
          <button type="button" class="modal-close-btn" id="modal-close-btn" aria-label="Close dialog">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-intro">
            Companion browser extension for Chrome, Edge, Brave, and Chromium to enable local automation with zero cloud dependencies.
          </p>
          <div class="modal-release-meta">
            <span class="modal-meta-label">Release Tag:</span>
            <span class="modal-tag-pill" id="modal-tag-version">v1.0.0</span>
          </div>
          <div class="modal-actions-grid">
            <a id="modal-download-link" class="modal-btn primary" href="https://github.com/the-long-ride/aevra-browser/releases/download/v1.0.0/aevra-browser-extension.zip" target="_blank" rel="noreferrer" download>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 12 3.5 7.5h3V1h3v6.5h3L8 12zm-7 2h14v1.5H1V14z"/></svg>
              <span>Download Extension (.zip)</span>
            </a>
            <a id="modal-release-link" class="modal-btn" href="https://github.com/the-long-ride/aevra-browser/releases/tag/v1.0.0" target="_blank" rel="noreferrer">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h7v7M13 3 5 11"/></svg>
              <span>View GitHub Release</span>
            </a>
          </div>
          <div class="modal-guide-box">
            <h4>Install in 3 steps:</h4>
            <ol>
              <li>Unpack <code>aevra-browser-extension.zip</code> to a permanent local directory.</li>
              <li>Navigate to <code>chrome://extensions</code> (or <code>edge://extensions</code>) and enable <strong>Developer mode</strong>.</li>
              <li>Click <strong>Load unpacked</strong> and select the unzipped <code>aevra-extension</code> folder.</li>
            </ol>
          </div>
          <div class="modal-cli-box">
            <span class="muted">Or install automatically via CLI:</span>
            <code>aevra-browser extension install</code>
          </div>
        </div>
      </div>
    </dialog>
  </body>
</html>
`;
