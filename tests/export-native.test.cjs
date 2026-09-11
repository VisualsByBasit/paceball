require('./register.cjs');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const { before, beforeEach, after, test } = require('node:test');
const { createMockSession } = require('../src/data/mockData.ts');
const files = new Map();
const directories = new Set();
let pngFixture, skia, typeface;
let permission, saved, shares, requests, shareAvailable, failWrite, fontFailure, disposedBrokenFonts;
const load = Module._load;
const join = (...parts) => parts.slice(1).reduce(
  (uri, part) => `${uri.replace(/\/$/, '')}/${String(part).replace(/^\//, '')}`,
  typeof parts[0] === 'string' ? parts[0] : parts[0].uri,
);
class File {
  constructor(...parts) { this.uri = join(...parts); }
  get exists() { return files.has(this.uri); }
  get size() { return files.get(this.uri)?.length ?? 0; }
  async bytes() { return files.get(this.uri); }
  write(bytes) { files.set(this.uri, bytes); if (failWrite) throw new Error('Disk full'); }
  delete() { files.delete(this.uri); }
}
class Directory {
  constructor(...parts) { this.uri = join(...parts); }
  create() { directories.add(this.uri); }
}
Module._load = function(request, parent, main) {
  if (request === 'expo-file-system') return { File, Directory, Paths: {
    document: new Directory('file:///app/documents'), cache: new Directory('file:///app/cache'),
    relative: (root, value) => {
      const uri = typeof value === 'string' ? value : value.uri;
      return uri.startsWith(`${root.uri}/`) ? uri.slice(root.uri.length + 1) : '../outside';
    },
    isAbsolute: (value) => value.startsWith('/') || value.includes('://'),
  } };
  if (request === '@shopify/react-native-skia') return {
    Skia: skia, ImageFormat: { PNG: 4 }, matchFont: ({ fontFamily, fontSize }) => {
      assert.equal(fontFamily, 'sans-serif');
      if (fontFailure) return {
        getGlyphIDs: (text) => [...text].map(() => 0),
        getGlyphWidths: () => [0],
        dispose: () => { disposedBrokenFonts++; },
      };
      return skia.Font(typeface, fontSize);
    },
  };
  if (request === '../ui/tokens') return { colors: {
    bg: '#0A0B0D', surface: '#14161A', text: '#FFFFFF', muted: '#8A9099', accent: '#D4FF3F',
  } };
  if (request === 'expo-media-library/legacy') return {
    requestPermissionsAsync: async (...args) => { requests.push(args); return permission; },
    saveToLibraryAsync: async (uri) => { saved.push(uri); },
  };
  if (request === 'expo-sharing') return {
    isAvailableAsync: async () => shareAvailable,
    shareAsync: async (...args) => { shares.push(args); },
  };
  return load.call(this, request, parent, main);
};
let renderSessionImage, actions;
before(async () => {
  const kit = await require('canvaskit-wasm/bin/full/canvaskit.js')({
    locateFile: () => require.resolve('canvaskit-wasm/bin/full/canvaskit.wasm'),
  });
  skia = require('@shopify/react-native-skia/lib/commonjs/skia/web').JsiSkApi(kit);
  const fontPath = [process.env.PACEBALL_TEST_FONT, 'C:/Windows/Fonts/arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf']
    .find((p) => p && fs.existsSync(p));
  assert.ok(fontPath, 'Set PACEBALL_TEST_FONT to a TTF');
  const data = skia.Data.fromBytes(fs.readFileSync(fontPath));
  typeface = skia.Typeface.MakeFreeTypeFaceFromData(data); data.dispose();
  const surface = skia.Surface.Make(1280, 720);
  surface.getCanvas().clear(skia.Color('#324734'));
  surface.flush();
  const image = surface.makeImageSnapshot();
  pngFixture = image.encodeToBytes(4);
  image.dispose(); surface.dispose();
  ({ renderSessionImage } = require('../src/export/renderSessionImage.ts'));
  actions = require('../src/export/deliveryActions.ts');
});
beforeEach(() => {
  files.clear(); directories.clear();
  permission = { granted: true, canAskAgain: true };
  saved = []; shares = []; requests = []; shareAvailable = true; failWrite = false;
  fontFailure = false; disposedBrokenFonts = 0;
});
after(() => { Module._load = load; typeface?.dispose(); });
function input() {
  const session = { ...createMockSession('export', 125), framesDir: 'file:///app/documents/sessions/export/frames' };
  files.set(`${session.framesDir}/frame_00042.jpg`, pngFixture);
  return session;
}
test('production renderer writes a real PNG and gallery saving requests write-only permission', async () => {
  const output = await renderSessionImage(input(), true);
  assert.equal(output.videoPath, null);
  assert.ok(output.imagePath.startsWith('file:///app/cache/paceball-exports/'));
  const bytes = Buffer.from(files.get(output.imagePath));
  assert.equal(bytes.readUInt32BE(16), 1080);
  assert.equal(bytes.readUInt32BE(20), 1200);
  await actions.saveExportToGallery(output.imagePath);
  assert.deepEqual(requests, [[true, []]]);
  assert.deepEqual(saved, [output.imagePath]);
});

