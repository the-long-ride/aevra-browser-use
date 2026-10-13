export const SCRIPT = String.raw`"use strict";
let csrf = "";
let snapshot;
const $ = (id) => document.getElementById(id);
function notice(text, error = false) {
  $("message").textContent = text;
  $("message").className = error ? "error" : "";
}
async function api(url, body) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body
      ? { "content-type": "application/json", "x-aevra-csrf": csrf }
      : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error?.message || data.error?.code || "Request failed");
  return data;
}
function button(text, fn) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.onclick = () => run(fn);
  return b;
}
async function run(fn) {
  const buttons = [...document.querySelectorAll("button")];
  buttons.forEach((b) => (b.disabled = true));
  try {
    await fn();
  } catch (e) {
    notice(e.message, true);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}
async function refresh() {
  const data = await api("/api/settings");
  csrf = data.csrf;
  snapshot = data.snapshot;
  render();
}
function render() {
  const s = snapshot;
  $("runtime-status").textContent =
    s.status?.connectionState || "Waiting for extension";
  $("connection").textContent = "Connected to local daemon";
  $("fields").replaceChildren();
  for (const [key, value] of Object.entries(s.config.effective)) {
    const row = document.createElement("div");
    row.className = "field";
    const label = document.createElement("label");
    label.htmlFor = key;
    label.textContent = {
      pairPort: "Pairing / settings port",
      mcpPort: "MCP HTTP port",
      wsPort: "Extension WebSocket port",
      cdpPort: "CDP port",
      extensionDir: "Extension directory",
    }[key];
    const source = document.createElement("span");
    source.className = "source";
    source.textContent = "Effective source: " + s.config.sources[key];
    label.append(document.createElement("br"), source);
    const input = document.createElement("input");
    input.id = key;
    input.name = key;
    input.value = value;
    input.type = key === "extensionDir" ? "text" : "number";
    if (input.type === "number") {
      input.min = "1";
      input.max = "65535";
      input.required = true;
    }
    input.disabled = s.config.sources[key] === "environment";
    row.append(label, input);
    $("fields").append(row);
  }
  $("profiles").replaceChildren();
  for (const p of s.pairings || []) {
    const row = document.createElement("div");
    row.className = "profile";
    const text = document.createElement("span");
    text.textContent = p.profileName;
    row.append(
      text,
      button("Unpair", async () => {
        await action({ action: "unpair", id: p.pairingId });
        await refresh();
      }),
    );
    $("profiles").append(row);
  }
  $("examples").textContent = JSON.stringify(
    {
      stdio: { command: "aevra-browser", args: ["mcp"] },
      http: {
        url: "http://127.0.0.1:" + s.ports.mcp + "/mcp",
        authentication:
          "Install an agent with HTTP to provision its credential.",
      },
    },
    null,
    2,
  );
  $("agents").replaceChildren();
  for (const target of ["codex", "claude-code", "opencode", "antigravity"]) {
    const row = document.createElement("div");
    row.className = "agent";
    const label = document.createElement("span");
    label.textContent =
      target +
      " · " +
      (s.agents?.find((a) => a.target === target)?.state || "Not installed");
    row.append(
      label,
      button("Install", () => agent("install", target)),
      button("Uninstall", () => agent("uninstall", target)),
    );
    $("agents").append(row);
  }
}
async function action(body) {
  return api("/api/action", body);
}
async function agent(operation, target) {
  const result = await action({
    action: "agent",
    operation,
    target,
    transport: $("transport").value,
  });
  await refresh();
  notice(
    result.message ||
      "Agent integration updated. Restart or refresh the agent to apply.",
  );
}
$("config").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    const settings = {};
    for (const input of $("fields").querySelectorAll("input"))
      if (!input.disabled)
        settings[input.name] =
          input.type === "number" ? Number(input.value) : input.value;
    await action({ action: "config", settings });
    await refresh();
    notice("Saved. Restart the daemon to apply listener changes.");
  });
};
document.querySelector("[data-action=refresh]").onclick = () => run(refresh);
document.querySelector("[data-action=pair]").onclick = () =>
  run(async () => {
    const result = await action({ action: "pair" });
    $("pair-code").textContent = result.code;
    notice(
      "Enter this one-use code and pairing port " +
        snapshot.ports.pair +
        " in the extension. Expires in 5 minutes.",
    );
  });
run(async () => {
  const token = location.hash.slice(1);
  history.replaceState(null, "", location.pathname);
  if (token) {
    const auth = await api("/api/session", { token });
    csrf = auth.csrf;
  }
  await refresh();
  if (snapshot.config.problem) notice(snapshot.config.problem, true);
  else notice("Settings loaded.");
});
`;
