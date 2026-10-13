import {
  AevraToolError,
  MAX_WAIT_FOR_MS,
  normalizeBrowserActions,
  parseBrowserScript,
  redactText,
  type BrowserActionInput,
} from '../vendor.js';

export type BrowserTabAction = 'list' | 'open' | 'close' | 'focus';

/** The page operations the daemon runs. A local stand-in for aevra's `WorkerOperation`. */
export type BrowserOperation =
  | { kind: 'browser.tabs'; action: BrowserTabAction; url?: string; tabId?: string }
  | { kind: 'browser.navigate'; url: string; waitUntil: 'load' | 'idle'; tabId?: string }
  | { kind: 'browser.snapshot'; mode: 'a11y' | 'vision'; maxNodes: number; tabId?: string }
  | {
      kind: 'browser.read';
      format: 'text' | 'html';
      ref?: string;
      selector?: string;
      tabId?: string;
    }
  | { kind: 'browser.act'; actions: BrowserActionInput[]; stopOnError: boolean; tabId?: string }
  | {
      kind: 'browser.logs';
      logKind: 'console' | 'network';
      limit: number;
      since?: string;
      tabId?: string;
    };

type Args = Record<string, unknown>;

/**
 * Clamps a model-supplied bound. `Number(...)` on junk yields NaN, which
 * survives Math.min/Math.max, so an unparseable value falls back to the
 * default instead of being clamped into NaN.
 */
function bounded(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

/**
 * Rejected rather than clamped: a silently shortened wait reports a timeout
 * the caller never asked for.
 */
function refuseUnboundedWait(actions: BrowserActionInput[]): void {
  for (const action of actions) {
    if (action.op !== 'wait_for') continue;
    const timeoutMs = Number(action.timeoutMs);
    if (Number.isFinite(timeoutMs) && timeoutMs > MAX_WAIT_FOR_MS) {
      throw new AevraToolError(
        'INVALID_REQUEST',
        `wait_for timeoutMs must not exceed ${MAX_WAIT_FOR_MS}ms`,
      );
    }
  }
}

/**
 * Text the agent is about to send INTO a page goes through the same DLP pass
 * that guards a navigation URL. Refused rather than redacted: a half-redacted
 * string typed into a form is a wrong value silently submitted.
 */
function refuseSecretOutbound(actions: BrowserActionInput[]): void {
  for (const action of actions) {
    const outbound =
      action.op === 'type' ? action.text : action.op === 'select' ? action.value : undefined;
    if (typeof outbound !== 'string' || !outbound) continue;
    if (redactText(outbound).redactionCount > 0) {
      throw new AevraToolError(
        'BROWSER_ORIGIN_BLOCKED',
        `Will not type secret-shaped data into a page (${action.op})`,
      );
    }
  }
}

function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : String(value);
}

/** Maps a validated tool call onto its operation, clamping every bound. */
export function browserOperation(name: string, args: Args, tabId?: string): BrowserOperation {
  const tab = tabId === undefined ? {} : { tabId };
  if (name === 'browser_tabs') {
    const url = optionalString(args.url);
    return {
      kind: 'browser.tabs',
      action: (args.action ?? 'list') as BrowserTabAction,
      ...(url === undefined ? {} : { url }),
      ...tab,
    };
  }
  if (name === 'browser_navigate') {
    return {
      kind: 'browser.navigate',
      url: String(args.url),
      waitUntil: args.waitUntil === 'idle' ? 'idle' : 'load',
      ...tab,
    };
  }
  if (name === 'browser_snapshot') {
    return {
      kind: 'browser.snapshot',
      mode: args.mode === 'vision' ? 'vision' : 'a11y',
      maxNodes: bounded(args.maxNodes, 400, 1, 2000),
      ...tab,
    };
  }
  if (name === 'browser_read') {
    const ref = optionalString(args.ref);
    const selector = optionalString(args.selector);
    return {
      kind: 'browser.read',
      format: args.format === 'html' ? 'html' : 'text',
      ...(ref === undefined ? {} : { ref }),
      ...(selector === undefined ? {} : { selector }),
      ...tab,
    };
  }
  if (name === 'browser_logs') {
    const since = optionalString(args.since);
    return {
      kind: 'browser.logs',
      logKind: args.kind === 'network' ? 'network' : 'console',
      limit: bounded(args.limit, 50, 1, 500),
      ...(since === undefined ? {} : { since }),
      ...tab,
    };
  }
  const actions =
    name === 'browser_execute_script'
      ? parseBrowserScript(args.script)
      : normalizeBrowserActions(args.actions);
  if (!actions.length) {
    throw new AevraToolError('INVALID_REQUEST', `${name} requires at least one action`);
  }
  refuseUnboundedWait(actions);
  refuseSecretOutbound(actions);
  return { kind: 'browser.act', actions, stopOnError: args.stopOnError !== false, ...tab };
}
