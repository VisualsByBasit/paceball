require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

/**
 * Sentry.wrap mounts a profiler that warns on every launch unless Sentry.init
 * ran first. The wrap and the init have to agree: wrapped exactly when started.
 */

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const filename = path.join(ROOT, 'src', 'diagnostics', 'index.ts');

function withMocks(run) {
  const values = new Map();
  const sdk = {
    options: null,
    wrapped: [],
    init(options) {
      sdk.options = options;
    },
    getClient() {
      return sdk.options ? { getOptions: () => sdk.options, flush: async () => true } : undefined;
    },
    wrap(Root) {
      sdk.wrapped.push(Root);
      return { wrappedBySentry: Root };
    },
    async close() {},
  };
  const originalLoad = Module._load;
  const previousDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const previousDev = global.__DEV__;
  global.__DEV__ = true;
  Module._load = function (request, parent, isMain) {
    if (request === '@sentry/react-native') return sdk;
    if (request === 'react-native-mmkv') {
      return { createMMKV: () => ({ getString: (key) => values.get(key), set: (key, val) => values.set(key, val) }) };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  // A fresh module per launch, because the DSN is read when it loads.
  const launch = () => {
    const adapter = new Module(filename, module);
    adapter.filename = filename;
    adapter.paths = Module._nodeModulePaths(path.dirname(filename));
    adapter._compile(
      ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
        fileName: filename,
      }).outputText,
      filename,
    );
    return adapter.exports;
  };
  try {
    run({ sdk, values, launch });
  } finally {
    Module._load = originalLoad;
    global.__DEV__ = previousDev;
    if (previousDsn === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    else process.env.EXPO_PUBLIC_SENTRY_DSN = previousDsn;
  }
}

test('the root is wrapped by Sentry exactly when Sentry has started', () => {
  withMocks(({ sdk, values, launch }) => {
    const Root = () => null;

    // No DSN in this build: nothing starts, so nothing is wrapped.
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    let diagnostics = launch();
    diagnostics.initializeDiagnostics();
    assert.equal(diagnostics.wrap(Root), Root);

    // A DSN but no consent, the default: still nothing started, still unwrapped.
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.invalid/1';
    diagnostics = launch();
    diagnostics.initializeDiagnostics();
    assert.equal(sdk.options, null, 'consent is still required before anything starts');
    assert.equal(diagnostics.wrap(Root), Root);
    assert.deepEqual(sdk.wrapped, [], 'the profiler that warns is never mounted');

    // Consent given on an earlier visit: index.js starts Sentry, then the root
    // is wrapped, in that order, as on a phone.
    values.set('crash-reports-enabled', 'true');
    diagnostics = launch();
    diagnostics.initializeDiagnostics();
    assert.notEqual(sdk.options, null);
    assert.deepEqual(diagnostics.wrap(Root), { wrappedBySentry: Root });
    // What is sent is unchanged by the wrap: the same scrubbed options.
    assert.equal(sdk.options.maxBreadcrumbs, 0);
    assert.equal(sdk.options.enableAppStartTracking, false);
  });
});

test('index.js starts diagnostics before the router loads the root it wraps', () => {
  const entry = read('index.js');
  const init = entry.indexOf('initializeDiagnostics();');
  const router = entry.indexOf("require('expo-router/entry');");
  assert.ok(init > -1, 'diagnostics are initialised in the entry file');
  assert.ok(router > init, 'and before the router is required');
  // An import would be hoisted above the init call and load the router first.
  assert.doesNotMatch(entry, /import\s+['"]expo-router\/entry['"]/);

  const layout = read('app/_layout.tsx');
  assert.match(layout, /import \{ wrap \} from '\.\.\/src\/diagnostics';/);
  assert.match(layout, /export default wrap\(RootLayout\);/);
  // The unconditional re-export was the warning.
  assert.doesNotMatch(read('src/diagnostics/index.ts'), /export \{ wrap \} from '@sentry\/react-native'/);
});