test('unusable font fails before writing a blank PNG, disposes it and preserves source media', async () => {
  const session = input(); fontFailure = true;
  await assert.rejects(renderSessionImage(session, true), /font cannot render/);
  assert.equal(disposedBrokenFonts, 1);
  assert.deepEqual([...files.keys()], [`${session.framesDir}/frame_00042.jpg`]);
  assert.deepEqual(saved, []);
});
test('missing, corrupt, remote and wrongly oriented source frames fail explicitly', async () => {
  const session = input();
  files.clear();
  await assert.rejects(renderSessionImage(session, true), /missing/);
  files.set(`${session.framesDir}/frame_00042.jpg`, new Uint8Array([1, 2, 3]));
  await assert.rejects(renderSessionImage(session, true), /decoded/);
  await assert.rejects(renderSessionImage({ ...session, framesDir: 'https://example.com/frames' }, true), /permanent/);
  const valid = input();
  await assert.rejects(renderSessionImage({ ...valid, width: 3840, height: 1080 }, true), /orientation/);
});
test('a failed PNG write cleans its partial file and leaves source media intact', async () => {
  const session = input(); failWrite = true;
  await assert.rejects(renderSessionImage(session, true), /Disk full/);
  assert.deepEqual([...files.keys()], [`${session.framesDir}/frame_00042.jpg`]);
});
test('denied gallery permission keeps export available and never reports a save', async () => {
  const { imagePath } = await renderSessionImage(input(), true);
  permission = { granted: false, canAskAgain: true };
  await assert.rejects(actions.saveExportToGallery(imagePath), /denied/);
  permission.canAskAgain = false;
  await assert.rejects(actions.saveExportToGallery(imagePath), /Settings/);
  assert.deepEqual(saved, []);
  assert.ok(files.has(imagePath));
});
test('sharing checks availability and passes only the generated PNG to the system sheet', async () => {
  const { imagePath } = await renderSessionImage(input(), true);
  shareAvailable = false;
  await assert.rejects(actions.shareExport(imagePath), /not available/);
  assert.equal(shares.length, 0);
  shareAvailable = true;
  await actions.shareExport(imagePath);
  assert.equal(shares[0][0], imagePath);
  assert.equal(shares[0][1].mimeType, 'image/png');
});
test('gallery helper rejects missing artifacts and files outside export cache before permissions', async () => {
  await assert.rejects(actions.saveExportToGallery('file:///app/cache/paceball-exports/gone.png'), /missing/);
  await assert.rejects(actions.saveExportToGallery('file:///app/documents/video.mp4'), /PNG/);
  assert.deepEqual(requests, []);
});
