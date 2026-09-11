require('./register.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const { scrubDiagnosticEvent } = require('../src/diagnostics/privacy.ts');

test('diagnostic allow-list removes names, media, measurements, logs, IDs and arbitrary error text', () => {
  const clean = scrubDiagnosticEvent({
    event_id: 'event', release: 'com.paceball.app@1.0.0', environment: 'test',
    user: { id: 'player-private', email: 'private@example.com' },
    message: 'private name', extra: { speed: 123, videoPath: 'private.mp4' },
    request: { url: 'https://private.example.com/?secret=123' },
    contexts: { device: { name: 'private phone' } }, tags: { player: 'private' },
    breadcrumbs: [{ message: 'private path' }],
    exception: { values: [{ type: 'TypeError', value: 'private name and path',
      mechanism: { type: 'private', handled: false, data: { secret: 'private' } },
      stacktrace: { frames: [{ filename: 'file:///private/index.android.bundle?secret=123', lineno: 20, colno: 4,
        vars: { session: 'private' }, pre_context: ['private'], function: 'private' }] } }] },
  });
  assert.ok(!JSON.stringify(clean).includes('private'));
  assert.equal(clean.exception.values[0].type, 'TypeError');
  assert.equal(clean.exception.values[0].stacktrace.frames[0].filename, 'index.android.bundle');
  assert.equal(clean.exception.values[0].stacktrace.frames[0].lineno, 20);
  assert.equal(clean.exception.values[0].mechanism.handled, false);
  assert.equal(scrubDiagnosticEvent({ exception: { values: [{ type: 'PlayerMustafa', value: 'secret' }] } }).exception.values[0].type, 'Error');
});

test('Sentry requires DSN and opt-in, scrubs attachments, and respects revocation/restart', async () => {
  const values = new Map();
  const sdk = { options: null, captures: 0,
    init(options) { sdk.options = options; },
    getClient() { return sdk.options ? { getOptions: () => sdk.options, flush: async () => true } : undefined; },
    captureException() { sdk.captures++; }, wrap: x => x,
  };
  const originalLoad = Module._load;
  const previousDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const previousDev = global.__DEV__;
  global.__DEV__ = true;
  Module._load = function (request, parent, isMain) {
    if (request === '@sentry/react-native') return sdk;
    if (request === 'expo-constants') return { expoConfig: { version: '1.0.0' } };
    if (request === 'react-native-mmkv') return { createMMKV: () => ({ getString: key => values.get(key), set: (key, val) => values.set(key, val) }) };
    return originalLoad.call(this, request, parent, isMain);
  };
  const filename = require.resolve('../src/diagnostics/index.ts');
  try {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    let diagnostics = require(filename);
    diagnostics.setDiagnosticsConsent(true);
    assert.equal(sdk.options, null, 'No SDK initialization without DSN');
    await assert.rejects(diagnostics.sendDiagnosticTest());
    values.clear();
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.invalid/1';
    delete require.cache[filename]; diagnostics = require(filename);
    diagnostics.initializeDiagnostics();
    assert.equal(sdk.options, null, 'No SDK initialization before opt-in');
    diagnostics.setDiagnosticsConsent(true);
    assert.equal(sdk.options.enableNative, false);
    assert.equal(sdk.options.sendDefaultPii, false);
    assert.equal(sdk.options.replaysOnErrorSampleRate, undefined);
    assert.equal(sdk.options.replaysSessionSampleRate, undefined);
    assert.equal(sdk.options.tracesSampleRate, undefined);
    assert.equal(sdk.options.beforeSendTransaction({}), null);
    assert.equal(sdk.options.maxBreadcrumbs, 0);
    const hint = { attachments: [{ filename: 'video.mp4' }] };
    assert.equal(sdk.options.beforeSend({ message: 'private' }, hint).message, undefined);
    assert.deepEqual(hint.attachments, []);
    assert.equal(await diagnostics.sendDiagnosticTest(), true);
    assert.equal(sdk.captures, 1);
    diagnostics.setDiagnosticsConsent(false);
    assert.equal(sdk.options.enabled, false);
    assert.equal(sdk.options.beforeSend({}, {}), null);
    await assert.rejects(diagnostics.sendDiagnosticTest());
    diagnostics.setDiagnosticsConsent(true);
    assert.equal(sdk.options.enabled, true);
    delete require.cache[filename]; diagnostics = require(filename);
    assert.equal(diagnostics.diagnosticsStatus().consent, true);
  } finally {
    Module._load = originalLoad; global.__DEV__ = previousDev;
    if (previousDsn === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    else process.env.EXPO_PUBLIC_SENTRY_DSN = previousDsn;
    delete require.cache[filename];
  }
});
