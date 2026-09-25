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
  // The shutter records straight away, whatever the microphone's answer.
  assert.match(capture, /allowed\s*\? capture\.start\s*:/);
  // Both answers mark it asked, and "Video only" never opens the system dialog.
  const answer = capture.slice(capture.indexOf('const answerMicrophone'));
  assert.match(answer, /updateSettings\(\{ microphoneAsked: true \}\);[\s\S]*if \(allow\) await microphone\.requestPermission\(\)/);
  // The output only asks for sound when it has been granted, and it is free.
  assert.match(capture, /const enableAudio = recordsSound\(microphone\.status\) && !microphoneBusy;/);
  // The camera screen is never held back on the microphone the way it is on the camera.
  assert.doesNotMatch(capture, /!microphone\.hasPermission/);
  // The recorder never asks for or reads the permission; it is told whether sound is on.
  assert.doesNotMatch(read('src/capture/useCapture.ts'), /useMicrophonePermission|requestPermission|microphoneAsked/);
});

test('the microphone is offered when Capture first opens, never from the shutter', () => {
  const capture = read('app/capture.tsx');
  // An effect on opening, once the camera itself is allowed, gated on the same flag.
  const offer = capture.slice(capture.indexOf('// Offered on the first visit'), capture.indexOf('// Tearing the session down'));
  assert.match(offer, /useEffect\(\(\) => \{\s*if \(!hasPermission\) return;\s*if \(shouldOfferMicrophone\(microphone\.status, getSettings\(\)\.microphoneAsked\)\) \{\s*setOfferingMicrophone\(true\);/);
  assert.match(offer, /\}, \[hasPermission, microphone\.status\]\);/);
  // Nothing on the shutter's path opens it, and the shutter never waits on it.
  assert.equal(capture.match(/setOfferingMicrophone\(true\)/g).length, 1);
  const shutter = capture.slice(capture.indexOf('onPress={\n              isRecording'), capture.indexOf('style={styles.shutter}'));
  assert.ok(shutter.length > 0);
  assert.doesNotMatch(shutter, /offeringMicrophone|shouldOfferMicrophone|\brecord\b/);
  assert.doesNotMatch(capture, /const record = useCallback/);
  // Hidden while recording, so answering it can never restart the session under a clip.
  assert.match(capture, /\{offeringMicrophone && !isRecording && !isProcessing \? \(/);
  // Never at launch: nothing before Capture asks.
  for (const file of ['app/_layout.tsx', 'app/index.tsx', 'app/setup/player.tsx', 'app/setup/camera.tsx', 'app/setup/how-it-works.tsx']) {
    assert.doesNotMatch(read(file), /useMicrophonePermission|requestMicrophonePermission/, file);
  }
  // Same one line on why, shown with the offer.
  assert.match(microphone.MICROPHONE_OFFER_REASON, /keep the sound of the delivery/);
  assert.match(capture, /\{MICROPHONE_OFFER_REASON\}/);
});

test('the offer is never shown again once answered', () => {
  // The first visit offers; after either answer, every later visit does not.
  let asked = false;
  const visit = (status) => microphone.shouldOfferMicrophone(status, asked);
  assert.equal(visit('not-determined'), true);
  asked = true; // "Video only", or a system dialog dismissed without granting
  for (let n = 0; n < 5; n += 1) assert.equal(visit('not-determined'), false);
  assert.equal(visit('denied'), false);
  assert.equal(visit('authorized'), false);
});

test('a recording that fails on its sound before it starts is retried once without sound', () => {
  const { afterRecordingFailure, isAudioFailure, SOUND_FALLBACK_NOTICE } = microphone;
  // What an audio source held by a call looks like from Vision Camera.
  const busy = 'ERROR_ENCODING_FAILED';
  assert.deepEqual(afterRecordingFailure(busy, { withAudio: true, retrying: null, started: false }), {
    kind: 'retry-without-sound',
    original: busy,
  });
  assert.equal(isAudioFailure('java.lang.SecurityException: RECORD_AUDIO not granted'), true);
  assert.equal(isAudioFailure('Audio source is busy'), true);
  // The retry failing too reports the first error, as a failure always did.
  assert.deepEqual(afterRecordingFailure('ERROR_SOURCE_INACTIVE', { withAudio: false, retrying: busy, started: false }), {
    kind: 'report',
    error: busy,
  });
  // Once only: the retry is itself without sound, so it cannot retry again.
  assert.equal(afterRecordingFailure(busy, { withAudio: false, retrying: null, started: false }).kind, 'report');
  assert.equal(SOUND_FALLBACK_NOTICE, 'Recorded without sound. The microphone was in use.');

  // The hook hands the camera, the clock and the filesystem to the flow, which
  // tests/capture-recording.test.cjs drives through both failure paths.
  const hook = read('src/capture/useCapture.ts');
  assert.match(hook, /createCaptureFlow\(\{/);
  assert.match(hook, /onAudioFailure: \(\) => onAudioFailureRef\.current\?\.\(\)/);
  assert.match(hook, /flow\.setOutput\(videoOutput, canDropSound\);/);
  // The screen drops sound for this visit only.
  const capture = read('app/capture.tsx');
  assert.match(capture, /const onAudioFailure = useCallback\(\(\) => setMicrophoneBusy\(true\), \[\]\);/);
  assert.match(capture, /useCapture\(videoOutput, \{ onFinished, withAudio: enableAudio, onAudioFailure \}\)/);
  assert.match(capture, /\{capture\.notice \? \(/);
});

test('a failure unrelated to sound is not retried', () => {
  const { afterRecordingFailure } = microphone;
  for (const error of [
    'ERROR_INSUFFICIENT_STORAGE',
    'ERROR_INVALID_OUTPUT_OPTIONS',
    'ERROR_NO_VALID_DATA',
    'ERROR_SOURCE_INACTIVE',
    'Active recording already in progress!',
    'Camera is not active',
  ]) {
    assert.deepEqual(afterRecordingFailure(error, { withAudio: true, retrying: null, started: false }), { kind: 'report', error }, error);
  }
  // Nor is any failure of a recording that had no sound to begin with.
  assert.equal(afterRecordingFailure('ERROR_ENCODING_FAILED', { withAudio: false, retrying: null, started: false }).kind, 'report');
});

test('a failure after the recording started is never retried, whatever it was', () => {
  const { afterRecordingFailure, RECORD_AGAIN, RECORD_AGAIN_WITHOUT_SOUND } = microphone;
  // By the time a mid-clip error arrives the delivery is over. A retry would
  // film the empty pitch afterwards, so the answer is always to record again.
  assert.deepEqual(afterRecordingFailure('ERROR_ENCODING_FAILED', { withAudio: true, retrying: null, started: true }), {
    kind: 'record-again',
    error: RECORD_AGAIN_WITHOUT_SOUND,
    dropSound: true,
  });
  assert.deepEqual(afterRecordingFailure('ERROR_INSUFFICIENT_STORAGE', { withAudio: true, retrying: null, started: true }), {
    kind: 'record-again',
    error: RECORD_AGAIN,
    dropSound: false,
  });
  // Even while a retry from an earlier, pre-start failure is running.
  assert.equal(afterRecordingFailure('ERROR_ENCODING_FAILED', { withAudio: false, retrying: 'x', started: true }).kind, 'record-again');
  for (const line of [RECORD_AGAIN, RECORD_AGAIN_WITHOUT_SOUND]) {
    assert.match(line, /Record the delivery again\./);
    assert.doesNotMatch(line, /—/);
  }
});

test('a fallback leaves the saved microphone setting alone', () => {
  const capture = read('app/capture.tsx');
  const hook = read('src/capture/useCapture.ts');
  // The only write of the flag is answering the offer.
  assert.equal(capture.match(/microphoneAsked: /g).length, 1);
  assert.match(capture, /updateSettings\(\{ microphoneAsked: true \}\);\s*setOfferingMicrophone\(false\);/);
  assert.doesNotMatch(hook, /updateSettings|microphoneAsked/);
  // The busy state is component state, gone on the next visit, and not a setting.
  assert.match(capture, /const \[microphoneBusy, setMicrophoneBusy\] = useState\(false\);/);
  assert.doesNotMatch(read('src/settings/settings.ts'), /busy/i);
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
  const onFinished = capture.slice(capture.indexOf('const onFinished'), capture.indexOf('const onAudioFailure'));
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
    microphone.SOUND_FALLBACK_NOTICE,
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
