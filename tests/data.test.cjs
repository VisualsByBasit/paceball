const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { after, beforeEach, test } = require('node:test');
const ts = require('typescript');

const storageValues = new Map();
const pathTypes = new Map();
const deletedPaths = [];
const copiedPaths = [];
const failedCopySources = new Set();
let failNextStorageSetKey;
const originalLoad = Module._load;
const originalNow = Date.now;
const originalWarn = console.warn;

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const joinUri = (...parts) =>
  parts.slice(1).reduce(
    (current, part) =>
      `${current.replace(/\/$/, '')}/${String(part).replace(/^\//, '')}`,
    typeof parts[0] === 'string' ? parts[0] : parts[0].uri,
  );

class MockPath {
  constructor(...parts) {
    this.uri = joinUri(...parts);
  }

  get exists() {
    return pathTypes.has(this.uri);
  }

  get extension() {
    const name = this.uri.split('/').at(-1) ?? '';
    const dotIndex = name.lastIndexOf('.');
    return dotIndex > 0 ? name.slice(dotIndex) : '';
  }

  create() {
    pathTypes.set(this.uri, 'directory');
  }

  async copy(destination) {
    if (failedCopySources.has(this.uri)) {
      throw new Error(`copy failed for ${this.uri}`);
    }
    const type = pathTypes.get(this.uri);
    if (type === undefined) {
      throw new Error(`missing source ${this.uri}`);
    }
    pathTypes.set(destination.uri, type);
    copiedPaths.push([this.uri, destination.uri]);
  }

  delete() {
    deletedPaths.push(this.uri);
    for (const uri of [...pathTypes.keys()]) {
      if (uri === this.uri || uri.startsWith(`${this.uri}/`)) {
        pathTypes.delete(uri);
      }
    }
  }
}

