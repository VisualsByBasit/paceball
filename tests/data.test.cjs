const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { after, beforeEach, test } = require('node:test');
const ts = require('typescript');

const storageValues = new Map();
const pathTypes = new Map();
const deletedPaths = [];
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

class MockPath {
  constructor(uri) {
    this.uri = uri;
  }

  delete() {
    deletedPaths.push(this.uri);
    pathTypes.delete(this.uri);
  }
}

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

  if (request === 'expo-file-system') {
    return {
      File: MockPath,
      Directory: MockPath,
      Paths: {
        cache: { uri: 'file:///app/cache/' },
        document: { uri: 'file:///app/documents/' },
        relative: (root, uri) =>
          uri.startsWith(root.uri) ? uri.slice(root.uri.length) : '../outside',
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
const { createMockSession } = require(
  path.join(__dirname, '..', 'src', 'data', 'mockData.ts'),
);
const DAY_MS = 24 * 60 * 60 * 1000;

const sessionInput = (
  playerId,
  speedKmh = 120,
  pathSuffix = Math.random().toString(36).slice(2),
) => ({
  playerId,
  videoPath: `file:///app/cache/${pathSuffix}.mp4`,
  framesDir: `file:///app/cache/${pathSuffix}-frames`,
  fps: 60,
  frameCount: 180,
  distanceM: 20.12,
  releaseFrame: 42,
  bounceFrame: 78,
  speedKmh,
  errorKmh: 4,
  releaseSpeedKmh: null,
  releaseAngleDeg: null,
});

beforeEach(() => {
  storageValues.clear();
  pathTypes.clear();
  deletedPaths.length = 0;
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

test('deletes session files and removes its storage record', async () => {
  const input = sessionInput('player-a', 120, 'delivery');
  pathTypes.set(input.videoPath, 'file');
  pathTypes.set(input.framesDir, 'directory');
  const session = await data.saveSession(input);

  await data.deleteSession(session.id);

  assert.deepEqual(deletedPaths, [input.videoPath, input.framesDir]);
  assert.deepEqual(await data.listSessions(), []);
  assert.equal(storageValues.has(`sessions:${session.id}`), false);
});

test('refuses unsafe deletion paths and keeps session metadata', async () => {
  const input = {
    ...sessionInput('player-a'),
    videoPath: 'file:///outside/delivery.mp4',
  };
  pathTypes.set(input.videoPath, 'file');
  pathTypes.set(input.framesDir, 'directory');
  const session = await data.saveSession(input);

  await assert.rejects(
    data.deleteSession(session.id),
    /Refusing to delete a path outside Paceball storage/,
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
    points: [{ t: recent.createdAt, speedKmh: 130 }],
    best: 130,
    avg: 130,
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
      (session.distanceM /
        ((session.bounceFrame - session.releaseFrame) / session.fps)) *
        3.6 *
        10,
    ) / 10;

  assert.equal(session.speedKmh, calculatedSpeed);
});
