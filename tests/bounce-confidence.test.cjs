const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

/**
 * A guessed bounce produces no speed. These cover what that has to mean once
 * the reading leaves physics: such a delivery can still be stored, but it must
 * never be validated with a number, counted into a trend, or put on a card.
 */

const storageValues = new Map();
const originalLoad = Module._load;

require.extensions['.ts'] = (module, filename) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    }).outputText,
    filename,
  );
};

Module._load = function loadWithNativeMocks(request, parent, isMain) {
  if (request === 'react-native-mmkv') {
    return {
      createMMKV: () => ({
        getString: (key) => storageValues.get(key),
        set: (key, value) => storageValues.set(key, value),
        remove: (key) => storageValues.delete(key),
        getAllKeys: () => [...storageValues.keys()],
      }),
    };
  }
  // Only needed so the data module loads; nothing here touches the filesystem.
  if (request === 'expo-file-system') {
    class Stub {
      constructor(...parts) {
        this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
      }
    }
    return {
      File: Stub,
      Directory: Stub,
      Paths: {
        cache: { uri: 'file:///app/cache/' },
        document: { uri: 'file:///app/documents/' },
        relative: () => '',
        isAbsolute: () => false,
        info: () => ({ exists: false, isDirectory: null }),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const data = require(path.join(__dirname, '..', 'src', 'data', 'index.ts'));
const { isSession } = require(path.join(__dirname, '..', 'src', 'data', 'validation.ts'));
const { drawCard } = require(path.join(__dirname, '..', 'src', 'export', 'drawCard.ts'));
const { createMockSession } = require(path.join(__dirname, '..', 'src', 'data', 'mockData.ts'));

const measured = createMockSession('measured', 120);
const guessed = {
  ...createMockSession('guessed', 120),
  markConfidence: 'guessed',
  speedKmh: null,
  errorKmh: null,
};

test('storage accepts a delivery without a speed only when the bounce was guessed', () => {
  // Records predating the question are read as seen and keep their reading.
  assert.equal(isSession(measured), true);
  assert.equal(isSession({ ...measured, markConfidence: 'seen' }), true);
  assert.equal(isSession({ ...measured, markConfidence: 'uncertain' }), true);
  assert.equal(isSession(guessed), true);

  // The number that must never exist: a bounce nobody saw, stored with a speed.
  assert.equal(isSession({ ...measured, markConfidence: 'guessed' }), false);
  assert.equal(isSession({ ...guessed, errorKmh: 5 }), false);
  // And the mirror of it — a seen bounce has to carry the reading it measured.
  assert.equal(isSession({ ...measured, speedKmh: null, errorKmh: null }), false);
  assert.equal(isSession({ ...measured, markConfidence: 'anything else' }), false);
});

test('a guessed delivery is kept in history but stays out of the trend', async () => {
  storageValues.clear();
  for (const session of [measured, guessed]) {
    storageValues.set(`sessions:${session.id}`, JSON.stringify({ ...session, playerId: 'p' }));
  }
  storageValues.set('sessions:index', JSON.stringify([measured.id, guessed.id]));

  // The delivery is not lost — the clip and the marks are still listed.
  assert.deepEqual(
    (await data.listSessions({ playerId: 'p' })).map((s) => s.id).sort(),
    [guessed.id, measured.id].sort(),
  );

  const trend = await data.getTrend('p', 'all');
  assert.deepEqual(trend.points.map((p) => p.id), [measured.id]);
  assert.equal(trend.count, 1, 'a delivery with no speed is not a trend point');
  assert.equal(trend.best, measured.speedKmh);
  assert.equal(trend.avg, measured.speedKmh, 'and it does not drag the average');
});

test('the exporter refuses a delivery that has no measured speed', () => {
  // The guard runs before anything is drawn, so no renderer is needed here.
  assert.throws(
    () => drawCard(null, null, null, guessed, true, null, null),
    /no measured speed/,
  );
});

test('comparing deliveries requires both to be measured', () => {
  const { compareSessions } = require(path.join(__dirname, '..', 'src', 'data', 'comparison.ts'));

  const labels = (a, b) => compareSessions(a, b).map((d) => d.label);
  assert.deepEqual(labels(measured, measured), ['Speed', 'Distance', 'Angle']);
  assert.throws(() => labels(measured, guessed), /measured speeds/);
  assert.throws(() => labels(guessed, measured), /measured speeds/);
  assert.throws(() => labels(guessed, guessed), /measured speeds/);
});
