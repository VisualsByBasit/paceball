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
