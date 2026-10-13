import assert from 'node:assert/strict';
import test from 'node:test';
import { creditLine, readyLines, serviceTable, START_STOP_LINE } from '../src/cli-support.js';

test('creditLine formats author and repo links', () => {
  const line = creditLine(false);
  assert.ok(line.includes('the-long-ride'));
  assert.ok(line.includes('the-long-ride/aevra-browser'));
  assert.ok(line.includes('https://github.com/the-long-ride/aevra-browser'));
});

test('serviceTable builds border and service rows', () => {
  const table = serviceTable({
    pairPort: 47841,
    mcpPort: 47842,
    wsPort: 47843,
    browserStatus: 'ready',
  });
  const text = table.join('\n');
  assert.match(text, /Browser Daemon\s+│ ready/);
  assert.match(text, /Settings & Pairing\s+│ http:\/\/127\.0\.0\.1:47841/);
  assert.match(text, /MCP\s+│ http:\/\/127\.0\.0\.1:47842\/mcp/);
  assert.match(text, /Extension WS\s+│ 127\.0\.0\.1:47843/);
  assert.match(text, /Extension Connection\s+│ ready/);
});

test('readyLines includes ASCII banner, table, creditLine and stop line is defined', () => {
  const lines = readyLines({
    pairPort: 47841,
    mcpPort: 47842,
    wsPort: 47843,
  });
  const text = lines.join('\n');
  assert.ok(text.includes('▄▀▀█▄ ▄█▀█▄▀█▄ ██▀████▄▄▀▀█▄'));
  assert.ok(text.includes('Browser Daemon'));
  assert.ok(text.includes('the-long-ride'));
  assert.equal(START_STOP_LINE, '[aevra-browser] Press Ctrl+C to stop aevra-browser.');
});