Module._load = function loadWithNativeMocks(request, parent, isMain) {
  if (request === 'react-native-mmkv') {
    return {
      createMMKV: () => ({
        getString: (key) => storageValues.get(key),
        set: (key, value) => {
          if (key === failNextStorageSetKey) {
            failNextStorageSetKey = undefined;
            throw new Error(`storage write failed for ${key}`);
          }
          storageValues.set(key, value);
        },
        remove: (key) => storageValues.delete(key),
        getAllKeys: () => [...storageValues.keys()],
      }),
    };
  }

  if (request === 'expo-file-system') {
    return {
      File: MockPath,
      Directory: MockPath,
      Paths: {
        cache: { uri: 'file:///app/cache/' },
        document: { uri: 'file:///app/documents/' },
        relative: (root, value) => {
          const uri = typeof value === 'string' ? value : value.uri;
          return uri.startsWith(root.uri)
            ? uri.slice(root.uri.length)
            : '../outside';
        },
        isAbsolute: (value) =>
          value.startsWith('/') || value.includes('://'),
        info: (uri) => ({
          exists: pathTypes.has(uri),
          isDirectory: pathTypes.has(uri)
            ? pathTypes.get(uri) === 'directory'
            : null,
        }),
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

const data = require(path.join(__dirname, '..', 'src', 'data', 'index.ts'));
const dataModulePath = require.resolve(
  path.join(__dirname, '..', 'src', 'data', 'index.ts'),
);
const { createMockSession } = require(
  path.join(__dirname, '..', 'src', 'data', 'mockData.ts'),
);
const DAY_MS = 24 * 60 * 60 * 1000;

const sessionInput = (
  playerId,
  speedKmh = 120,
  pathSuffix = Math.random().toString(36).slice(2),
) => {
  const { id: _id, createdAt: _createdAt, ...record } = createMockSession(
    'input',
    speedKmh,
  );
  const input = {
    ...record,
    playerId,
    videoPath: `file:///app/cache/${pathSuffix}.mp4`,
    framesDir: `file:///app/cache/${pathSuffix}-frames`,
  };
  pathTypes.set(input.videoPath, 'file');
  pathTypes.set(input.framesDir, 'directory');
  return input;
};

beforeEach(() => {
  storageValues.clear();
  pathTypes.clear();
  deletedPaths.length = 0;
  copiedPaths.length = 0;
  failedCopySources.clear();
  failNextStorageSetKey = undefined;
  Date.now = originalNow;
  console.warn = () => undefined;
});

after(() => {
  Date.now = originalNow;
  console.warn = originalWarn;
  Module._load = originalLoad;
});

test('rebuilds a corrupt session index from valid stored sessions', async () => {
  Date.now = () => 1_000;
  const first = await data.saveSession(sessionInput('player-a'));
  Date.now = () => 2_000;
  const second = await data.saveSession(sessionInput('player-a'));
  storageValues.set('sessions:index', '{not-json');

  const sessions = await data.listSessions();

  assert.deepEqual(
    sessions.map(({ id }) => id),
    [second.id, first.id],
  );
  assert.deepEqual(JSON.parse(storageValues.get('sessions:index')), [
    second.id,
    first.id,
  ]);
});

test('skips one corrupt session and repairs the index', async () => {
  const valid = await data.saveSession(sessionInput('player-a'));
  const corrupt = await data.saveSession(sessionInput('player-a'));
  storageValues.set(`sessions:${corrupt.id}`, '{not-json');

  assert.deepEqual(await data.listSessions(), [valid]);
  assert.deepEqual(JSON.parse(storageValues.get('sessions:index')), [valid.id]);
});

test('recovers a valid session orphaned before its index write', async () => {
  const indexed = await data.saveSession(sessionInput('player-a'));
  const orphan = {
    ...createMockSession('orphan', 120, indexed.createdAt + 1),
    playerId: 'player-a',
    videoPath: 'file:///app/cache/orphan.mp4',
    framesDir: 'file:///app/cache/orphan-frames',
  };
  storageValues.set(`sessions:${orphan.id}`, JSON.stringify(orphan));

  assert.deepEqual(await data.listSessions(), [orphan, indexed]);
  assert.deepEqual(JSON.parse(storageValues.get('sessions:index')), [
    indexed.id,
    orphan.id,
  ]);
});

test('preserves media in document storage before saving metadata', async () => {
  const input = sessionInput('player-a', 125, 'permanent');
  input.fps = 59.817;

  const session = await data.saveSession(input);

  assert.match(
    session.videoPath,
    new RegExp(`^file:///app/documents/paceball/sessions/${session.id}/delivery\\.mp4$`),
  );
  assert.equal(
    session.framesDir,
    `file:///app/documents/paceball/sessions/${session.id}/frames`,
  );
  assert.equal(session.fps, 59.817);
  assert.deepEqual(copiedPaths, [
    [input.videoPath, session.videoPath],
    [input.framesDir, session.framesDir],
  ]);
  assert.equal(pathTypes.has(input.videoPath), false);
  assert.equal(pathTypes.has(input.framesDir), false);
  assert.equal(pathTypes.get(session.videoPath), 'file');
  assert.equal(pathTypes.get(session.framesDir), 'directory');
});

test('saved sessions survive a JavaScript module restart', async () => {
  const session = await data.saveSession(sessionInput('player-a'));
  delete require.cache[dataModulePath];
  const restartedData = require(dataModulePath);

  assert.deepEqual(await restartedData.listSessions(), [session]);
});

test('rolls back permanent files when frame preservation fails', async () => {
  const input = sessionInput('player-a', 120, 'copy-failure');
  failedCopySources.add(input.framesDir);

  await assert.rejects(
    data.saveSession(input),
    /Could not preserve files for session/,
  );

  assert.equal(pathTypes.get(input.videoPath), 'file');
  assert.equal(pathTypes.get(input.framesDir), 'directory');
  assert.equal(
    [...pathTypes.keys()].some((uri) =>
      uri.startsWith('file:///app/documents/paceball/sessions/'),
    ),
    false,
  );
  assert.equal(
    [...storageValues.keys()].some((key) => key.startsWith('sessions:session-')),
    false,
  );
});

test('rolls back files and metadata when the index write fails', async () => {
  const input = sessionInput('player-a', 120, 'storage-failure');
  failNextStorageSetKey = 'sessions:index';

  await assert.rejects(data.saveSession(input), /Could not save session/);

  assert.equal(pathTypes.get(input.videoPath), 'file');
  assert.equal(pathTypes.get(input.framesDir), 'directory');
  assert.equal(
    [...pathTypes.keys()].some((uri) =>
      uri.startsWith('file:///app/documents/paceball/sessions/'),
    ),
    false,
  );
  assert.equal(
    [...storageValues.keys()].some((key) => key.startsWith('sessions:session-')),
    false,
  );
  assert.deepEqual(JSON.parse(storageValues.get('sessions:index')), []);
});

test('skips revised sessions with invalid calibration data', async () => {
  const session = await data.saveSession(sessionInput('player-a'));
  storageValues.set(
    `sessions:${session.id}`,
    JSON.stringify({
      ...session,
      calibrationMethod: 'guess',
      release: { ...session.release, x: -1 },
    }),
  );

  assert.deepEqual(await data.listSessions(), []);
  assert.deepEqual(JSON.parse(storageValues.get('sessions:index')), []);
});

test('rejects invalid measurement input before copying files', async () => {
  const input = sessionInput('player-a');
  input.release = { ...input.release, frame: input.bounce.frame };

  await assert.rejects(
    data.saveSession(input),
    /Cannot save an invalid Paceball session/,
  );
  assert.deepEqual(copiedPaths, []);
  assert.equal(pathTypes.get(input.videoPath), 'file');
  assert.equal(pathTypes.get(input.framesDir), 'directory');
});

test('deletes session files and removes its storage record', async () => {
  const input = sessionInput('player-a', 120, 'delivery');
  const session = await data.saveSession(input);
  deletedPaths.length = 0;

  await data.deleteSession(session.id);

  assert.deepEqual(deletedPaths, [session.videoPath, session.framesDir]);
  assert.deepEqual(await data.listSessions(), []);
  assert.equal(storageValues.has(`sessions:${session.id}`), false);
});

test('refuses unsafe deletion paths and keeps session metadata', async () => {
  const input = sessionInput('player-a');
  const session = await data.saveSession(input);
  storageValues.set(
    `sessions:${session.id}`,
    JSON.stringify({
      ...session,
      videoPath: 'file:///outside/delivery.mp4',
    }),
  );
  deletedPaths.length = 0;

  await assert.rejects(
    data.deleteSession(session.id),
    /Refusing to access a path outside Paceball storage/,
  );
  assert.equal(storageValues.has(`sessions:${session.id}`), true);
  assert.deepEqual(deletedPaths, []);
});

test('persists created players and rejects an empty name', async () => {
  const player = await data.createPlayer('  Ali  ');

  assert.deepEqual(await data.listPlayers(), [player]);
  assert.equal(player.name, 'Ali');
  await assert.rejects(
    data.createPlayer('   '),
    /Player name cannot be empty/,
  );
});

test('builds weekly trends from real sessions for one player', async () => {
  const now = 2_000_000_000_000;
  Date.now = () => now - 40 * DAY_MS;
  await data.saveSession(sessionInput('player-a', 100));
  Date.now = () => now - 5 * DAY_MS;
  const recent = await data.saveSession(sessionInput('player-a', 130));
  Date.now = () => now - DAY_MS;
  await data.saveSession(sessionInput('player-b', 150));
  Date.now = () => now;

  assert.deepEqual(await data.getTrend('player-a', 'week'), {
    points: [{ t: recent.createdAt, speedKmh: recent.speedKmh }],
    best: recent.speedKmh,
    avg: recent.speedKmh,
    count: 1,
  });
  assert.deepEqual(await data.getTrend('missing-player', 'all'), {
    points: [],
    best: 0,
    avg: 0,
    count: 0,
  });
});

test('derives mock speed from its frame timing', () => {
  const session = createMockSession('demo', 128.4);
  const calculatedSpeed =
    Math.round(
      (session.travelMetres /
        ((session.bounce.frame - session.release.frame) / session.fps)) *
        3.6 *
        10,
    ) / 10;

  assert.equal(session.speedKmh, calculatedSpeed);
});

test('active player migrates from the oldest profile and switching survives restart', async () => {
  Date.now = () => 100;
  const a = await data.createPlayer('Same name', { heightCm: 180 });
  Date.now = () => 200;
  const b = await data.createPlayer('Same name', { heightCm: 170 });
  assert.notEqual(a.id, b.id);
  assert.deepEqual(await data.getActivePlayer(), a);
  await data.setActivePlayer(b.id);
  delete require.cache[dataModulePath];
  const restarted = require(dataModulePath);
  assert.deepEqual(await restarted.getActivePlayer(), b);
  assert.equal((await restarted.getPlayer(a.id)).heightCm, 180);
  await assert.rejects(data.setActivePlayer('missing'));
  assert.equal((await data.getActivePlayer()).id, b.id);
});

test('corrupt or missing selected players recover without changing deliveries', async () => {
  const a = await data.createPlayer('A');
  const b = await data.createPlayer('B');
  const saved = await data.saveSession(sessionInput(b.id));
  await data.setActivePlayer(b.id);
  storageValues.set(`players:${b.id}`, '{bad');
  assert.equal((await data.getActivePlayer()).id, a.id);
  assert.deepEqual(await data.listSessions({ playerId: b.id }), [saved]);
  storageValues.delete(`players:${a.id}`);
  assert.equal(await data.getActivePlayer(), null);
  assert.deepEqual(await data.listActivePlayerSessions(), []);
});

test('profile edits validate optional calibration dimensions and preserve identity', async () => {
  const player = await data.createPlayer(' A ', { heightCm: 180, shoeSizeEu: 42 });
  const updated = await data.updatePlayer(player.id, { name: ' B ', heightCm: 175 });
  assert.equal(updated.id, player.id);
  assert.equal(updated.createdAt, player.createdAt);
  assert.equal(updated.shoeSizeEu, 42);
  assert.equal(updated.name, 'B');
  await assert.rejects(data.updatePlayer(player.id, { heightCm: Infinity }));
  await assert.rejects(data.createPlayer('A', { heightCm: 0 }));
  await assert.rejects(data.createPlayer('x'.repeat(81)));
  await assert.rejects(data.updatePlayer('missing', { name: 'B' }));
  assert.equal((await data.getPlayer(player.id)).heightCm, 175);
  await data.updatePlayer(player.id, { heightCm: null });
  assert.equal((await data.getPlayer(player.id)).heightCm, undefined);
});

test('failed player index writes do not leave phantom profiles', async () => {
  await data.createPlayer('Existing');
  failNextStorageSetKey = 'players:index';
  await assert.rejects(data.createPlayer('Uncommitted'));
  assert.deepEqual((await data.listPlayers()).map(p => p.name), ['Existing']);
});

test('paged history separates players and breaks timestamp ties consistently', async () => {
  const a = await data.createPlayer('A');
  const b = await data.createPlayer('B');
  Date.now = () => 12345;
  for (let i = 0; i < 60; i++) await data.saveSession(sessionInput(i % 2 ? a.id : b.id));
  await data.setActivePlayer(a.id);
  const first = await data.listActivePlayerSessions({ limit: 25 });
  const last = await data.listActivePlayerSessions({ offset: 25, limit: 25 });
  assert.equal(first.length, 25); assert.equal(last.length, 5);
  assert.equal(new Set([...first, ...last].map(s => s.id)).size, 30);
  assert.ok([...first, ...last].every(s => s.playerId === a.id));
  await data.setActivePlayer(b.id);
  assert.ok((await data.listActivePlayerSessions()).every(s => s.playerId === b.id));
  for (const bad of [{ limit: NaN }, { offset: -1 }, { offset: 0.5 }, { from: Infinity }]) {
    await assert.rejects(data.listSessions(bad));
  }
});

test('cached sessions stay isolated from caller edits and detect changed or corrupt storage', async () => {
  const saved = await data.saveSession(sessionInput('player-a'));
  const first = (await data.listSessions())[0];
  first.release.x = 999;
  first.speedKmh = 999;
  assert.deepEqual((await data.listSessions())[0], saved);
  const changed = { ...saved, speedKmh: 125 };
  storageValues.set(`sessions:${saved.id}`, JSON.stringify(changed));
  assert.equal((await data.listSessions())[0].speedKmh, 125);
  storageValues.set(`sessions:${saved.id}`, '{broken');
  assert.deepEqual(await data.listSessions(), []);
});

test('200 and 1000 session queries avoid reparsing warm records and retain recovery', async () => {
  const { performance } = require('node:perf_hooks');
  const { isSession } = require('../src/data/validation.ts');
  for (const count of [200, 1000]) {
    storageValues.clear();
    const ids = [];
    for (let i = 0; i < count; i++) {
      const session = { ...createMockSession(`bench-${count}-${i}`, 120), playerId: `player-${i % 4}`, createdAt: i };
      ids.push(session.id);
      storageValues.set(`sessions:${session.id}`, JSON.stringify(session));
    }
    storageValues.set('sessions:index', JSON.stringify(ids));
    const coldStart = performance.now();
    await data.listSessions();
    const coldMs = performance.now() - coldStart;
    const originalParse = JSON.parse;
    let parsedRecords = 0;
    JSON.parse = (raw, ...args) => {
      if (typeof raw === 'string' && raw.includes('"frameCount"')) parsedRecords++;
      return originalParse(raw, ...args);
    };
    const start = performance.now();
    try {
      for (let run = 0; run < 20; run++) {
        const page = await data.listSessions({ playerId: 'player-0', limit: 25 });
        assert.equal(page.length, 25);
        const trend = await data.getTrend('player-0', 'all');
        assert.equal(trend.count, count / 4);
      }
    } finally { JSON.parse = originalParse; }
    const warmPairMs = (performance.now() - start) / 20;
    assert.equal(parsedRecords, 0, 'Warm queries do not reparse session JSON');
    const baselineStart = performance.now();
    for (let run = 0; run < 40; run++) {
      ids.map(id => originalParse(storageValues.get(`sessions:${id}`)))
        .filter(isSession).sort((a, b) => b.createdAt - a.createdAt).filter(s => s.playerId === 'player-0');
    }
    const baselineMs = (performance.now() - baselineStart) / 40;
    console.log(`PERF ${count} sessions: cold=${coldMs.toFixed(2)}ms, warm history+trend=${warmPairMs.toFixed(2)}ms, uncached single query=${baselineMs.toFixed(2)}ms, warm record parses=${parsedRecords}`);
    storageValues.set('sessions:orphan', JSON.stringify({ ...createMockSession('orphan', 120), playerId: 'player-0' }));
    assert.equal((await data.listSessions()).length, count + 1);
  }
});

test('compares persisted deliveries, signed deltas, ties and nullable angles', async () => {
  const inputA = sessionInput('player-a', 100);
  inputA.releaseAngleDeg = null;
  const a = await data.saveSession(inputA);
  const b = await data.saveSession(sessionInput('player-a', 140));
  const comparison = await data.getComparison(a.id, b.id);
  assert.deepEqual(comparison.a, a);
  assert.deepEqual(comparison.b, b);
  assert.equal(comparison.diffs[0].delta, b.speedKmh - a.speedKmh);
  assert.equal(comparison.diffs[0].better, 'b');
  assert.equal(comparison.diffs.some((d) => d.label === 'Angle'), false);
  const reversed = await data.getComparison(b.id, a.id);
  assert.equal(reversed.diffs[0].delta, -comparison.diffs[0].delta);
  assert.equal(reversed.diffs[0].better, 'a');
  const same = await data.getComparison(b.id, b.id);
  assert.ok(same.diffs.every((d) => d.delta === 0 && d.better === 'equal'));
  assert.equal(same.diffs.find((d) => d.label === 'Angle').a, b.releaseAngleDeg);
});

test('comparison rejects missing and corrupt records instead of fabricating results', async () => {
  const a = await data.saveSession(sessionInput('player-a'));
  await assert.rejects(data.getComparison(a.id, 'missing'), /was not found/);
  storageValues.set(`sessions:${a.id}`, '{broken');
  await assert.rejects(data.getComparison(a.id, a.id), /invalid/);
});

test('export rejects an unknown delivery before loading the native renderer', async () => {
  await assert.rejects(data.renderExport({ sessionId: 'missing', watermark: true }), /was not found/);
});

test('concurrent saves keep both deliveries indexed immediately', async () => {
  const sessions = await Promise.all([
    data.saveSession(sessionInput('player-a', 110)),
    data.saveSession(sessionInput('player-a', 130)),
  ]);
  assert.deepEqual(new Set(JSON.parse(storageValues.get('sessions:index'))), new Set(sessions.map((s) => s.id)));
});

test('filters saved deliveries by player, inclusive dates and limit', async () => {
  Date.now = () => 100;
  await data.saveSession(sessionInput('player-a'));
  Date.now = () => 200;
  const middle = await data.saveSession(sessionInput('player-a'));
  Date.now = () => 300;
  await data.saveSession(sessionInput('player-b'));
  assert.deepEqual(await data.listSessions({ playerId: 'player-a', from: 200, to: 200 }), [middle]);
  assert.deepEqual(await data.listSessions({ playerId: 'player-a', limit: 1 }), [middle]);
  assert.deepEqual(await data.listSessions({ limit: 0 }), []);
});
