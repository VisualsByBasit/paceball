require('./register.cjs');
const assert = require('node:assert/strict');
const Module = require('node:module');
const nodePath = require('node:path');
const { after, beforeEach, test } = require('node:test');
const { createMockSession } = require('../src/data/mockData.ts');

// The phone as it really is: the app's data lives under /data/user/0, which is
// a symlink to /data/data. Expo's Paths name the first; Java's canonicalFile,
// and so the native exporter's reply, names the second. Same file, two strings.
const PKG = 'com.paceball.app';
const canonical = (uri) => uri.replace('file:///data/user/0/', 'file:///data/data/');

const files = new Map();
const shared = [];
const saved = [];

const join = (...parts) => parts.slice(1).reduce(
  (uri, part) => `${uri.replace(/\/$/, '')}/${String(part).replace(/^\//, '')}`,
  typeof parts[0] === 'string' ? parts[0] : parts[0].uri,
);

class File {
  constructor(...parts) { this.uri = join(...parts); }
  get exists() { return files.has(canonical(this.uri)); }
  get size() { return files.get(canonical(this.uri))?.length ?? 0; }
  delete() { files.delete(canonical(this.uri)); }
}

class Directory {
  constructor(...parts) { this.uri = join(...parts); }
  create() {}
}

const uriOf = (value) => (typeof value === 'string' ? value : value.uri);

const native = {
  async getVideoInfo() {
    return { durationMs: 5_000, frameCount: 300, width: 1920, height: 1080, rotationDegrees: 0, captureFps: 60, derivedFps: 60 };
  },
  async getFrameTimesMs(uri, frames) { return frames.map((frame) => (frame / 60) * 1_000); },
  async exportVideo(request) {
    // What VideoExporter.kt does: write to the canonical file, and reply with
    // "file://" + its absolutePath.
    files.set(canonical(request.outputPath), new Uint8Array(4_096));
    return {
      outputPath: canonical(request.outputPath),
      outputBytes: 4_096,
      elapsedMs: 500,
      canvasWidth: 1920,
      canvasHeight: 1080,
      sourceRotationDegrees: 0,
      coordinateMode: 'display-oriented',
    };
  },
  async cancelVideoExport() { return true; },
  addListener() { return { remove() {} }; },
};

const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'expo-file-system') return {
    File,
    Directory,
    Paths: {
      document: new Directory(`file:///data/user/0/${PKG}/files`),
      cache: new Directory(`file:///data/user/0/${PKG}/cache`),
      // Expo's own: node's path.relative over the two URI strings.
      relative: (from, to) => nodePath.posix.relative(uriOf(from), uriOf(to)),
      isAbsolute: (value) => value.startsWith('/') || value.includes('://'),
    },
  };
  if (request.endsWith('modules/frame-extractor/src/FrameExtractorModule')) {
    return { __esModule: true, default: native };
  }
  if (request === '../ui/tokens') return { colors: {
    bg: '#0A0B0D', surface: '#14161A', text: '#FFFFFF', muted: '#8A9099', accent: '#D4FF3F',
  } };
  if (request === 'expo-media-library/legacy') return {
    requestPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
    saveToLibraryAsync: async (uri) => { saved.push(uri); },
  };
  if (request === 'expo-sharing') return {
    isAvailableAsync: async () => true,
    shareAsync: async (uri, options) => { shared.push({ uri, options }); },
  };
  return originalLoad.call(this, request, parent, main);
};

const { renderSessionVideo } = require('../src/export/renderSessionVideo.ts');
const { saveVideoToGallery, shareVideoExport, shareExport } = require('../src/export/deliveryActions.ts');

after(() => { Module._load = originalLoad; });
beforeEach(() => {
  files.clear();
  shared.length = 0;
  saved.length = 0;
});

function session() {
  const value = createMockSession('video-share', 125);
  value.videoPath = `file:///data/user/0/${PKG}/files/sessions/video-share/video.mp4`;
  files.set(canonical(value.videoPath), new Uint8Array(50_000));
  return value;
}

test('a finished clip opens the share sheet as video/mp4, not "Select a Paceball video export"', async () => {
  // The bug: the clip's path came back from native in its canonical form, so
  // the check that it lies in Paceball's export folder compared two different
  // strings for the same folder and refused every clip.
  const result = await renderSessionVideo(session(), { isPro: false });
  assert.match(result.outputPath, new RegExp(`^file:///data/user/0/${PKG}/cache/paceball-video-exports/[^/]+\\.mp4$`));
  await shareVideoExport(result.outputPath);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].uri, result.outputPath);
  assert.equal(shared[0].options.mimeType, 'video/mp4');
});

test('Save to gallery saves the same MP4', async () => {
  const result = await renderSessionVideo(session(), { isPro: true });
  await saveVideoToGallery(result.outputPath);
  assert.deepEqual(saved, [result.outputPath]);
});

test('the export folder check still refuses anything that is not a Paceball clip', async () => {
  const stranger = `file:///data/user/0/${PKG}/files/sessions/video-share/video.mp4`;
  files.set(canonical(stranger), new Uint8Array(10));
  await assert.rejects(() => shareVideoExport(stranger), /Select a Paceball video export\./);
  await assert.rejects(
    () => shareVideoExport(`file:///data/user/0/${PKG}/cache/paceball-video-exports/gone.mp4`),
    /The exported video is missing\. Create it again\./,
  );
  assert.equal(shared.length, 0);
});

test('the image card shares from the same export cache as image/png', async () => {
  const image = `file:///data/user/0/${PKG}/cache/paceball-exports/card.png`;
  files.set(canonical(image), new Uint8Array(2_048));
  await shareExport(image);
  assert.equal(shared[0].uri, image);
  assert.equal(shared[0].options.mimeType, 'image/png');
});
