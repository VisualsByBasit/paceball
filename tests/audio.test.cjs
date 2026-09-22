require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const microphone = require('../src/capture/microphone.ts');
const { DEFAULT_SETTINGS, parseSettings } = require('../src/settings/settings.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

const STATUSES = ['not-determined', 'authorized', 'denied', 'restricted'];

test('a denied microphone still records, video only, and is not asked again', () => {
  const { shouldOfferMicrophone, recordsSound } = microphone;
  // Offered once: on the first recording, while the system would still ask.
  assert.equal(shouldOfferMicrophone('not-determined', false), true);
  // Android reports a single denial as still askable. The flag stops the repeat.
  assert.equal(shouldOfferMicrophone('not-determined', true), false);
  for (const status of ['authorized', 'denied', 'restricted']) {
    assert.equal(shouldOfferMicrophone(status, false), false, status);
    assert.equal(shouldOfferMicrophone(status, true), false, status);
  }
  // Only a granted microphone adds a sound track.
  assert.deepEqual(STATUSES.filter(recordsSound), ['authorized']);

  // The flag is stored, defaults to not asked, and survives a bad neighbour.
  assert.equal(DEFAULT_SETTINGS.microphoneAsked, false);
  assert.equal(parseSettings({ microphoneAsked: true, unit: 'nonsense' }).microphoneAsked, true);
  assert.equal(parseSettings({ microphoneAsked: 'yes' }).microphoneAsked, false);

  const capture = read('app/capture.tsx');
  const record = capture.slice(capture.indexOf('const record = useCallback'), capture.indexOf('const answerMicrophone'));
  // Anything but the one-time offer goes straight to recording.
  assert.match(record, /if \(shouldOfferMicrophone\(microphone\.status, getSettings\(\)\.microphoneAsked\)\) \{/);
  assert.match(record, /startRecording\(\);/);
  assert.doesNotMatch(record, /hasPermission|recordsSound/);
  // Both answers mark it asked, and "Video only" never opens the system dialog.
  const answer = capture.slice(capture.indexOf('const answerMicrophone'));
  assert.match(answer, /updateSettings\(\{ microphoneAsked: true \}\);[\s\S]*if \(allow\) await microphone\.requestPermission\(\)/);
  // The output only asks for sound when it has been granted.
  assert.match(capture, /const enableAudio = recordsSound\(microphone\.status\);/);
  // The camera screen is never held back on the microphone the way it is on the camera.
  assert.doesNotMatch(capture, /!microphone\.hasPermission/);
  // The recorder itself knows nothing about sound.
  assert.doesNotMatch(read('src/capture/useCapture.ts'), /microphone|audio/i);
});

test('the microphone is asked at the first capture, never at launch', () => {
  const capture = read('app/capture.tsx');
  // Asked from the shutter's answer, not from an effect that runs on opening.
  const effects = capture.match(/useEffect\([\s\S]*?\n {2}\}[^\n]*\);/g) ?? [];
  for (const effect of effects) assert.doesNotMatch(effect, /microphone/i);
  for (const file of ['app/_layout.tsx', 'app/index.tsx', 'app/setup/player.tsx', 'app/setup/camera.tsx', 'app/setup/how-it-works.tsx']) {
    assert.doesNotMatch(read(file), /useMicrophonePermission|requestMicrophonePermission/, file);
  }
  // One line on why, shown with the offer.
  assert.match(microphone.MICROPHONE_OFFER_REASON, /keep the sound of the delivery/);
  assert.match(capture, /\{MICROPHONE_OFFER_REASON\}/);
});

test('playback starts muted on every clip, with a visible switch', () => {
  const analysis = read('app/analysis.tsx');
  assert.match(analysis, /useVideoPlayer\(session\.videoPath, \(p\) => \{[\s\S]*?p\.muted = true;/);
  assert.match(analysis, /const \[muted, setMuted\] = useState\(true\);/);
  // A new delivery is a new player and a new muted state.
  assert.match(analysis, /<Replay\s+\/\/[^\n]*\n\s*key=\{loaded\.session\.id\}/);
  // The choice is not kept anywhere that outlives the clip.
  assert.doesNotMatch(analysis, /updateSettings|muted:\s*(true|false|muted)/);
  assert.doesNotMatch(read('src/settings/settings.ts'), /muted|sound/i);
  // The switch is on the player controls, and says which way it is.
  assert.match(analysis, /accessibilityRole="switch"\s+accessibilityState=\{\{ checked: !muted \}\}/);
  assert.match(analysis, /\{muted \? 'Sound off' : 'Sound on'\}/);
  assert.match(analysis, /player\.muted = next;/);
});

test('an export is silent unless sound was switched on for that export', () => {
  const debug = read('app/debug.tsx');
  assert.match(debug, /const \[includeAudio, setIncludeAudio\] = useState\(false\);/);
  // Taken for this export, then switched back off for the next one.
  assert.match(debug, /const withAudio = includeAudio;\s*setIncludeAudio\(false\);/);
  assert.match(debug, /createSessionVideoExport\(session, \{ isPro, includeAudio: withAudio \}\)/);
  assert.match(debug, /includeAudio \? 'sound included' : 'silent export'/);
  // The plan, which is not changed here, still defaults to no audio track.
  assert.match(read('src/export/videoPlan.ts'), /includeAudio: options\.includeAudio \?\? false/);
});

test('fps, frame count and dimensions are read off the video track only', () => {
  const native = read('modules/frame-extractor/android/src/main/java/expo/modules/frameextractor/FrameExtractorModule.kt');
  const info = native.slice(native.indexOf('AsyncFunction("getVideoInfo")'), native.indexOf('AsyncFunction("extractFrames")'));
  // Duration comes from the video track. The container's is the longest track,
  // which a sound track can stretch past the last frame.
  assert.match(native, /\.firstOrNull \{ it\.getString\(MediaFormat\.KEY_MIME\)\?\.startsWith\("video\/"\) == true \}/);
  assert.match(info, /val durationUs = videoTrackDurationUs\(file\) \?: \(containerMs \* 1000L\)/);
  assert.match(info, /frameCount\.toDouble\(\) \/ \(durationUs \/ 1_000_000\.0\)/);
  // Every other figure has a VIDEO key of its own.
  for (const key of ['VIDEO_FRAME_COUNT', 'VIDEO_WIDTH', 'VIDEO_HEIGHT', 'VIDEO_ROTATION']) {
    assert.match(info, new RegExp(`METADATA_KEY_${key}`), key);
  }
  assert.doesNotMatch(info, /durationMs \/ 1000f/, 'fps from the container duration');

  // What a stretched container would have done: 180 frames over a 3.000 s video
  // track, with sound running to 3.050 s.
  const fromVideo = 180 / 3.0;
  const fromContainer = 180 / 3.05;
  assert.equal(fromVideo, 60);
  assert.ok(fromVideo - fromContainer > 0.9, 'a sound track would have read the fps a frame low');

  // Capture hands marking what the file said, with nothing about sound in it.
  const capture = read('app/capture.tsx');
  const onFinished = capture.slice(capture.indexOf('const onFinished'), capture.indexOf('const capture = useCapture'));
  assert.match(onFinished, /fps: String\(info\.derivedFps\)/);
  assert.doesNotMatch(onFinished, /audio|microphone/i);
});

test('the privacy copy names what sound does and where it stays', () => {
  const privacy = read('app/diagnostics.tsx');
  assert.match(privacy, /Recordings include sound if you allow the microphone\./);
  assert.match(privacy, /Recordings stay on this phone, with or without sound\./);
  assert.match(privacy, /Shared videos are silent unless you choose to include sound\./);
  assert.match(privacy, /sound never changes a reading/);
  // The existing promise is still the specific one.
  assert.match(privacy, /never uploads your videos or measurements/);
  assert.match(read('app/setup/how-it-works.tsx'), /Sound is recorded too if you allow the microphone\./);
});

test('new copy uses no em dashes', () => {
  const copy = [
    microphone.MICROPHONE_OFFER_TITLE,
    microphone.MICROPHONE_OFFER_REASON,
    microphone.MICROPHONE_OFFER_ALLOW,
    microphone.MICROPHONE_OFFER_SKIP,
    ...STATUSES.flatMap((status) => [
      microphone.microphoneSettingLine(status, false),
      microphone.microphoneSettingLine(status, true),
    ]),
    read('app/diagnostics.tsx').match(/<Text style=\{styles\.body\}>Recordings include sound[^<]*/)[0],
    read('app/setup/how-it-works.tsx').match(/Sound is recorded too[^']*/)[0],
    'Sound off', 'Sound on', 'Open system settings', 'Microphone',
    read('app/debug.tsx').match(/'sound included' : 'silent export'/)[0],
  ];
  for (const line of copy) assert.doesNotMatch(line, /—/, line);

  // Settings reads the status and sends the user to the system to change it.
  const settings = read('app/settings.tsx');
  assert.match(settings, /microphoneSettingLine\(microphone\.status, settings\.microphoneAsked\)/);
  assert.match(settings, /Linking\.openSettings\(\)/);
  assert.doesNotMatch(settings, /requestPermission/);
  // Off is said without alarm.
  assert.doesNotMatch(microphone.microphoneSettingLine('denied', true), /warning|error|required|needed/i);
});
