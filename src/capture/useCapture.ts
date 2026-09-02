import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraVideoOutput, Recorder } from 'react-native-vision-camera';
import FrameExtractor, {
  type VideoInfo,
} from '../../modules/frame-extractor/src/FrameExtractorModule';

/** Frame rate we ask the session for. fps is still read per-file, never assumed. */
export const CAPTURE_FPS = 60;

/** Under-expose to freeze the ball. Applied once the session is running. */
export const CAPTURE_EXPOSURE = -4;

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
  { onFinished }: UseCaptureOptions
) {
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
    setStatus('processing');
    try {
      const info = await withTimeout(
        FrameExtractor.getVideoInfo(path),
        VIDEO_INFO_TIMEOUT_MS,
        `timed out after ${VIDEO_INFO_TIMEOUT_MS / 1000}s`
      );
      console.log('VIDEO INFO', info);
      setStatus('idle');
      onFinishedRef.current({ path, info });
    } catch (e) {
      setStatus('idle');
      setError(`Could not read the video: ${message(e)}`);
    }
  }, []);

  const handleRecordingError = useCallback((e: Error) => {
    recorderRef.current = null;
    setStatus('idle');
    setError(message(e));
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    setError(null);
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
    } catch (e) {
      recorderRef.current = null;
      setStatus('idle');
      setError(message(e));
    }
  }, [videoOutput, handleRecordingFinished, handleRecordingError]);

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
    start,
    stop,
  };
}
