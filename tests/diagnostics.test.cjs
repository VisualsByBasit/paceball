require('./register.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
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
  // Exercise the proposed adapter without enabling it in the application or
  // pretending Sentry is a declared dependency on main.
  const filename = path.resolve(__dirname, '../src/diagnostics/index.ts');
  const template = fs.readFileSync(path.resolve(__dirname, '../docs/integration/diagnostics-index.ts.txt'), 'utf8');
  function loadAdapter() {
    const adapter = new Module(filename, module);
    adapter.filename = filename;
    adapter.paths = Module._nodeModulePaths(path.dirname(filename));
    adapter._compile(ts.transpileModule(template, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    }).outputText, filename);
    return adapter.exports;
  }
  try {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    let diagnostics = loadAdapter();
    diagnostics.setDiagnosticsConsent(true);
    assert.equal(sdk.options, null, 'No SDK initialization without DSN');
    await assert.rejects(diagnostics.sendDiagnosticTest());
    values.clear();
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.invalid/1';
    diagnostics = loadAdapter();
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
    diagnostics = loadAdapter();
    assert.equal(diagnostics.diagnosticsStatus().consent, true);
  } finally {
    Module._load = originalLoad; global.__DEV__ = previousDev;
    if (previousDsn === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    else process.env.EXPO_PUBLIC_SENTRY_DSN = previousDsn;
    delete require.cache[filename];
  }
});

test('only reviewed static error messages survive, including each nested cause', () => {
  const values = [
    { type: 'Error', value: 'The saved release frame is missing.' },
    { type: 'Error', value: 'Paceball file path must be absolute: "private-video.mp4".' },
    { type: 'Error', value: 'Stored Paceball session "private-player" is invalid.' },
    { type: 'Error', value: 'The saved release frame is missing. private suffix' },
    { type: 'TypeError', value: 'The saved release frame is missing.' },
  ];
  const output = scrubDiagnosticEvent({ exception: { values } });
  assert.equal(output.exception.values[0].value, values[0].value);
  for (const error of output.exception.values.slice(1)) {
    assert.equal(error.value, 'Paceball application error (details withheld for privacy)');
  }
  assert.ok(!JSON.stringify(output).includes('private'));
  const spoof = scrubDiagnosticEvent({ exception: { values: [{ type: 'Error', value: 'User Mustafa',
    stacktrace: { frames: [{ filename: 'src/data/index.ts', in_app: true }] } }] } });
  assert.ok(!JSON.stringify(spoof).includes('Mustafa'));
});

test('arbitrary source filenames and debug-image filenames cannot leak names', () => {
  const clean = scrubDiagnosticEvent({
    exception: { values: [{ type: 'Error', value: 'private error', stacktrace: { frames: [
      { filename: 'file:///recordings/Mustafa-private.tsx', lineno: 9, colno: 3 },
      { filename: 'https://private.example/main.jsbundle?name=Mustafa', lineno: 4 },
    ] } }] },
    debug_meta: { images: [{ type: 'sourcemap',
      debug_id: '00000000-0000-4000-8000-000000000000', code_file: 'Mustafa-private.js' }] },
  });
  assert.ok(!JSON.stringify(clean).includes('Mustafa'));
  assert.ok(!JSON.stringify(clean).includes('private'));
  assert.equal(clean.exception.values[0].stacktrace.frames[0].filename, 'app');
  assert.equal(clean.exception.values[0].stacktrace.frames[1].filename, 'main.jsbundle');
  assert.equal(clean.debug_meta.images[0].code_file, 'app');
});
