import assert from 'node:assert/strict';
import test from 'node:test';
import { callBrowserTool } from '../src/mcp/handlers.js';
import { errorCode, jsonOf, NORMAL_TAB, realRuntime, stubRuntime } from './helpers/handlers.js';

test('driver errors keep their code and lose the duplicated prefix', async () => {
  const runtime = stubRuntime({
    connect: async () => {
      throw Object.assign(new Error('BROWSER_UNAVAILABLE: no socket'), {
        code: 'BROWSER_UNAVAILABLE',
      });
    },
  });
  const result = await callBrowserTool(runtime, 'browser_connect', { transport: 'extension' });
  assert.deepEqual(jsonOf(result), {
    error: { code: 'BROWSER_UNAVAILABLE', message: 'no socket' },
  });
});

test('an error without a code becomes INTERNAL_ERROR', async () => {
  const runtime = stubRuntime({
    disconnect: async () => {
      throw new Error('boom');
    },
  });
  assert.equal(
    errorCode(await callBrowserTool(runtime, 'browser_disconnect', {})),
    'INTERNAL_ERROR',
  );
});

test('disconnect reports success', async () => {
  const body = jsonOf(await callBrowserTool(stubRuntime(), 'browser_disconnect', {}));
  assert.deepEqual(body, { disconnected: true });
});

test('connect returns the session with reclassified tab origins', async () => {
  const runtime = stubRuntime({
    connect: async () => ({
      sessionId: 's',
      transport: 'cdp',
      connected: true,
      tabs: [{ ...NORMAL_TAB, url: 'http://127.0.0.1:47833/' }],
    }),
  });
  const body = jsonOf(await callBrowserTool(runtime, 'browser_connect', { transport: 'cdp' }));
  assert.equal(body.tabs[0].originClass, 'BLOCKED');
});

test('an unpaired browser_status says to pair, quoting the pairing port', async (t) => {
  const { runtime } = await realRuntime(t);
  const body = jsonOf(await callBrowserTool(runtime, 'browser_status', {}));
  // The fake driver is attached, so use a runtime with nothing attached.
  assert.equal(body.connectionState, 'attached');
  const idle = jsonOf(await callBrowserTool(stubRuntime(), 'browser_status', {}));
  assert.equal(idle.connectionState, 'not_paired');
  assert.equal(idle.paired, false);
  assert.match(idle.nextAction, /aevra-browser pair/);
  assert.match(idle.nextAction, /port 47841/);
});

test('browser_status walks the connection states in order', async () => {
  const status = (patch: Record<string, unknown>) => async () => ({
    connected: false,
    transport: null,
    attachmentId: null,
    epoch: 1,
    extensionPaired: false,
    tabs: [],
    listener: { state: 'listening', port: 1, errorCode: null, changedAt: '' },
    activeProfileName: null,
    extensionSocketAuthenticated: false,
    ...patch,
  });
  const stateOf = async (patch: Record<string, unknown>, paired: number) =>
    jsonOf(
      await callBrowserTool(
        stubRuntime({ status: status(patch), pairedCount: () => paired }),
        'browser_status',
        {},
      ),
    );

  const attached = await stateOf({ connected: true, transport: 'extension' }, 0);
  assert.equal(attached.connectionState, 'attached');
  assert.equal(attached.nextAction, null);

  const failed = await stateOf(
    { listener: { state: 'failed', port: 1, errorCode: 'EADDRINUSE', changedAt: '' } },
    1,
  );
  assert.equal(failed.connectionState, 'listener_failed');
  assert.equal(failed.nextAction, null);

  assert.equal((await stateOf({}, 0)).connectionState, 'not_paired');

  const ready = await stateOf({ extensionSocketAuthenticated: true }, 1);
  assert.equal(ready.connectionState, 'ready_to_connect');
  assert.match(ready.nextAction, /browser_connect/);

  const waiting = await stateOf({}, 1);
  assert.equal(waiting.connectionState, 'waiting_for_extension');
  assert.match(waiting.nextAction, /extension enabled/);
});
