export const STYLE = String.raw`:root,
:root[data-theme='light'] {
  color-scheme: light;
  --canvas: #fdfcfc; --surface-soft: #f8f7f7; --surface-card: #f1eeee; --surface-strong: #e7e3e3;
  --ink: #201d1d; --ink-deep: #0f0000; --body: #424245; --mute: #646262; --stone: #6e6e73; --ash: #9a9898;
  --hairline: rgb(15 0 0 / 12%); --hairline-strong: #646262; --accent: #007aff;
  --warning: #ff9f0a; --danger: #ff3b30; --success: #30d158; --on-ink: #fdfcfc; --radius-sm: 4px;
}
:root[data-theme='dark'] {
  color-scheme: dark;
  --canvas: #171515; --surface-soft: #1e1b1b; --surface-card: #292525; --surface-strong: #353030;
  --ink: #fdfcfc; --ink-deep: #ffffff; --body: #d5d1d1; --mute: #aaa5a5; --stone: #908b8b; --ash: #747070;
  --hairline: rgb(253 252 252 / 14%); --hairline-strong: #817b7b; --accent: #0a84ff;
  --warning: #ff9f0a; --danger: #ff453a; --success: #32d74b; --on-ink: #171515; --radius-sm: 4px;
}
* {
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--ink) 24%, transparent) transparent;
}
*::-webkit-scrollbar { width: 6px; height: 6px; }
*::-webkit-scrollbar-track, *::-webkit-scrollbar-corner { background: transparent; }
*::-webkit-scrollbar-thumb { border-radius: 9999px; background: color-mix(in srgb, var(--ink) 22%, transparent); }
html, body {
  margin: 0; min-height: 100vh; background: var(--canvas); color: var(--ink);
  font-family: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 13px; line-height: 1.5;
}
.topbar {
  position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between;
  gap: 16px; min-height: 52px; padding: 8px 20px; border-bottom: 1px solid var(--hairline); background: var(--canvas);
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand-badge {
  display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px;
  border: 1px solid var(--hairline-strong); background: var(--surface-card); color: var(--ink);
  font-size: 11px; font-weight: 700; border-radius: var(--radius-sm);
}
.brand-logo { display: block; width: 18px; height: 18px; border-radius: 2px; }
.brand-title { color: var(--ink); font-size: 13px; font-weight: 700; letter-spacing: 0.06em; }
.brand-status { display: block; color: var(--mute); font-size: 11px; }
.topbar-center { flex: 1; max-width: 480px; text-align: center; }
#message {
  display: inline-block; font-size: 11px; color: var(--mute); padding: 2px 10px;
  border-radius: var(--radius-sm); background: var(--surface-soft); border: 1px solid var(--hairline);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
}
#message.error {
  color: var(--danger); border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, var(--canvas));
}
.topbar-actions { display: flex; align-items: center; gap: 10px; }
.health-cluster { display: flex; align-items: center; gap: 4px; }
.health-chip {
  display: inline-flex; align-items: center; gap: 5px; min-height: 26px;
  border: 1px solid var(--hairline); padding: 2px 7px; color: var(--mute);
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; border-radius: 0;
  background: var(--surface-soft); font-family: inherit; line-height: 1;
}
.health-chip.clickable { cursor: pointer; transition: border-color 120ms ease, color 120ms ease; }
.health-chip.clickable:hover { border-color: var(--hairline-strong); color: var(--ink); }
.health-chip i { width: 6px; height: 6px; border-radius: 50%; background: var(--ash); }
.health-chip[data-state='ok'] i { background: var(--success); }
.health-chip[data-state='pending'] i { background: var(--warning); }
.health-chip[data-state='error'] i { background: var(--danger); }
.theme-toggle {
  background: transparent; border: 1px solid var(--hairline); border-radius: var(--radius-sm);
  color: var(--mute); padding: 4px 8px; cursor: pointer; font-size: 13px; font-family: inherit;
}
.theme-toggle:hover { color: var(--ink); border-color: var(--hairline-strong); }
.top-nav {
  position: sticky; top: 52px; z-index: 19; display: flex; flex-wrap: nowrap; gap: 0;
  overflow-x: auto; overscroll-behavior-x: contain; padding: 0 16px;
  border-bottom: 1px solid var(--hairline-strong); background: var(--canvas); white-space: nowrap;
}
.top-nav button, .tab-btn {
  flex: 0 0 auto; min-height: 40px; border: 0 !important; border-bottom: 2px solid transparent !important;
  border-radius: 0 !important; background: transparent !important; padding: 8px 14px 6px;
  color: var(--mute); font-size: 13px; font-weight: 500; font-family: inherit;
  cursor: pointer; white-space: nowrap; transition: color 120ms ease, border-color 120ms ease;
}
.top-nav button:hover, .top-nav button.active, .tab-btn:hover, .tab-btn.active {
  background: transparent !important; color: var(--ink); border-color: transparent !important;
}
.top-nav button.active, .tab-btn.active {
  border-bottom-color: var(--ink) !important; font-weight: 600;
}
.page { width: min(100%, 1160px); margin: 0 auto; padding: 16px 20px; }
.tab-panel { display: none; }
.tab-panel.active { display: block; }
.settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.panel { border: 1px solid var(--hairline); background: var(--canvas); border-radius: 0; padding: 14px 16px; }
.panel.full-width { grid-column: 1 / -1; }
.panel-head {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
  margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--hairline);
}
.panel-head h3 {
  margin: 0; font-size: 13px; font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--ink);
}
.panel-head p, .muted { margin: 2px 0 0; font-size: 11px; color: var(--mute); }
.status-badge {
  font-size: 10px; font-family: inherit; text-transform: uppercase; letter-spacing: 0.04em;
  padding: 2px 6px; border: 1px solid var(--hairline); background: var(--surface-card);
  color: var(--mute); border-radius: 2px; white-space: nowrap;
}
.status-badge.ok {
  color: var(--success); border-color: var(--success);
  background: color-mix(in srgb, var(--success) 8%, var(--canvas));
}
.sub-head {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--stone); margin: 12px 0 6px;
}
button, input, select {
  font-family: inherit; font-size: 12px; color: var(--ink); background: var(--surface-soft);
  border: 1px solid var(--hairline); border-radius: var(--radius-sm); padding: 5px 9px; line-height: 1.4;
}
button {
  cursor: pointer; background: var(--canvas); border-color: var(--hairline-strong);
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
button:hover:not(:disabled) { background: var(--surface-soft); border-color: var(--ink); }
button:disabled { background: var(--surface-card); color: var(--ash); cursor: default; opacity: 0.6; }
button.primary { border-color: var(--ink); background: var(--ink); color: var(--on-ink); font-weight: 600; }
button.primary:hover:not(:disabled) { background: var(--ink-deep); border-color: var(--ink-deep); }
button.danger-btn { border-color: var(--danger); color: var(--danger); background: transparent; }
button.danger-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--danger) 10%, var(--canvas)); }
input:hover, select:hover { border-color: var(--hairline-strong); }
input:focus, select:focus { border-color: var(--ink); outline: none; background: var(--canvas); }
.actions { display: flex; align-items: center; gap: 8px; margin: 10px 0; }
.transport-control { display: flex; align-items: center; gap: 6px; }
.transport-control label { font-size: 11px; color: var(--mute); margin: 0; }
.transport-control select { padding: 3px 6px; font-size: 11px; width: auto; }
.pair-box {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  border: 1px dashed var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--surface-soft));
  padding: 12px; margin: 10px 0; border-radius: var(--radius-sm); text-align: center;
}
.pair-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--stone); }
output#pair-code {
  font-size: 26px; font-weight: 700; letter-spacing: 0.2em; color: var(--accent);
  margin: 4px 0; user-select: all; font-family: inherit;
}
.pair-hint { font-size: 11px; color: var(--mute); }
.profiles-list { display: grid; gap: 6px; }
.profile-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 6px 10px; border: 1px solid var(--hairline); background: var(--surface-soft); border-radius: var(--radius-sm);
}
.profile-name { display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--ink); font-size: 12px; }
.profile-name::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--success); }
.profiles-empty {
  padding: 10px 12px; border: 1px dashed var(--hairline-strong); color: var(--mute);
  font-size: 11px; text-align: center; border-radius: var(--radius-sm);
}
.agents-list { display: grid; gap: 6px; }
.agent-card {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 6px 10px; border: 1px solid var(--hairline); background: var(--surface-soft); border-radius: var(--radius-sm);
}
.agent-card:hover { border-color: var(--hairline-strong); }
.agent-info { display: flex; align-items: center; gap: 8px; min-width: 0; }
.agent-name {
  display: inline-flex; align-items: center; gap: 7px; font-weight: 600; font-size: 12px;
  color: var(--ink); font-family: inherit;
}
.agent-name i { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.agent-name[data-installed='true'] i { background: var(--success); }
.agent-name[data-installed='false'] i { background: var(--danger); opacity: 0.85; }
.agent-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.config-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; margin-bottom: 12px; }
.field {
  display: flex; flex-direction: column; gap: 5px; padding: 8px 10px;
  background: var(--surface-soft); border: 1px solid var(--hairline); border-radius: var(--radius-sm);
}
.field-label-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.field label { font-size: 11px; font-weight: 600; color: var(--body); text-transform: uppercase; letter-spacing: 0.03em; margin: 0; }
.field .source-tag {
  font-size: 9px; color: var(--mute); background: var(--surface-card);
  padding: 1px 5px; border-radius: 2px; border: 1px solid var(--hairline);
}
.field input { width: 100%; background: var(--canvas); padding: 4px 7px; }
details.examples-details {
  margin-top: 10px; border: 1px solid var(--hairline); border-radius: var(--radius-sm);
  padding: 8px 12px; background: var(--surface-soft);
}
details.examples-details summary { cursor: pointer; color: var(--mute); font-size: 12px; font-weight: 600; outline: none; }
pre {
  margin: 8px 0 0; background: var(--surface-card); border: 1px solid var(--hairline);
  padding: 10px; border-radius: var(--radius-sm); overflow-x: auto; font-size: 11px; line-height: 1.45; color: var(--ink);
}
footer.settings-foot { font-size: 11px; color: var(--mute); margin-top: 16px; text-align: center; }
.guide-ai-section {
  border: 1px solid var(--hairline); background: var(--surface-soft); padding: 14px 16px;
  border-radius: 0; margin-bottom: 14px; display: flex; flex-direction: column; gap: 10px;
}
.guide-ai-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; }
.guide-ai-badge { font-size: 10px; text-transform: uppercase; color: var(--accent); font-weight: 700; letter-spacing: 0.05em; }
.guide-ai-title-wrap h3 { margin: 2px 0 4px; font-size: 14px; font-weight: 700; color: var(--ink); }
.guide-ai-title-wrap p { margin: 0; font-size: 11px; color: var(--mute); }
.guide-ai-prompt-display pre { margin: 0; font-size: 11px; white-space: pre-wrap; word-break: break-word; }
.guide-doc-card { border: 1px solid var(--hairline); background: var(--canvas); padding: 16px; border-radius: 0; }
.guide-doc-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  border-bottom: 1px solid var(--hairline); padding-bottom: 10px; margin-bottom: 14px;
}
.guide-doc-header h3 { margin: 0 0 2px; font-size: 14px; font-weight: 700; color: var(--ink); }
.manual-content { font-size: 12px; line-height: 1.65; color: var(--body); }
.manual-content h1, .manual-content h2, .manual-content h3, .manual-content h4 { color: var(--ink); }
.manual-content h1 { font-size: 16px; font-weight: 700; border-bottom: 1px solid var(--hairline); padding-bottom: 6px; margin: 18px 0 8px; }
.manual-content h2 { font-size: 14px; font-weight: 600; border-bottom: 1px solid var(--hairline); padding-bottom: 4px; margin: 14px 0 6px; }
.manual-content h3 { font-size: 13px; font-weight: 600; margin: 12px 0 4px; }
.manual-content h4 { font-size: 12px; font-weight: 700; margin: 10px 0 3px; }
.manual-content hr { border: 0; border-top: 1px solid var(--hairline); margin: 16px 0; }
.manual-content blockquote {
  margin: 10px 0; padding: 6px 12px; border-left: 3px solid var(--accent);
  background: var(--surface-soft); color: var(--body); font-size: 11.5px;
}
.manual-content code { font-family: inherit; font-size: 11px; background: var(--surface-card); padding: 2px 5px; border-radius: 3px; border: 1px solid var(--hairline); }
.manual-content pre code { padding: 0; background: transparent; border: 0; }
.manual-content ul, .manual-content ol { padding-left: 18px; margin: 6px 0; }
.manual-content li { margin-bottom: 3px; }
.manual-content a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.manual-content a:hover { color: var(--ink); }
.manual-table { width: 100%; border-collapse: collapse; margin: 12px 0 16px; font-size: 11px; }
.manual-table th, .manual-table td { padding: 6px 10px; border: 1px solid var(--hairline); text-align: left; vertical-align: top; }
.manual-table th { background: var(--surface-soft); font-weight: 600; color: var(--ink); }
.manual-table tr:nth-child(even) td { background: var(--surface-soft); }
.about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.about-card { display: flex; flex-direction: column; }
.about-version-badge {
  font-size: 11px; color: var(--accent); background: var(--surface-soft); border: 1px solid var(--hairline);
  padding: 2px 7px; border-radius: var(--radius-sm); font-family: inherit;
}
.about-description { color: var(--body); font-size: 12px; line-height: 1.55; margin: 0 0 12px; }
.about-spec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: auto; }
.spec-item {
  display: flex; flex-direction: column; gap: 2px; padding: 7px 10px;
  background: var(--surface-soft); border: 1px solid var(--hairline); border-radius: var(--radius-sm);
}
.spec-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--mute); }
.spec-value { font-size: 12px; font-weight: 600; color: var(--ink); }
.about-links-grid { display: flex; flex-direction: column; gap: 6px; }
.resource-link-item {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 6px 10px; border: 1px solid var(--hairline); border-radius: var(--radius-sm);
  background: var(--surface-soft); color: var(--ink); text-decoration: none;
  transition: background 120ms ease, border-color 120ms ease;
}
.resource-link-item:hover { background: var(--surface-card); border-color: var(--hairline-strong); }
.resource-link-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.resource-link-info strong { font-size: 12px; font-weight: 600; color: var(--ink); }
.resource-link-info small { font-size: 11px; color: var(--mute); }
.link-arrow { flex-shrink: 0; color: var(--mute); transition: transform 120ms ease, color 120ms ease; }
.resource-link-item:hover .link-arrow { color: var(--accent); transform: translate(1px, -1px); }
.support-card { grid-column: 1 / -1; }
.support-layout { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.support-content { max-width: 680px; }
.support-content .about-description { margin-bottom: 0; }
.support-title-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.support-title-row h3 { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink); }
.support-heart-icon { display: inline-flex; align-items: center; color: var(--danger); }
.support-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.support-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  text-decoration: none; padding: 7px 14px; font-size: 12px; font-weight: 600;
  border-radius: var(--radius-sm); border: 1px solid var(--hairline-strong);
  background: var(--surface-soft); color: var(--ink); white-space: nowrap;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.support-btn:hover { background: var(--surface-card); border-color: var(--ink); color: var(--ink); }
.support-btn.primary { background: var(--ink); color: var(--on-ink); border-color: var(--ink); }
.support-btn.primary:hover { background: var(--ink-deep); border-color: var(--ink-deep); }
.support-btn-icon { width: 14px; height: 14px; flex-shrink: 0; fill: currentColor; }
.support-btn-icon.heart { color: #eb367f; }
.support-btn.primary .support-btn-icon { color: var(--on-ink); }
.modal-dialog {
  border: 1px solid var(--hairline-strong); background: var(--canvas); color: var(--ink);
  padding: 0; border-radius: var(--radius-sm); max-width: 480px; width: calc(100% - 32px);
  box-shadow: 0 16px 40px rgba(0,0,0,0.6);
}
.modal-dialog::backdrop { background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(2px); }
.modal-card { display: flex; flex-direction: column; padding: 18px 20px; gap: 14px; }
.modal-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--hairline); padding-bottom: 12px; }
.modal-title-wrap { display: flex; flex-direction: column; gap: 3px; }
.modal-badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent); background: var(--surface-soft); border: 1px solid var(--hairline); padding: 1px 5px; border-radius: 2px; width: fit-content; }
.modal-head h3 { margin: 0; font-size: 13px; font-weight: 700; color: var(--ink); }
.modal-close-btn { background: transparent; border: none; font-size: 14px; color: var(--mute); padding: 2px 6px; cursor: pointer; border-radius: var(--radius-sm); line-height: 1; }
.modal-close-btn:hover { color: var(--ink); background: var(--surface-soft); }
.modal-body { display: flex; flex-direction: column; gap: 14px; }
.modal-intro { font-size: 12px; line-height: 1.5; color: var(--body); margin: 0; }
.modal-release-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 8px 12px; background: var(--surface-soft); border: 1px solid var(--hairline); border-radius: var(--radius-sm); }
.modal-meta-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mute); }
.modal-tag-pill { font-size: 11px; font-weight: 700; color: var(--accent); font-family: inherit; }
.modal-actions-grid { display: flex; flex-wrap: wrap; gap: 10px; }
.modal-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  text-decoration: none; padding: 8px 14px; font-size: 12px; font-weight: 600;
  border-radius: var(--radius-sm); border: 1px solid var(--hairline-strong);
  background: var(--surface-soft); color: var(--ink); flex: 1; min-width: 170px;
  transition: background 120ms ease, border-color 120ms ease;
}
.modal-btn:hover { background: var(--surface-card); border-color: var(--ink); }
.modal-btn.primary { background: var(--ink); color: var(--on-ink); border-color: var(--ink); }
.modal-btn.primary:hover { background: var(--ink-deep); }
.modal-btn svg { flex-shrink: 0; }
.modal-guide-box { background: var(--surface-soft); border: 1px solid var(--hairline); padding: 12px 14px; border-radius: var(--radius-sm); font-size: 11px; }
.modal-guide-box h4 { margin: 0 0 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--ink); }
.modal-guide-box ol { margin: 0; padding-left: 18px; color: var(--body); line-height: 1.6; }
.modal-guide-box li { margin-bottom: 4px; }
.modal-guide-box code { font-size: 11px; background: var(--surface-card); padding: 1px 4px; border-radius: 2px; }
.modal-cli-box { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; padding: 8px 12px; border: 1px dashed var(--hairline); border-radius: var(--radius-sm); }
.modal-cli-box code { font-size: 11px; color: var(--accent); }
@media (max-width: 820px) {
  .settings-grid, .about-grid { grid-template-columns: 1fr; }
  .panel.full-width, .support-card { grid-column: auto; }
  .support-layout { flex-direction: column; align-items: stretch; gap: 12px; }
  .support-actions { width: 100%; }
  .support-actions .support-btn { flex: 1; }
}
@media (max-width: 680px) {
  .topbar { padding: 8px 12px; gap: 8px; flex-wrap: wrap; }
  .topbar-center { order: 3; width: 100%; max-width: none; }
  #message { width: 100%; text-align: center; }
  .topbar-actions { gap: 6px; }
  .top-nav { top: 88px; padding: 0 10px; }
  .page { padding: 12px; }
  .guide-ai-header, .guide-doc-header { flex-direction: column; align-items: stretch; gap: 10px; }
  .guide-ai-header button, .guide-doc-header button { width: 100%; white-space: nowrap; }
}
`;
