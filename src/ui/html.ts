export const HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Aevra Browser · Settings</title>
    <link rel="stylesheet" href="/settings.css" />
    <script defer src="/settings.js"></script>
  </head>
  <body>
    <header>
      <span class="brand">AEVRA / BROWSER</span
      ><span id="connection">Local settings</span>
    </header>
    <main>
      <h1>Browser settings</h1>
      <p class="intro">
        Manage your local browser connection and agent integrations.
      </p>
      <p id="message" role="status" aria-live="polite">Connecting…</p>
      <section aria-labelledby="runtime-title">
        <h2 id="runtime-title">Connection</h2>
        <p id="runtime-status"></p>
        <div class="actions">
          <button data-action="pair">Create pairing code</button
          ><button data-action="refresh">Refresh</button>
        </div>
        <output id="pair-code" aria-live="polite"></output>
        <div id="profiles"></div>
      </section>
      <section aria-labelledby="config-title">
        <h2 id="config-title">Configuration</h2>
        <p>
          Listener changes take effect after restarting the daemon. Your current
          connection stays open.
        </p>
        <form id="config">
          <div id="fields"></div>
          <button type="submit">Save configuration</button>
        </form>
        <details>
          <summary>HTTP and stdio connection examples</summary>
          <pre id="examples"></pre>
        </details>
      </section>
      <section aria-labelledby="agents-title">
        <h2 id="agents-title">AI agents</h2>
        <p>
          Skills share one canonical copy in ~/.agents/skills. Each integration
          has its own credential.
        </p>
        <label for="transport">Connection</label
        ><select id="transport">
          <option value="stdio">stdio (recommended)</option>
          <option value="http">HTTP</option>
        </select>
        <div id="agents"></div>
      </section>
      <footer>
        Extension pairing port: root Aevra 47831 · Aevra Browser 47841. Pair
        with a fresh code to switch servers.
      </footer>
    </main>
  </body>
</html>
`;
