require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

/**
 * A small file system: a set of URIs that exist. Directories and files are
 * both entries; deleting a directory deletes everything under it.
 */
const existing = new Set();
const deleted = [];
const CACHE = 'file:///data/user/0/com.paceball.app/cache';
const DOCUMENTS = 'file:///data/user/0/com.paceball.app/files';

const join = (parts) => parts.map((p) => (typeof p === 'string' ? p : p.uri).replace(/\/+$/, '')).join('/');

class Entry {
  constructor(...parts) {
    this.uri = join(parts);
  }
  get exists() {
    return existing.has(this.uri);
  }
  delete() {
    deleted.push(this.uri);
    for (const uri of [...existing]) if (uri === this.uri || uri.startsWith(`${this.uri}/`)) existing.delete(uri);
  }
}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'expo-file-system') {
    return {
      File: Entry,
      Directory: Entry,
      Paths: {
        cache: { uri: CACHE },
        document: { uri: DOCUMENTS },
        relative: (from, to) => {
          const base = typeof from === 'string' ? from : from.uri;
          return to.startsWith(`${base}/`) ? to.slice(base.length + 1) : `../${to}`;
        },
        isAbsolute: (p) => p.startsWith('/') || p.startsWith('file:'),
      },
    };
  }
  if (request === 'expo') return { requireNativeModule: () => ({}), NativeModule: class {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { discardClip, framesDirUri } = require('../src/capture/useFrames.ts');
Module._load = originalLoad;

test('an abandoned clip goes, with every frame extracted from it', () => {
  existing.clear();
  deleted.length = 0;
  const video = '/data/user/0/com.paceball.app/cache/VisionCamera-123.mp4';
  const frames = framesDirUri(video);
  existing.add(`file://${video}`);
  existing.add(frames);
  existing.add(`${frames}/frame_00000.jpg`);
  existing.add(`${frames}/frame_00001.jpg`);

  discardClip(video);
  assert.equal(existing.size, 0, 'nothing of the clip is left');
  assert.ok(deleted.includes(frames));
  assert.ok(deleted.includes(`file://${video}`));
});

test('a saved clip has already left the cache, so discarding it finds nothing', () => {
  existing.clear();
  deleted.length = 0;
  const saved = `${DOCUMENTS}/paceball/sessions/s1/delivery.mp4`;
  existing.add(saved);
  // Only ever the cache: a path in permanent storage is left alone.
  discardClip(saved);
  assert.ok(existing.has(saved));
  assert.deepEqual(deleted, []);
  // And a clip that is already gone is not an error.
  assert.doesNotThrow(() => discardClip('/data/user/0/com.paceball.app/cache/gone.mp4'));
  assert.doesNotThrow(() => discardClip(''));
});

test('Mark deletes the clip when it is left without saving, after decoding has stopped', () => {
  const mark = read('app/mark.tsx');
  assert.match(mark, /useFrames\(videoPath, frameCount \?\? 0, \{ discardOnLeave: true \}\)/);
  const hook = read('src/capture/useFrames.ts');
  // It waits for the batch in flight, which would otherwise recreate the directory.
  assert.match(hook, /inFlight\.current\.then\(discard, discard\);/);
  // Record again goes back to the Capture beneath rather than stacking another.
  assert.match(mark, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\('\/capture'\)/);
});

test('a camera Android will no longer ask for sends the user to settings', () => {
  const capture = read('app/capture.tsx');
  assert.match(capture, /const \{ hasPermission, requestPermission, canRequestPermission \} = useCameraPermission\(\);/);
  // Asking is only tried while the system can still show its dialog.
  assert.match(capture, /if \(!hasPermission && canRequestPermission\) void requestPermission\(\)\.catch\(\(\) => false\);/);
  assert.match(capture, /: Linking\.openSettings\(\)\.catch\(\(\) => undefined\)\)/);
  assert.match(capture, /\{canRequestPermission \? 'Grant access' : 'Open settings'\}/);
  // The promise from the button is always handled.
  assert.doesNotMatch(capture, /onPress=\{requestPermission\}/);
});

test('the lens swap cannot start its reveal timer after Capture has closed', () => {
  const capture = read('app/capture.tsx');
  assert.match(capture, /\.start\(\(\) => \{\s*if \(!mounted\.current\) return;\s*setLens\(next\);/);
  assert.match(capture, /mounted\.current = false;\s*if \(swapTimeout\.current !== null\) clearTimeout\(swapTimeout\.current\);/);
});
