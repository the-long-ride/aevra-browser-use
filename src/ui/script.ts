export const SCRIPT = String.raw`"use strict";
let csrf = "";
let snapshot;
let rawLlmTxt = "";
const $ = (id) => document.getElementById(id);

function notice(text, error = false) {
  const el = $("message");
  el.textContent = text;
  el.className = error ? "error" : "";
}

async function api(url, body) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json", "x-aevra-csrf": csrf } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error?.message || data.error?.code || "Request failed");
  return data;
}

function button(text, fn, cls = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  if (cls) b.className = cls;
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

function switchTab(tab) {
  for (const b of document.querySelectorAll(".tab-btn"))
    b.classList.toggle("active", b.dataset.tab === tab);
  for (const p of document.querySelectorAll(".tab-panel"))
    p.classList.toggle("active", p.id === "tab-" + tab);
}
for (const b of document.querySelectorAll(".tab-btn"))
  b.onclick = () => switchTab(b.dataset.tab);

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("aevra-theme", theme);
}
const savedTheme = localStorage.getItem("aevra-theme") ||
  (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
setTheme(savedTheme);
$("theme-btn").onclick = () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
};

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\x60([^\x60]+)\x60/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const root = document.createElement("div");
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (l.trim() === "---") { root.append(document.createElement("hr")); i++; continue; }
    if (l.startsWith('\x60\x60\x60')) {
      const pre = document.createElement("pre"), code = document.createElement("code"), cl = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('\x60\x60\x60')) cl.push(lines[i++]);
      code.textContent = cl.join("\n");
      pre.append(code); root.append(pre); i++; continue;
    }
    const hm = l.match(/^(#{1,4})\s+(.*)$/);
    if (hm) {
      const h = document.createElement("h" + hm[1].length);
      h.innerHTML = inline(hm[2]); root.append(h); i++; continue;
    }
    if (l.startsWith(">")) {
      const bq = document.createElement("blockquote"), bql = [];
      while (i < lines.length && lines[i].startsWith(">")) bql.push(lines[i++].replace(/^>\s?/, ""));
      bq.innerHTML = inline(bql.join(" ")); root.append(bq); continue;
    }
    if (l.trim().startsWith("|") && l.trim().endsWith("|")) {
      const tbl = document.createElement("table"), rows = [];
      tbl.className = "manual-table";
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|"))
        rows.push(lines[i++].trim());
      if (rows.length >= 2) {
        const thead = document.createElement("thead"), tr = document.createElement("tr");
        for (const th of rows[0].split("|").slice(1, -1)) {
          const c = document.createElement("th"); c.innerHTML = inline(th.trim()); tr.append(c);
        }
        thead.append(tr); tbl.append(thead);
        const tbody = document.createElement("tbody");
        for (let r = 2; r < rows.length; r++) {
          const rtr = document.createElement("tr");
          for (const td of rows[r].split("|").slice(1, -1)) {
            const c = document.createElement("td"); c.innerHTML = inline(td.trim()); rtr.append(c);
          }
          tbody.append(rtr);
        }
        tbl.append(tbody); root.append(tbl);
      }
      continue;
    }
    if (l.match(/^[-*]\s+/)) {
      const ul = document.createElement("ul");
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        const li = document.createElement("li");
        li.innerHTML = inline(lines[i++].replace(/^[-*]\s+/, ""));
        ul.append(li);
      }
      root.append(ul); continue;
    }
    if (l.match(/^\d+\.\s+/)) {
      const ol = document.createElement("ol");
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        const li = document.createElement("li");
        li.innerHTML = inline(lines[i++].replace(/^\d+\.\s+/, ""));
        ol.append(li);
      }
      root.append(ol); continue;
    }
    const p = document.createElement("p");
    p.innerHTML = inline(l); root.append(p); i++;
  }
  return root;
}

async function loadGuide() {
  try {
    const res = await fetch("/llm.txt");
    if (!res.ok) throw new Error("Could not load /llm.txt");
    rawLlmTxt = await res.text();
    const rendered = renderMarkdown(rawLlmTxt);
    $("llm-rendered").replaceChildren(rendered);
  } catch (e) {
    $("llm-rendered").textContent = "Unable to load guide: " + e.message;
  }
}

async function copyText(btn, text) {
  await navigator.clipboard.writeText(text);
  const orig = btn.textContent;
  btn.textContent = "Copied!";
  setTimeout(() => (btn.textContent = orig), 2000);
}

$("copy-prompt-btn").onclick = async (e) => {
  const prompt = $("guide-prompt-text").textContent.trim();
  if (!rawLlmTxt) {
    try {
      const res = await fetch("/llm.txt");
      if (res.ok) rawLlmTxt = await res.text();
    } catch {}
  }
  const full = rawLlmTxt
    ? prompt + "\n\n--- System Specification (llm.txt) ---\n\n" + rawLlmTxt
    : prompt;
  await copyText(e.target, full);
};
$("copy-llm-btn").onclick = (e) => copyText(e.target, rawLlmTxt);

async function refresh() {
  const data = await api("/api/settings");
  csrf = data.csrf;
  snapshot = data.snapshot;
  render();
}

function render() {
  const s = snapshot;
  const conn = s.status?.connectionState;
  const pairings = s.pairings || [];
  $("chip-browser").dataset.state =
    conn === "attached" || pairings.length > 0 ? "ok" : "pending";
  $("runtime-status").textContent = conn || "Waiting for extension";
  $("runtime-status").className =
    "status-badge" + (conn === "attached" ? " ok" : "");
  $("connection").textContent = "Local daemon · :" + s.ports.pair;
  if (s.version) {
    const tag = "v" + s.version;
    $("about-version").textContent = tag;
    $("modal-tag-version").textContent = tag;
    const base = "https://github.com/the-long-ride/aevra-browser/releases";
    $("modal-download-link").href = base + "/download/" + tag + "/aevra-browser-extension.zip";
    $("modal-release-link").href = base + "/tag/" + tag;
  }

  $("fields").replaceChildren();
  const labelMap = {
    pairPort: "Pairing port", mcpPort: "MCP HTTP port", wsPort: "Extension WS port",
    cdpPort: "CDP port", extensionDir: "Extension path", idleTimeout: "Idle timeout (minutes, 0 to disable)"
  };
  for (const [key, value] of Object.entries(s.config.effective)) {
    const row = document.createElement("div");
    row.className = "field";
    const head = document.createElement("div");
    head.className = "field-label-row";
    const label = document.createElement("label");
    label.htmlFor = key;
    label.textContent = labelMap[key] || key;
    const source = document.createElement("span");
    source.className = "source-tag";
    source.textContent = s.config.sources[key];
    head.append(label, source);
    const input = document.createElement("input");
    input.id = key;
    input.name = key;
    input.value = value;
    input.type = key === "extensionDir" ? "text" : "number";
    if (input.type === "number") {
      input.min = key === "idleTimeout" ? "0" : "1";
      input.max = key === "idleTimeout" ? "525600" : "65535";
      input.required = true;
    }
    input.disabled = s.config.sources[key] === "environment";
    row.append(head, input);
    $("fields").append(row);
  }

  $("profiles").replaceChildren();
  if (pairings.length === 0) {
    const empty = document.createElement("div");
    empty.className = "profiles-empty";
    empty.textContent = "No paired extension profiles yet. Click 'Create pairing code' above to link Chrome.";
    $("profiles").append(empty);
  } else {
    for (const p of pairings) {
      const row = document.createElement("div");
      row.className = "profile-row";
      const name = document.createElement("span");
      name.className = "profile-name";
      name.textContent = p.profileName;
      row.append(name, button("Unpair", async () => {
        await action({ action: "unpair", id: p.pairingId });
        await refresh();
      }, "danger-btn"));
      $("profiles").append(row);
    }
  }

  $("examples").textContent = JSON.stringify({
    stdio: { command: "aevra-browser", args: ["mcp"] },
    http: { url: "http://127.0.0.1:" + s.ports.mcp + "/mcp", authentication: "Install an agent with HTTP to provision its credential." }
  }, null, 2);

  $("agents").replaceChildren();
  for (const target of ["codex", "claude-code", "opencode", "antigravity", "antigravity-cli", "antigravity-ide"]) {
    const row = document.createElement("div"), info = document.createElement("div"), name = document.createElement("strong"), dot = document.createElement("i");
    row.className = "agent-card"; info.className = "agent-info"; name.className = "agent-name";
    const isInstalled = s.agents?.some((a) => a.target === target && a.state === "installed");
    name.dataset.installed = String(isInstalled);
    dot.title = isInstalled ? "Installed" : "Not installed";
    name.append(dot, document.createTextNode(target)); info.append(name);
    const actions = document.createElement("div"); actions.className = "agent-actions";
    actions.append(button("Install", () => agent("install", target)), button("Uninstall", () => agent("uninstall", target)));
    row.append(info, actions); $("agents").append(row);
  }
}

async function action(body) {
  return api("/api/action", body);
}

async function agent(operation, target) {
  const result = await action({ action: "agent", operation, target, transport: $("transport")?.value || "stdio" });
  await refresh();
  notice(result.message || "Agent integration updated. Restart or refresh the agent to apply.");
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
    $("pair-box").hidden = false;
    notice("Enter one-time code " + result.code + " and pairing port " + snapshot.ports.pair + " in the extension. Expires in 5 minutes.");
  });

const modal = $("extension-modal");
const closeModal = () => (modal.close ? modal.close() : modal.removeAttribute("open"));
$("chip-browser").onclick = () => (modal.showModal ? modal.showModal() : modal.setAttribute("open", ""));
$("modal-close-btn").onclick = closeModal;
modal.onclick = (e) => { if (e.target === modal) closeModal(); };

run(async () => {
  const hash = location.hash.slice(1);
  if (["settings", "guide", "about"].includes(hash)) {
    switchTab(hash);
  } else if (hash) {
    history.replaceState(null, "", location.pathname);
    const auth = await api("/api/session", { token: hash });
    csrf = auth.csrf;
  }
  await refresh();
  await loadGuide();
  if (snapshot.config.problem) notice(snapshot.config.problem, true);
  else notice("Settings loaded.");
});
`;
