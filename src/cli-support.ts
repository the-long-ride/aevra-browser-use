export const START_STOP_LINE = '[aevra-browser] Press Ctrl+C to stop aevra-browser.';

const AUTHOR_NAME = 'the-long-ride';
const AUTHOR_URL = 'https://github.com/the-long-ride';
const REPO_NAME = 'the-long-ride/aevra-browser';
const REPO_URL = 'https://github.com/the-long-ride/aevra-browser';

const ESC = String.fromCharCode(27);
const ST = ESC + String.fromCharCode(92);

function link(label: string, url: string, hyperlinks: boolean): string {
  return hyperlinks ? `${ESC}]8;;${url}${ST}${label}${ESC}]8;;${ST}` : `${label} (${url})`;
}

export function creditLine(hyperlinks = Boolean(process.stderr.isTTY)): string {
  return `Author: ${link(AUTHOR_NAME, AUTHOR_URL, hyperlinks)} // Repo: ${link(REPO_NAME, REPO_URL, hyperlinks)}`;
}

export interface ReadyInfo {
  pairPort: number;
  mcpPort: number;
  wsPort: number;
  browserStatus?: string;
}

export function serviceTable(info: ReadyInfo): string[] {
  const rows: Array<[string, string]> = [
    ['Service', 'Value'],
    ['Browser Daemon', 'ready'],
    ['Settings & Pairing', `http://127.0.0.1:${info.pairPort}`],
    ['MCP', `http://127.0.0.1:${info.mcpPort}/mcp`],
    ['Extension WS', `127.0.0.1:${info.wsPort}`],
    ['Extension Connection', info.browserStatus ?? 'waiting'],
  ];
  const serviceWidth = Math.max(...rows.map(([service]) => service.length));
  const valueWidth = Math.max(...rows.map(([, value]) => value.length));
  const border = (left: string, middle: string, right: string) =>
    `${left}${'─'.repeat(serviceWidth + 2)}${middle}${'─'.repeat(valueWidth + 2)}${right}`;
  const row = (service: string, value: string) =>
    `│ ${service.padEnd(serviceWidth)} │ ${value.padEnd(valueWidth)} │`;

  return [
    border('┌', '┬', '┐'),
    row(...rows[0]!),
    border('├', '┼', '┤'),
    ...rows.slice(1).map(([service, value]) => row(service, value)),
    border('└', '┴', '┘'),
  ];
}

export function readyLines(info: ReadyInfo): string[] {
  return [
    '',
    '               ',
    '                   ▄         ',
    ' ▄▀▀█▄ ▄█▀█▄▀█▄ ██▀████▄▄▀▀█▄',
    ' ▄█▀██ ██▄█▀ ██▄██ ██   ▄█▀██',
    '▄▀█▄██▄▀█▄▄▄  ▀█▀ ▄█▀  ▄▀█▄██',
    '',
    ...serviceTable(info),
    '',
    creditLine(),
    '',
  ];
}
