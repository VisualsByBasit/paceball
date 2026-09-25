import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraVideoOutput } from 'react-native-vision-camera';
import { File } from 'expo-file-system';
import FrameExtractor from '../../modules/frame-extractor/src/FrameExtractorModule';
import {
  createCaptureFlow,
  IDLE,
  MIN_RECORDING_MS,
  withTimeout,
  type CaptureFlow,
  type CaptureResult,
  type CaptureSnapshot,
} from './recording';

export { MIN_RECORDING_MS, type CaptureResult, type CaptureStatus } from './recording';

/** Frame rate we ask the session for. fps is still read per-file, never assumed. */
export const CAPTURE_FPS = 60;

/** A native read that never settles would strand the screen on "Reading the clip...". */
const VIDEO_INFO_TIMEOUT_MS = 10000;

type UseCaptureOptions = {
  /** Called once the file is written and its VideoInfo has been read. */
  onFinished: (result: CaptureResult) => void;
  /** Whether `videoOutput` records sound. */
  withAudio?: boolean;
  /**
   * Called when a recording with sound failed on its sound. The screen swaps
   * in an output without sound. A failure before the recording started is
   * retried on it once; a failure after that is not, and the user records again.
   */
  onAudioFailure?: () => void;
};

/** Deletes a recording nobody will mark. A file that is already gone is fine. */
function discardRecording(path: string): void {
  try {
    const file = new File(path.startsWith('file://') ? path : `file://${path}`);
    if (file.exists) file.delete();
  } catch {
    // The cache is the OS's to clear in the end; a failed delete is not worth a crash.
  }
}

export function useCapture(
  videoOutput: CameraVideoOutput,
  { onFinished, withAudio = false, onAudioFailure }: UseCaptureOptions
) {
  const [snapshot, setSnapshot] = useState<CaptureSnapshot>(IDLE);
  const [elapsedMs, setElapsedMs] = useState(0);

  const onFinishedRef = useRef(onFinished);
  const onAudioFailureRef = useRef(onAudioFailure);
  useEffect(() => {
    onFinishedRef.current = onFinished;
    onAudioFailureRef.current = onAudioFailure;
  }, [onFinished, onAudioFailure]);

  const [flow] = useState<CaptureFlow>(() =>
    createCaptureFlow({
      now: Date.now,
      readInfo: (path) =>
        withTimeout(
          FrameExtractor.getVideoInfo(path),
          VIDEO_INFO_TIMEOUT_MS,
          `timed out after ${VIDEO_INFO_TIMEOUT_MS / 1000}s`
        ),
      discard: discardRecording,
      onChange: setSnapshot,
      onFinished: (result) => onFinishedRef.current(result),
      onAudioFailure: () => onAudioFailureRef.current?.(),
    })
  );

  // Sound can only be dropped where the screen can swap in an output without it.
  const canDropSound = withAudio && onAudioFailure !== undefined;
  useEffect(() => {
    flow.setOutput(videoOutput, canDropSound);
  }, [flow, videoOutput, canDropSound]);

  // A recorder that outlives the screen would keep writing to a file nobody owns.
  useEffect(() => () => flow.dispose(), [flow]);

  const { status, startedAt } = snapshot;
  useEffect(() => {
    if (status !== 'recording') {
      setElapsedMs(0);
      return;
    }
    const id = setInterval(() => {
      setElapsedMs(startedAt === null ? 0 : Date.now() - startedAt);
    }, 50);
    return () => clearInterval(id);
  }, [status, startedAt]);

  const remainingMs = Math.max(0, MIN_RECORDING_MS - elapsedMs);

  return {
    status,
    isRecording: status === 'recording',
    isProcessing: status === 'processing',
    elapsedMs,
    /** Milliseconds left before stop unlocks. 0 once the minimum is met. */
    remainingMs,
    canStop: status === 'recording' && startedAt !== null && remainingMs === 0,
    error: snapshot.error,
    clearError: useCallback(() => flow.clearError(), [flow]),
    /** Said once a recording has fallen back to video only. Not an error. */
    notice: snapshot.notice,
    clearNotice: useCallback(() => flow.clearNotice(), [flow]),
    start: useCallback(() => flow.start(), [flow]),
    stop: useCallback(() => flow.stop(), [flow]),
  };
}
