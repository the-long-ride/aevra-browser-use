import type { BrowserRuntime } from '../daemon/browser-runtime.js';
import {
  AevraToolError,
  classifyOrigin,
  markUntrusted,
  reclassifyOrigins,
  redactBrowserResult,
  refuseBlockedOrigin,
  refuseSensitiveScreenshot,
  scanNavigateUrl,
  UNTRUSTED_RESULTS,
  type BrowserTabInfo,
} from '../vendor.js';
import { browserOperation, type BrowserOperation } from './operations.js';
import { BROWSER_TOOLS, BROWSER_TOOL_NAMES } from './tools.js';
import { validateArgs } from './validate.js';

export type ToolContent =
  { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

export type BrowserRuntimeApi = Pick<
  BrowserRuntime,
  | 'connect'
  | 'disconnect'
  | 'status'
  | 'tabs'
  | 'navigate'
  | 'snapshot'
  | 'read'
  | 'act'
  | 'logs'
  | 'originPolicy'
  | 'pairPort'
  | 'pairedCount'
>;

type Args = Record<string, unknown>;
type Policy = ReturnType<BrowserRuntimeApi['originPolicy']>;

const DATA_URI = /^data:([^;,]+);base64,([\s\S]*)$/;

function errorResult(error: unknown): ToolResult {
  const code = String((error as { code?: unknown })?.code ?? 'INTERNAL_ERROR');
  let message = error instanceof Error ? error.message : String(error);
  if (message.startsWith(`${code}: `)) message = message.slice(code.length + 2);
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: { code, message } }) }],
  };
}

/** JSON text, with any screenshot split out into an MCP image block. */
function shape(value: unknown): ToolResult {
  const body = Array.isArray(value) ? { result: value } : { ...(value as object) };
  const content: ToolContent[] = [];
  const uri = (body as { imageDataUri?: unknown }).imageDataUri;
  const image = typeof uri === 'string' ? DATA_URI.exec(uri) : null;
  if (image) delete (body as { imageDataUri?: unknown }).imageDataUri;
  content.push({ type: 'text', text: JSON.stringify(body) });
  if (image)
    content.push({ type: 'image', data: image[2] as string, mimeType: image[1] as string });
  return { content };
}

function nextAction(state: string, pairPort: number): string | null {
  if (state === 'not_paired') {
    return `Run \`aevra-browser pair\` and enter the code in the extension popup with port ${pairPort}.`;
  }
  if (state === 'ready_to_connect') return 'Call browser_connect with transport "extension".';
  if (state === 'waiting_for_extension') {
    return 'Open the browser with the Aevra extension enabled.';
  }
  return null;
}

async function statusTool(runtime: BrowserRuntimeApi, policy: Policy): Promise<unknown> {
  const live = await runtime.status();
  const paired = runtime.pairedCount() > 0;
  // First match wins.
  const connectionState = live.connected
    ? 'attached'
    : live.listener.state === 'failed'
      ? 'listener_failed'
      : !paired
        ? 'not_paired'
        : live.extensionSocketAuthenticated
          ? 'ready_to_connect'
          : 'waiting_for_extension';
  return {
    connectionState,
    transport: live.transport,
    connected: live.connected,
    paired,
    nextAction: nextAction(connectionState, runtime.pairPort()),
    attachmentId: live.attachmentId,
    epoch: live.epoch,
    tabs: reclassifyOrigins(live.tabs, policy),
    listener: live.listener,
    extensionSocketAuthenticated: live.extensionSocketAuthenticated,
    activeProfileName: live.activeProfileName,
  };
}

async function connectTool(runtime: BrowserRuntimeApi, args: Args, policy: Policy) {
  const info = await runtime.connect({
    transport: args.transport === 'cdp' ? 'cdp' : 'extension',
    ...(args.cdpPort === undefined ? {} : { cdpPort: Number(args.cdpPort) }),
    ...(args.tabId === undefined ? {} : { tabId: String(args.tabId) }),
  });
  return { ...info, tabs: reclassifyOrigins(info.tabs, policy) };
}

