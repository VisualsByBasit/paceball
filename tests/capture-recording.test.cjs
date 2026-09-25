require('./register.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  createCaptureFlow,
  MIN_RECORDING_MS,
  START_TIMEOUT_MS,
} = require('../src/capture/recording.ts');
const {
  RECORD_AGAIN,
  RECORD_AGAIN_WITHOUT_SOUND,
  SOUND_FALLBACK_NOTICE,
} = require('../src/capture/microphone.ts');

/**
 * The recording lifecycle, driven the way Vision Camera drives it on a phone:
 * startRecording resolves on CameraX's start event, a failure before that
 * rejects it, and a failure after it arrives through the error callback.
 */

const INFO = { frameCount: 180, durationMs: 3000, width: 1920, height: 1080, rotationDegrees: 90, captureFps: 60, derivedFps: 60 };

/** Lets every settled promise run its handlers. */
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

function camera() {
  const recorders = [];
  const output = (label) => ({
    label,
    async createRecorder() {
      const recorder = {
        output: label,
        filePath: `/data/cache/${label}-${recorders.length}.mp4`,
        stops: 0,
        cancels: 0,
        startRecording(onFinished, onError) {
          recorder.finish = onFinished;
          recorder.fail = onError;
          return new Promise((resolve, reject) => {
            recorder.started = resolve;
            recorder.refuse = reject;
          });
        },
        async stopRecording() {
          recorder.stops += 1;
        },
        async cancelRecording() {
          recorder.cancels += 1;
        },
      };
      recorders.push(recorder);
      return recorder;
    },
  });
  return { output, recorders };
}

function harness({ readInfo = async () => INFO } = {}) {
  const clock = { now: 1_000_000 };
  const seen = { discarded: [], finished: [], audioFailures: 0 };
  const flow = createCaptureFlow({
    now: () => clock.now,
    readInfo,
    discard: (path) => seen.discarded.push(path),
    onChange: () => {},
    onFinished: (result) => seen.finished.push(result.path),
    onAudioFailure: () => {
      seen.audioFailures += 1;
    },
  });
  return { flow, seen, clock };
}

test('a sound failure before the recording starts is retried once without sound', async () => {
  const cam = camera();
  const { flow, seen, clock } = harness();
  flow.setOutput(cam.output('sound'), true);
  flow.start();
  await flush();

  // The microphone is held by a call: CameraX refuses before its start event.
  cam.recorders[0].refuse(new Error('ERROR_ENCODING_FAILED'));
  await flush();
  assert.equal(seen.audioFailures, 1, 'the screen is asked for an output without sound');
  assert.equal(flow.snapshot.error, null, 'nothing was filmed, so nothing has gone wrong yet');
  assert.equal(flow.snapshot.status, 'recording');
  assert.equal(cam.recorders.length, 1, 'no retry until the output without sound is bound');

  flow.setOutput(cam.output('silent'), false);
  await flush();
  assert.equal(cam.recorders.length, 2);
  assert.equal(cam.recorders[1].output, 'silent');
  cam.recorders[1].started();
  await flush();
  assert.equal(flow.snapshot.notice, SOUND_FALLBACK_NOTICE);

  clock.now += MIN_RECORDING_MS;
  await flow.stop();
  cam.recorders[1].finish(cam.recorders[1].filePath);
  await flush();
  assert.deepEqual(seen.finished, [cam.recorders[1].filePath], 'the retry is the clip marked');
  assert.deepEqual(seen.discarded, []);
});

test('a retry that fails too reports what the first attempt failed on, and stops', async () => {
  const cam = camera();
  const { flow, seen } = harness();
  flow.setOutput(cam.output('sound'), true);
  flow.start();
  await flush();
  cam.recorders[0].refuse(new Error('ERROR_ENCODING_FAILED'));
  await flush();
  flow.setOutput(cam.output('silent'), false);
  await flush();
  cam.recorders[1].refuse(new Error('ERROR_SOURCE_INACTIVE'));
  await flush();

  assert.equal(flow.snapshot.status, 'idle');
  assert.equal(flow.snapshot.error, 'ERROR_ENCODING_FAILED');
  assert.equal(seen.audioFailures, 1, 'once only');
  flow.setOutput(cam.output('silent-again'), false);
  await flush();
  assert.equal(cam.recorders.length, 2, 'nothing starts on its own after the retry failed');
});

test('a sound failure after the recording started is never retried, and the clip is thrown away', async () => {
  const cam = camera();
  const { flow, seen, clock } = harness();
  flow.setOutput(cam.output('sound'), true);
  flow.start();
  await flush();
  cam.recorders[0].started();
  await flush();

  // Mid-delivery, the audio encoder dies.
  clock.now += 1500;
  cam.recorders[0].fail(new Error('ERROR_ENCODING_FAILED'));
  await flush();

  assert.deepEqual(seen.discarded, [cam.recorders[0].filePath], 'the partial file is deleted');
  assert.equal(flow.snapshot.status, 'idle');
  assert.equal(flow.snapshot.error, RECORD_AGAIN_WITHOUT_SOUND);
  assert.match(flow.snapshot.error, /Record the delivery again/);
  assert.equal(seen.audioFailures, 1, 'the next recording, started by hand, is video only');

  // The output without sound arrives, and still nothing records by itself:
  // anything filmed now would be the empty pitch after the delivery.
  flow.setOutput(cam.output('silent'), false);
  await flush();
  assert.equal(cam.recorders.length, 1);
  assert.deepEqual(seen.finished, []);

  // A late finish from the dead recorder is not handed on either.
  cam.recorders[0].finish(cam.recorders[0].filePath);
  await flush();
  assert.deepEqual(seen.finished, []);

  // Recording again is the user's choice, on the output without sound.
  flow.start();
  await flush();
  assert.equal(cam.recorders.length, 2);
  assert.equal(cam.recorders[1].output, 'silent');
  assert.equal(flow.snapshot.error, null);
  cam.recorders[1].started();
  await flush();
});

