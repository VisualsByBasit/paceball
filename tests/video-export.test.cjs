require('./register.cjs');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { after, beforeEach, test } = require('node:test');
const { createMockSession } = require('../src/data/mockData.ts');

const files = new Map();
const listeners = new Set();
const nativeRequests = [];
let nativeFailure = null;
let cancelled = [];

const join = (...parts) => parts.slice(1).reduce(
  (uri, part) => `${uri.replace(/\/$/, '')}/${String(part).replace(/^\//, '')}`,
  typeof parts[0] === 'string' ? parts[0] : parts[0].uri,
);

class File {
  constructor(...parts) { this.uri = join(...parts); }
  get exists() { return files.has(this.uri); }
  get size() { return files.get(this.uri)?.length ?? 0; }
  delete() { files.delete(this.uri); }
}

class Directory {
  constructor(...parts) { this.uri = join(...parts); }
  create() {}
}

const native = {
  async getVideoInfo() {
    return {
      durationMs: 5_000,
      frameCount: 300,
      width: 3840,
      height: 2160,
      rotationDegrees: 0,
      captureFps: 60,
      derivedFps: 60,
    };
  },
  async exportVideo(request) {
    nativeRequests.push(request);
    files.set(request.outputPath, new Uint8Array(4_096));
    if (nativeFailure) throw nativeFailure;
    return {
      outputPath: request.outputPath,
      outputBytes: 4_096,
      elapsedMs: 800,
      canvasWidth: 3840,
      canvasHeight: 2160,
      sourceRotationDegrees: 0,
      coordinateMode: 'display-oriented',
    };
  },
  async cancelVideoExport(id) { cancelled.push(id); return true; },
  addListener(name, listener) {
    assert.equal(name, 'onVideoExportProgress');
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  },
};

const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'expo-file-system') return {
    File,
    Directory,
    Paths: {
      document: new Directory('file:///app/documents'),
      cache: new Directory('file:///app/cache'),
      relative: (root, value) => value.uri.startsWith(`${root.uri}/`)
        ? value.uri.slice(root.uri.length + 1)
        : '../outside',
      isAbsolute: (value) => value.startsWith('/') || value.includes('://'),
    },
  };
  if (request.endsWith('modules/frame-extractor/src/FrameExtractorModule')) {
    return { __esModule: true, default: native };
  }
  return originalLoad.call(this, request, parent, main);
};

const { createSessionVideoExport, renderSessionVideo } = require('../src/export/renderSessionVideo.ts');

after(() => { Module._load = originalLoad; });
beforeEach(() => {
  files.clear();
  listeners.clear();
  nativeRequests.length = 0;
  cancelled = [];
  nativeFailure = null;
});

function session() {
  const value = createMockSession('video-export', 125);
  // Saved sessions are restored from marking-frame pixels into the original
  // video's full-resolution, display-oriented coordinate space.
  const scale = 2;
  for (const key of ['calA', 'calB', 'release', 'bounce']) {
    value[key] = { ...value[key], x: value[key].x * scale, y: value[key].y * scale };
  }
  value.width *= scale;
  value.height *= scale;
  value.pixelsPerMetre *= scale;
  value.videoPath = 'file:///app/documents/sessions/video-export/video.mp4';
  files.set(value.videoPath, new Uint8Array(50_000));
  return value;
}

test('Media3 request carries source and saved display geometry and defaults to silent', async () => {
  const result = await renderSessionVideo(session(), { isPro: false });
  const request = nativeRequests[0];
  assert.equal(request.includeAudio, false);
  assert.equal(request.watermark, true);
  assert.equal(request.sourceWidth, 3840);
  assert.equal(request.sourceHeight, 2160);
  assert.equal(request.coordinateWidth, 3840);
  assert.equal(request.coordinateHeight, 2160);
  assert.equal(result.inputBytes, 50_000);
  assert.equal(result.outputBytes, 4_096);
  assert.ok(result.clipDurationMs > 0 && result.clipDurationMs < 5_000);
});

test('live Pro/audio choices reach native and progress is scoped to one export', async () => {
  const task = createSessionVideoExport(session(), { isPro: true, includeAudio: true });
  const seen = [];
  const subscription = task.onProgress((progress) => seen.push(progress));
  for (const listener of listeners) {
    listener({ exportId: 'someone-else', progress: 20 });
    listener({ exportId: task.exportId, progress: 40 });
  }
  await task.result;
  subscription.remove();
  assert.deepEqual(seen, [40]);
  assert.equal(nativeRequests[0].watermark, false);
  assert.equal(nativeRequests[0].includeAudio, true);
  assert.equal(listeners.size, 0);
  assert.equal(await task.cancel(), true);
  assert.deepEqual(cancelled, [task.exportId]);
});

test('failed exports remove partial cache files without touching the source video', async () => {
  nativeFailure = new Error('encoder failed');
  const value = session();
  await assert.rejects(renderSessionVideo(value, { isPro: false }), /encoder failed/);
  assert.equal(files.has(value.videoPath), true);
  assert.equal([...files.keys()].some((path) => path.includes('paceball-video-exports')), false);
});

test('recordings outside permanent app storage never reach native code', async () => {
  const value = session();
  value.videoPath = 'file:///sdcard/shared.mp4';
  files.set(value.videoPath, new Uint8Array(20));
  await assert.rejects(renderSessionVideo(value, { isPro: false }), /permanent app storage/);
  assert.equal(nativeRequests.length, 0);
});
