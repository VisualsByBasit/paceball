import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraVideoOutput, Recorder } from 'react-native-vision-camera';
import FrameExtractor, {
  type VideoInfo,
} from '../../modules/frame-extractor/src/FrameExtractorModule';
import { afterRecordingFailure, SOUND_FALLBACK_NOTICE } from './microphone';

/** Frame rate we ask the session for. fps is still read per-file, never assumed. */
export const CAPTURE_FPS = 60;

/** Shorter clips give unreliable fps, so stop is locked until this has passed. */
export const MIN_RECORDING_MS = 3000;

/** A native read that never settles would strand the screen on "Reading the clip...". */
const VIDEO_INFO_TIMEOUT_MS = 10000;

export type CaptureStatus = 'idle' | 'recording' | 'processing';

export type CaptureResult = {
  path: string;
  info: VideoInfo;
};

type UseCaptureOptions = {
  /** Called once the file is written and its VideoInfo has been read. */
  onFinished: (result: CaptureResult) => void;
  /** Whether `videoOutput` records sound. */
  withAudio?: boolean;
  /**
   * Called when a recording with sound failed on its sound. The screen swaps
   * in an output without sound, and the recording is retried on it once.
   */
  onAudioFailure?: () => void;
};

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Rejects if `promise` has not settled in `ms`. The original promise is left to its fate. */
function withTimeout<T>(promise: Promise<T>, ms: number, reason: string): Promise<T> {
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

export function useCapture(
  videoOutput: CameraVideoOutput,
  { onFinished, withAudio = false, onAudioFailure }: UseCaptureOptions
) {
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * The error a recording with sound failed on, while its retry without sound
   * is pending or running. If the retry fails too, this is what is reported.
   */
  const originalErrorRef = useRef<string | null>(null);
  const withAudioRef = useRef(withAudio);
  const onAudioFailureRef = useRef(onAudioFailure);
  useEffect(() => {
    withAudioRef.current = withAudio;
    onAudioFailureRef.current = onAudioFailure;
  }, [withAudio, onAudioFailure]);

  const recorderRef = useRef<Recorder | null>(null);
  const startedAtRef = useRef(0);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (status !== 'recording') return;
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 50);
    return () => clearInterval(id);
  }, [status]);

  // A recorder that outlives the screen would keep writing to a file nobody owns.
  useEffect(() => {
    return () => {
      recorderRef.current?.cancelRecording().catch(() => {});
      recorderRef.current = null;
    };
  }, []);

  const handleRecordingFinished = useCallback(async (path: string) => {
    recorderRef.current = null;
    originalErrorRef.current = null;
    setStatus('processing');
    try {
      const info = await withTimeout(
        FrameExtractor.getVideoInfo(path),
        VIDEO_INFO_TIMEOUT_MS,
        `timed out after ${VIDEO_INFO_TIMEOUT_MS / 1000}s`
      );
      setStatus('idle');
      onFinishedRef.current({ path, info });
    } catch (e) {
      setStatus('idle');
      setError(`Could not read the video: ${message(e)}`);
    }
  }, []);

  /**
   * One place for a recording that failed to start or failed while running.
   * A failure on the sound track is retried once without sound; anything else,
   * or a retry that fails too, is reported, the original error first.
   */
  const fail = useCallback((e: unknown) => {
    recorderRef.current = null;
    const outcome = afterRecordingFailure(message(e), {
      withAudio: withAudioRef.current && onAudioFailureRef.current !== undefined,
      retrying: originalErrorRef.current,
    });
    if (outcome.kind === 'retry-without-sound') {
      // Still 'recording' to the screen: the retry starts as soon as the
      // output without sound replaces this one.
      originalErrorRef.current = outcome.original;
      onAudioFailureRef.current?.();
      return;
    }
    originalErrorRef.current = null;
    setNotice(null);
    setStatus('idle');
    setError(outcome.error);
  }, []);

  const handleRecordingError = useCallback((e: Error) => fail(e), [fail]);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    const retrying = originalErrorRef.current !== null;
    setError(null);
    if (!retrying) setNotice(null);
    setElapsedMs(0);
    // Provisional — the timer effect starts on this flip and would otherwise read a stale ref.
    startedAtRef.current = Date.now();
    setStatus('recording');
    try {
      // One Recorder per recording — a Recorder can only record once.
      const recorder = await videoOutput.createRecorder({});
      recorderRef.current = recorder;
      // The clock starts when frames do, so the 3 s floor is 3 s of footage.
      startedAtRef.current = Date.now();
      await recorder.startRecording(handleRecordingFinished, handleRecordingError);
      if (retrying) setNotice(SOUND_FALLBACK_NOTICE);
    } catch (e) {
      fail(e);
    }
  }, [videoOutput, handleRecordingFinished, handleRecordingError, fail]);

  // The retry: once the output without sound is in place, record again on it.
  // CameraX holds a recording started before its output is bound until it is.
  useEffect(() => {
    if (originalErrorRef.current === null || withAudio || recorderRef.current) return;
    void start();
  }, [videoOutput, withAudio, start]);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (Date.now() - startedAtRef.current < MIN_RECORDING_MS) return;
    try {
      await recorder.stopRecording();
    } catch (e) {
      setError(message(e));
    }
  }, []);

  const remainingMs = Math.max(0, MIN_RECORDING_MS - elapsedMs);

  return {
    status,
    isRecording: status === 'recording',
    isProcessing: status === 'processing',
    elapsedMs,
    /** Milliseconds left before stop unlocks. 0 once the minimum is met. */
    remainingMs,
    canStop: status === 'recording' && remainingMs === 0,
    error,
    clearError: useCallback(() => setError(null), []),
    /** Said once a recording has fallen back to video only. Not an error. */
    notice,
    clearNotice: useCallback(() => setNotice(null), []),
    start,
    stop,
  };
}
