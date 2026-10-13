import { browserInputSchemas, type JsonSchema } from './schemas.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

/**
 * Descriptions for the five tools aevra describes explicitly are copied from
 * `registry-descriptions.ts`. aevra leaves the other five to a generated
 * fallback, so they are written here.
 */
const DESCRIPTIONS: Record<string, string> = {
  browser_connect:
    'Attach to a paired browser. When browser_status reports ready_to_connect, call with transport extension; pairing alone does not attach a browser session.',
  browser_status:
    'Show pairing, authenticated extension socket, and browser attachment as distinct states. If connectionState is ready_to_connect, use nextAction to call browser_connect.',
  browser_disconnect: 'Detach from the browser. The pairing is kept.',
  browser_tabs: 'List, open, close or focus browser tabs.',
  browser_navigate: 'Navigate a browser tab to a URL and wait for it to load.',
  browser_snapshot:
    'Inspect a browser tab. Use accessibility mode first for element refs; use vision for canvas, WebGL, or when accessibility cannot identify the target. Extension vision temporarily attaches Chrome debugger.',
  browser_read: 'Read the text or HTML of a browser tab, or of one element by ref or selector.',
  browser_act_many:
    'Act on a browser tab. Prefer an accessibility ref, then a stable CSS selector. Use coordinate actions as a last resort for canvas-like targets without semantic controls or after semantic action fails; extension coordinate click and drag attach Chrome debugger. Verify the result with a snapshot.',
  browser_execute_script:
    'Execute a bounded Playwright-like script with stable CSS selectors against one browser tab as a single policy-checked action batch; arbitrary JavaScript is not evaluated.',
  browser_logs: 'Read recent console or network log entries from a browser tab.',
};

export const BROWSER_TOOLS: ToolDefinition[] = Object.keys(browserInputSchemas).map((name) => ({
  name,
  description: DESCRIPTIONS[name] ?? name,
  inputSchema: browserInputSchemas[name] as JsonSchema,
}));

export const BROWSER_TOOL_NAMES: ReadonlySet<string> = new Set(
  BROWSER_TOOLS.map((tool) => tool.name),
);