test('any other failure after the start is thrown away too, with sound left as it was', async () => {
  const cam = camera();
  const { flow, seen } = harness();
  flow.setOutput(cam.output('sound'), true);
  flow.start();
  await flush();
  cam.recorders[0].started();
  await flush();
  cam.recorders[0].fail(new Error('ERROR_INSUFFICIENT_STORAGE'));
  await flush();

  assert.deepEqual(seen.discarded, [cam.recorders[0].filePath]);
  assert.equal(flow.snapshot.error, RECORD_AGAIN);
  assert.equal(seen.audioFailures, 0, 'storage is not the microphone');
  assert.deepEqual(seen.finished, []);
});

test('a failure before the start that is not about sound is reported, not retried', async () => {
  const cam = camera();
  const { flow, seen } = harness();
  flow.setOutput(cam.output('sound'), true);
  flow.start();
  await flush();
  cam.recorders[0].refuse(new Error('ERROR_INSUFFICIENT_STORAGE'));
  await flush();
  assert.equal(flow.snapshot.status, 'idle');
  assert.equal(flow.snapshot.error, 'ERROR_INSUFFICIENT_STORAGE');
  assert.equal(seen.audioFailures, 0);
  assert.equal(cam.recorders.length, 1);
});

test('the three seconds count from the first frame, not from pressing record', async () => {
  const cam = camera();
  const { flow, clock } = harness();
  flow.setOutput(cam.output('silent'), false);
  flow.start();
  await flush();
  assert.equal(flow.snapshot.startedAt, null, 'no clock before the camera reports the start');

  // The camera takes most of a second to start.
  clock.now += 800;
  cam.recorders[0].started();
  await flush();
  assert.equal(flow.snapshot.startedAt, clock.now);

  clock.now += MIN_RECORDING_MS - 1;
  await flow.stop();
  assert.equal(cam.recorders[0].stops, 0, 'one millisecond short of three seconds of footage');
  clock.now += 1;
  await flow.stop();
  assert.equal(cam.recorders[0].stops, 1);
});

test('a camera that never reports the start is cancelled and says so', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const cam = camera();
  const { flow } = harness();
  flow.setOutput(cam.output('silent'), false);
  flow.start();
  await flush();
  t.mock.timers.tick(START_TIMEOUT_MS);
  await flush();
  assert.equal(flow.snapshot.status, 'idle');
  assert.match(flow.snapshot.error, /did not start recording/);
  assert.equal(cam.recorders[0].cancels, 1);
});

test('leaving Capture while the clip is read never opens Mark, and drops the clip', async () => {
  let release;
  const cam = camera();
  const { flow, seen, clock } = harness({
    readInfo: () => new Promise((resolve) => {
      release = () => resolve(INFO);
    }),
  });
  flow.setOutput(cam.output('silent'), false);
  flow.start();
  await flush();
  cam.recorders[0].started();
  await flush();
  clock.now += MIN_RECORDING_MS;
  await flow.stop();
  cam.recorders[0].finish(cam.recorders[0].filePath);
  await flush();
  assert.equal(flow.snapshot.status, 'processing');

  flow.dispose();
  release();
  await flush();
  assert.deepEqual(seen.finished, []);
  assert.deepEqual(seen.discarded, [cam.recorders[0].filePath]);
});

test('leaving mid-recording cancels it, and nothing is reported afterwards', async () => {
  const cam = camera();
  const { flow, seen } = harness();
  flow.setOutput(cam.output('silent'), false);
  flow.start();
  await flush();
  cam.recorders[0].started();
  await flush();
  flow.dispose();
  assert.equal(cam.recorders[0].cancels, 1, 'cancelling deletes the file natively');
  cam.recorders[0].finish(cam.recorders[0].filePath);
  await flush();
  assert.deepEqual(seen.finished, []);
});

test('a clip whose metadata cannot be read is thrown away and explained', async () => {
  const cam = camera();
  const { flow, seen, clock } = harness({ readInfo: async () => Promise.reject(new Error('timed out after 10s')) });
  flow.setOutput(cam.output('silent'), false);
  flow.start();
  await flush();
  cam.recorders[0].started();
  await flush();
  clock.now += MIN_RECORDING_MS;
  await flow.stop();
  cam.recorders[0].finish(cam.recorders[0].filePath);
  await flush();
  assert.equal(flow.snapshot.status, 'idle');
  assert.equal(flow.snapshot.error, 'Could not read the video: timed out after 10s');
  assert.deepEqual(seen.discarded, [cam.recorders[0].filePath]);
  assert.deepEqual(seen.finished, []);
});

test('the shutter cannot start a second recording over the first', async () => {
  const cam = camera();
  const { flow } = harness();
  flow.setOutput(cam.output('silent'), false);
  flow.start();
  flow.start();
  await flush();
  assert.equal(cam.recorders.length, 1);
  cam.recorders[0].refuse(new Error('ERROR_SOURCE_INACTIVE'));
  await flush();
});
