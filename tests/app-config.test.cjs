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
