import type { VideoInfo } from '../../modules/frame-extractor/src/FrameExtractorModule';
import { afterRecordingFailure, SOUND_FALLBACK_NOTICE } from './microphone';

/** Shorter clips give unreliable fps, so stop is locked until this has passed. */
export const MIN_RECORDING_MS = 3000;

/**
 * A camera that never reports the recording as started would leave the shutter
 * locked with nothing being filmed.
 */
export const START_TIMEOUT_MS = 10000;

export type CaptureStatus = 'idle' | 'recording' | 'processing';

export type CaptureResult = {
  path: string;
  info: VideoInfo;
};

/** The slice of a Vision Camera Recorder the flow uses. */
export type RecorderLike = {
  readonly filePath: string;
  startRecording(onFinished: (path: string) => void, onError: (error: Error) => void): Promise<void>;
  stopRecording(): Promise<void>;
  cancelRecording(): Promise<void>;
};

/** The slice of a Vision Camera video output the flow uses. */
export type OutputLike = {
  createRecorder(settings: Record<string, never>): Promise<RecorderLike>;
};

export type CaptureSnapshot = {
  status: CaptureStatus;
  /**
   * When frames started arriving, from the recorder's start event. Null until
   * then, so the three seconds are three seconds of footage and not of set-up.
   */
  startedAt: number | null;
  error: string | null;
  /** Said once a recording has fallen back to video only. Not an error. */
  notice: string | null;
};

export type CaptureFlowOptions = {
  now: () => number;
  /** Reads the finished file. Should reject rather than hang. */
  readInfo: (path: string) => Promise<VideoInfo>;
  /** Removes a recording that will never reach marking. Must not throw. */
  discard: (path: string) => void;
  onChange: (snapshot: CaptureSnapshot) => void;
  /** A finished, readable clip. Never called once the flow is disposed. */
  onFinished: (result: CaptureResult) => void;
  /** Asks the screen for an output without sound. */
  onAudioFailure: () => void;
};

export type CaptureFlow = {
  /**
   * The output to record on, and whether it records sound that could be
   * dropped. A retry waiting for an output without sound starts here.
   */
  setOutput: (output: OutputLike, withAudio: boolean) => void;
  start: () => void;
  stop: () => Promise<void>;
  clearError: () => void;
  clearNotice: () => void;
  /** The screen is going. Any recording is cancelled and nothing is reported. */
  dispose: () => void;
  readonly snapshot: CaptureSnapshot;
};

export const IDLE: CaptureSnapshot = { status: 'idle', startedAt: null, error: null, notice: null };

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Rejects if `promise` has not settled in `ms`. The original promise is left to its fate. */
export function withTimeout<T>(promise: Promise<T>, ms: number, reason: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(reason)), ms);
    promise.then(
      (value) => {
        clearTimeout(id);
        resolve(value);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      }
    );
  });
}

/**
 * One recording at a time, from the shutter to a readable file.
 *
 * Plain rather than a hook, so every path through it can be driven in a test
 * without a phone: the camera, the clock and the filesystem are all passed in.
 */
