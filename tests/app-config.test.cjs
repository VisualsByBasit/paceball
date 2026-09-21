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

test('the microphone permission is not declared while nothing asks for audio', () => {
  // How Vision Camera records sound: an audio-enabled output, or asking for the
  // microphone. Captured MP4s have no audio track because nothing here does either.
  const asksForAudio = /enableAudio\s*:\s*true|useMicrophonePermission|requestMicrophonePermission|RECORD_AUDIO/;
  const requesters = [...sources('app'), ...sources('src')].filter((file) =>
    asksForAudio.test(fs.readFileSync(path.join(root, file), 'utf8'))
  );
  assert.deepEqual(requesters, [], 'something asks for audio; declare the permission deliberately');

  const android = appJson().android;
  const declared = android.permissions ?? [];
  assert.ok(!declared.includes('android.permission.RECORD_AUDIO'), 'RECORD_AUDIO is declared');
  assert.ok(!declared.includes('RECORD_AUDIO'), 'RECORD_AUDIO is declared');
  // Blocked too, so no library can merge it back into the built manifest.
  assert.ok(android.blockedPermissions.includes('android.permission.RECORD_AUDIO'));
});
