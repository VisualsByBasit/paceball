const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const appJson = () => JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;

test('the UI is locked to portrait', () => {
  // Nothing was built for landscape: rotating hid the frame on Mark and the
  // shutter on Capture. This locks the UI only. Clips are still recorded and
  // marked in whatever orientation the phone was held in, which the export and
  // frame tests cover separately.
  assert.equal(appJson().orientation, 'portrait');
});

/** Every source file the app ships, so a request for audio cannot hide anywhere. */
function sources(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(rel);
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
  });
}

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

/** Asks the system for the microphone, as opposed to only reading its status. */
const requestsMicrophone = /microphone\.requestPermission\(|requestMicrophonePermission\(/;

/**
 * The permission and the capture code have to agree. Declared without capture
 * asking for audio, the app claims a microphone it never uses. Capture asking
 * without it declared, Android refuses every time and clips are silent.
 */
function audioProblem({ declared, blocked, captureAsks }) {
  if (declared && blocked) return 'RECORD_AUDIO is declared and blocked at once';
  if (declared && !captureAsks) return 'RECORD_AUDIO is declared but capture never requests audio';
  if (!declared && captureAsks) return 'capture requests audio but RECORD_AUDIO is not declared';
  return null;
}

test('the audio check fails in both directions, not only one', () => {
  assert.equal(audioProblem({ declared: true, blocked: false, captureAsks: true }), null);
  assert.equal(audioProblem({ declared: false, blocked: true, captureAsks: false }), null);
  assert.match(audioProblem({ declared: true, blocked: false, captureAsks: false }), /never requests audio/);
  assert.match(audioProblem({ declared: false, blocked: false, captureAsks: true }), /not declared/);
  assert.match(audioProblem({ declared: true, blocked: true, captureAsks: true }), /blocked/);
});

test('the microphone permission is declared exactly because capture records sound', () => {
  const android = appJson().android;
  const declared = (android.permissions ?? []).includes('android.permission.RECORD_AUDIO');
  const blocked = (android.blockedPermissions ?? []).includes('android.permission.RECORD_AUDIO');

  // How Vision Camera records sound: ask for the microphone, then an output
  // with audio enabled. Capture has to do both.
  const capture = read('app/capture.tsx');
  const captureAsks =
    /useMicrophonePermission\(\)/.test(capture) &&
    requestsMicrophone.test(capture) &&
    /enableAudio\b/.test(capture);

  assert.equal(audioProblem({ declared, blocked, captureAsks }), null);
  assert.ok(declared, 'recordings are meant to carry the delivery sound');

  // Capture is the only place that asks. Settings may read the status, never request it.
  const requesters = [...sources('app'), ...sources('src')].filter((file) =>
    requestsMicrophone.test(read(file))
  );
  assert.deepEqual(requesters, [path.join('app', 'capture.tsx')]);
});

test('the native splash is the app\'s own near-black, so the launch intro follows it without a flash', () => {
  // Top-level `splash` only configures the web splash in this SDK; Android's
  // comes from the expo-splash-screen plugin.
  assert.equal(appJson().splash, undefined);
  const plugin = appJson().plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen');
  assert.ok(plugin, 'expo-splash-screen is configured');
  const bg = read('src/ui/tokens.ts').match(/bg: '(#[0-9A-Fa-f]{6})'/)[1];
  assert.equal(plugin[1].backgroundColor, bg);
  // Dark theme too, so a phone in dark mode gets the same near-black.
  assert.equal(plugin[1].dark.backgroundColor, bg);
  // No splash image: Android 12+ shows the launcher icon on it.
  assert.equal(plugin[1].image, undefined);
  assert.equal(plugin[1].dark.image, undefined);
});

/** Width, height and colour type straight from a PNG's IHDR. */
function pngHeader(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${file} is a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

test('the launcher icon is the website logo, copied into the app, never read from website/', () => {
  const app = appJson();
  assert.equal(app.icon, './assets/icon.png');
  // The same file byte for byte: no new artwork.
  assert.ok(fs.readFileSync(path.join(root, 'assets', 'icon.png'))
    .equals(fs.readFileSync(path.join(root, 'website', 'public', 'logo.png'))));
  const icon = pngHeader('assets/icon.png');
  assert.equal(icon.width, icon.height, 'square');
  for (const [key, value] of Object.entries(app)) {
    assert.doesNotMatch(JSON.stringify(value), /website\//, `app.json ${key} points into website/`);
  }
});

test('the adaptive icon keeps the logo inside the safe zone on the near-black', () => {
  const adaptive = appJson().android.adaptiveIcon;
  const bg = read('src/ui/tokens.ts').match(/bg: '(#[0-9A-Fa-f]{6})'/)[1];
  assert.equal(adaptive.backgroundColor, bg);
  assert.equal(adaptive.foregroundImage, './assets/adaptive-icon.png');
  const foreground = pngHeader('assets/adaptive-icon.png');
  const logo = pngHeader('assets/icon.png');
  assert.equal(foreground.width, foreground.height);
  // RGBA, so the margin can be transparent.
  assert.equal(foreground.colorType, 6);
  // Android shows the middle 72 of 108 dp and keeps a 66 dp circle safe. The
  // logo, unscaled, spans two thirds of the canvas: the 72 dp the mask shows,
  // with the ball well inside the safe circle.
  assert.ok(Math.abs(logo.width / foreground.width - 72 / 108) < 0.01);
});

test('the EAS upload carries the icon assets', () => {
  for (const file of ['.easignore', '.gitignore']) {
    const rules = read(file).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
    for (const rule of rules) {
      assert.doesNotMatch(rule, /^\/?assets\/?$|^\*\.png$/, `${file} would drop assets/: ${rule}`);
    }
  }
});