export function createCaptureFlow(options: CaptureFlowOptions): CaptureFlow {
  let snapshot = IDLE;
  let output: OutputLike | null = null;
  let withAudio = false;
  let recorder: RecorderLike | null = null;
  let started = false;
  /**
   * The error a recording with sound failed on before it started, while its
   * retry without sound is pending or running. Reported if the retry fails too.
   */
  let retryingAfter: string | null = null;
  let disposed = false;

  const set = (patch: Partial<CaptureSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    if (!disposed) options.onChange(snapshot);
  };

  const cancel = (target: RecorderLike) => {
    target.cancelRecording().catch(() => {});
  };

  /** Before the start event: nothing was filmed, so sound may be dropped and retried. */
  const failBeforeStart = (e: unknown) => {
    recorder = null;
    started = false;
    const outcome = afterRecordingFailure(message(e), {
      withAudio,
      retrying: retryingAfter,
      started: false,
    });
    if (outcome.kind === 'retry-without-sound') {
      // Still 'recording' to the screen: the retry starts as soon as the output
      // without sound replaces this one.
      retryingAfter = outcome.original;
      options.onAudioFailure();
      return;
    }
    retryingAfter = null;
    set({ status: 'idle', startedAt: null, notice: null, error: outcome.error });
  };

  /**
   * After the start event: the delivery was being filmed and is over by now.
   * The partial file goes, nothing is retried, and the user records again.
   */
  const failMidClip = (target: RecorderLike, e: unknown) => {
    if (recorder !== target) return;
    recorder = null;
    started = false;
    retryingAfter = null;
    const outcome = afterRecordingFailure(message(e), { withAudio, retrying: null, started: true });
    // CameraX has usually finalised the file by the time the error arrives, in
    // which case the cancel is refused and only the discard does anything.
    cancel(target);
    options.discard(target.filePath);
    if (outcome.kind === 'record-again' && outcome.dropSound) options.onAudioFailure();
    set({
      status: 'idle',
      startedAt: null,
      notice: null,
      error: outcome.kind === 'retry-without-sound' ? outcome.original : outcome.error,
    });
  };

  const finished = async (target: RecorderLike, path: string) => {
    if (recorder !== target) return;
    recorder = null;
    started = false;
    retryingAfter = null;
    if (disposed) {
      options.discard(path);
      return;
    }
    set({ status: 'processing' });
    let info: VideoInfo;
    try {
      info = await options.readInfo(path);
    } catch (e) {
      // A clip whose metadata cannot be read cannot be marked either.
      options.discard(path);
      set({ status: 'idle', startedAt: null, error: `Could not read the video: ${message(e)}` });
      return;
    }
    if (disposed) {
      // The user left while it was being read. Nothing opens Mark behind them.
      options.discard(path);
      return;
    }
    set({ status: 'idle', startedAt: null });
    options.onFinished({ path, info });
  };

  const begin = async (retrying: boolean) => {
    const target = output;
    if (!target || disposed) return;
    set({ status: 'recording', startedAt: null, error: null, notice: retrying ? snapshot.notice : null });

    let created: RecorderLike;
    try {
      // One Recorder per recording: a Recorder can only record once.
      created = await target.createRecorder({});
    } catch (e) {
      failBeforeStart(e);
      return;
    }
    if (disposed) return;
    recorder = created;

    try {
      // Resolves on CameraX's start event. Anything that fails before it
      // rejects here; anything after it arrives through the error callback.
      await withTimeout(
        created.startRecording(
          (path) => void finished(created, path),
          (e) => failMidClip(created, e)
        ),
        START_TIMEOUT_MS,
        `The camera did not start recording within ${START_TIMEOUT_MS / 1000}s.`
      );
    } catch (e) {
      if (recorder !== created) return;
      cancel(created);
      failBeforeStart(e);
      return;
    }
    if (disposed) {
      cancel(created);
      return;
    }
    if (recorder !== created) return;
    started = true;
    // The clock starts when frames do, so the floor is three seconds of footage.
    set({ startedAt: options.now(), notice: retrying ? SOUND_FALLBACK_NOTICE : snapshot.notice });
  };

  return {
    setOutput(next, audio) {
      output = next;
      withAudio = audio;
      // The retry: once the output without sound is in place, record again on
      // it. CameraX holds a recording started before its output is bound until
      // it is.
      if (retryingAfter !== null && !audio && !recorder && !disposed) void begin(true);
    },
    start() {
      if (snapshot.status !== 'idle' || recorder || disposed) return;
      void begin(false);
    },
    async stop() {
      const target = recorder;
      if (!target || !started || snapshot.startedAt === null) return;
      if (options.now() - snapshot.startedAt < MIN_RECORDING_MS) return;
      try {
        await target.stopRecording();
      } catch (e) {
        set({ error: message(e) });
      }
    },
    clearError() {
      set({ error: null });
    },
    clearNotice() {
      set({ notice: null });
    },
    dispose() {
      disposed = true;
      const target = recorder;
      recorder = null;
      // Cancelling deletes the file, and a recorder that outlived the screen
      // would keep writing to a file nobody owns.
      if (target) cancel(target);
    },
    get snapshot() {
      return snapshot;
    },
  };
}