/** Origin of the tab an operation will land on, resolved before it runs. */
async function targetTab(
  runtime: BrowserRuntimeApi,
  tabId: string | undefined,
): Promise<BrowserTabInfo> {
  const tabs = await runtime.tabs({ action: 'list' });
  const tab = tabId
    ? tabs.find((entry) => entry.tabId === tabId)
    : (tabs.find((entry) => entry.active) ?? tabs[0]);
  if (!tab) {
    throw new AevraToolError('NOT_FOUND', `No browser tab matches ${tabId ?? 'the active tab'}`);
  }
  return tab;
}

function execute(runtime: BrowserRuntimeApi, op: BrowserOperation): Promise<unknown> {
  switch (op.kind) {
    case 'browser.tabs':
      return runtime.tabs({ action: op.action, url: op.url, tabId: op.tabId });
    case 'browser.navigate':
      return runtime.navigate({ tabId: op.tabId, url: op.url, waitUntil: op.waitUntil });
    case 'browser.snapshot':
      return runtime.snapshot({ tabId: op.tabId, mode: op.mode, maxNodes: op.maxNodes });
    case 'browser.read':
      return runtime.read({
        tabId: op.tabId,
        ref: op.ref,
        selector: op.selector,
        format: op.format,
      });
    case 'browser.act':
      return runtime.act(op.actions, { tabId: op.tabId, stopOnError: op.stopOnError });
    case 'browser.logs':
      return runtime.logs({
        tabId: op.tabId,
        logKind: op.logKind,
        limit: op.limit,
        since: op.since,
      });
  }
}

async function pageTool(
  runtime: BrowserRuntimeApi,
  name: string,
  args: Args,
  policy: Policy,
): Promise<unknown> {
  // `browser_tabs open` sends the browser somewhere exactly as navigate does,
  // so it gets the same origin and exfiltration checks.
  const navigateUrl =
    name === 'browser_navigate' || (name === 'browser_tabs' && args.action === 'open')
      ? String(args.url ?? '')
      : '';
  if (navigateUrl) {
    refuseBlockedOrigin(navigateUrl, policy);
    const scan = scanNavigateUrl(navigateUrl);
    if (scan.blocked) {
      throw new AevraToolError('BROWSER_ORIGIN_BLOCKED', scan.reason ?? 'Navigation refused');
    }
  }

  // Listing and opening tabs act on the browser, not on the active page, so a
  // privileged active tab must not stop the agent from finding another one.
  const onPage = !(name === 'browser_tabs' && (args.action === 'list' || args.action === 'open'));
  let tabId = args.tabId === undefined ? undefined : String(args.tabId);
  if (onPage) {
    const target = await targetTab(runtime, tabId);
    refuseBlockedOrigin(target.url, policy);
    if (name === 'browser_snapshot') {
      refuseSensitiveScreenshot(classifyOrigin(target.url, policy), String(args.mode ?? 'a11y'));
    }
    tabId = target.tabId;
  }

  const operation = browserOperation(name, args, tabId);
  // Restamp before redacting: a redacted URL is no longer classifiable.
  const shaped = reclassifyOrigins(await execute(runtime, operation), policy);
  if (!UNTRUSTED_RESULTS.has(name)) return shaped;
  const redacted = redactBrowserResult(shaped);
  return markUntrusted(
    Array.isArray(redacted.value) ? { result: redacted.value } : (redacted.value as object),
  );
}

export async function callBrowserTool(
  runtime: BrowserRuntimeApi,
  name: string,
  args: unknown,
): Promise<ToolResult> {
  try {
    if (!BROWSER_TOOL_NAMES.has(name)) {
      throw new AevraToolError('INVALID_REQUEST', `Unknown tool: ${name}`);
    }
    const definition = BROWSER_TOOLS.find((tool) => tool.name === name);
    const input = validateArgs(definition!.inputSchema, args);
    const policy = runtime.originPolicy();
    if (name === 'browser_status') return shape(await statusTool(runtime, policy));
    if (name === 'browser_connect') return shape(await connectTool(runtime, input, policy));
    if (name === 'browser_disconnect') {
      await runtime.disconnect();
      return shape({ disconnected: true });
    }
    return shape(await pageTool(runtime, name, input, policy));
  } catch (error) {
    return errorResult(error);
  }
}
