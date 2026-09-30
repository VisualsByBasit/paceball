import type { Point, Session } from '../types';
import { isSession } from '../data/validation';
import { measurementState } from '../physics/measurementState';
import { CALIBRATION_SPECS } from '../physics/calibration';

/** Share only the delivery: a little before release, a little after the bounce. */
export const VIDEO_BEFORE_RELEASE_MS = 500;
export const VIDEO_AFTER_BOUNCE_MS = 750;
/** The shared clip's longest edge. Larger sources are scaled down, smaller ones never up. */
export const VIDEO_MAX_EDGE = 1080;
/**
 * How far the verified frame times may sit from frame / fps before the plan
 * refuses them. Well over any jitter in a steady recording, well under a mark
 * landing on the wrong frame altogether.
 */
export const VIDEO_TIMING_TOLERANCE_MS = 250;

/**
 * A free clip's band across the picture, as the free card carries it: the
 * wordmark, drawn from its traced paths, then FREE in lime.
 */
export const VIDEO_BAND = ['PACEBALL', 'FREE'] as const;
export const VIDEO_METHOD = 'Average speed, release to bounce';
export const VIDEO_PATH_LABEL = 'Marked, not tracked';

export type VideoExportOptions = {
  /** Read from the current Pro entitlement at export time, never from the record. */
  isPro: boolean;
  /** Explicit user choice. Omitted means the shared file has no audio track. */
  includeAudio?: boolean;
};

export type SourceVideoMetadata = {
  durationMs: number;
  /** Encoded MP4 dimensions, before any display rotation is applied. */
  width: number;
  height: number;
  rotationDegrees: number;
};

/**
 * When the release and bounce frames really sit in the MP4, read from the
 * video track's own sample times rather than worked out from the frame rate.
 */
export type VerifiedFrameTiming = { releaseMs: number; bounceMs: number };

/**
 * The native encoder can consume this plan without knowing about MMKV or the
 * measurement model. Saved points have already been restored from the capped
 * marking JPEG into full-resolution, display-oriented video coordinates.
 * `source` separately describes the MP4's encoded dimensions and rotation, so
 * native code can map that display space onto Media3's actual canvas.
 * The overlay contains only the four points the user marked, and the times
 * from which each may be drawn.
 */
export type VideoExportPlan = {
  inputVideoPath: string;
  source: SourceVideoMetadata;
  clipStartMs: number;
  clipEndMs: number;
  /**
   * The output's short side when the source must be scaled down to keep its
   * long side at VIDEO_MAX_EDGE, or 0 to keep the source's size.
   */
  outputShortSide: number;
  includeAudio: boolean;
  watermark: boolean;
  overlay: {
    kind: 'mark-to-mark';
    width: number;
    height: number;
    calibrationA: Point;
    calibrationB: Point;
    release: Point;
    bounce: Point;
    /** Stumps and markers lie along the pitch in every frame; a ball or a bowler does not. */
    showReferences: boolean;
    referenceLabels: [string, string];
    bounceUncertain: boolean;
    /** Milliseconds into the trimmed clip: the release mark appears here. */
    releaseAtMs: number;
    /** And the bounce mark, the connector and the path label here. */
    bounceAtMs: number;
    /** Half a frame, so a mark lands on its own frame despite rounding. */
    frameToleranceMs: number;
    speedKmh: number;
    errorKmh: number;
    speedText: string;
    rangeText: string;
    methodText: typeof VIDEO_METHOD;
    pathLabel: typeof VIDEO_PATH_LABEL;
    /** The band's word after the wordmark on a free clip; null for Pro, which is clean. */
    bandText: (typeof VIDEO_BAND)[1] | null;
  };
};

/** The clip's short side after capping its long side, or 0 to leave it alone. */
export function outputShortSide(source: SourceVideoMetadata): number {
  const long = Math.max(source.width, source.height);
  const short = Math.min(source.width, source.height);
  if (long <= VIDEO_MAX_EDGE) return 0;
  // Even, as encoders need, and never past the cap once the long side follows.
  const scaled = Math.floor((short * VIDEO_MAX_EDGE) / long / 2) * 2;
  return Math.max(2, scaled);
}

/**
 * Pure preparation for Media3. `source` must come from the original MP4's
 * metadata, not frameCount or the capped JPEG extraction dimensions, and
 * `timing` from the video track's sample times.
 */
export function planVideoExport(
  session: Session,
  source: SourceVideoMetadata,
  options: VideoExportOptions,
  timing: VerifiedFrameTiming,
): VideoExportPlan {
  if (!isSession(session)) throw new Error('Cannot export an invalid saved delivery.');
  const reading = measurementState(session);
  if (reading.kind !== 'measured') {
    throw new Error('This delivery has no measured speed to export.');
  }
  if (!Number.isSafeInteger(source?.durationMs) || source.durationMs <= 0 ||
      !Number.isSafeInteger(source.width) || source.width <= 0 ||
      !Number.isSafeInteger(source.height) || source.height <= 0 ||
      !Number.isSafeInteger(source.rotationDegrees) ||
      ![0, 90, 180, 270].includes(source.rotationDegrees)) {
    throw new Error('Cannot export a video without valid source metadata.');
  }
  if (typeof options?.isPro !== 'boolean' ||
      (options.includeAudio !== undefined && typeof options.includeAudio !== 'boolean')) {
    throw new Error('Invalid video export options.');
  }

  const { releaseMs, bounceMs } = timing ?? {};
  if (typeof releaseMs !== 'number' || typeof bounceMs !== 'number' ||
      !Number.isFinite(releaseMs) || !Number.isFinite(bounceMs) || releaseMs < 0 || bounceMs <= releaseMs) {
    throw new Error('Could not verify when the marked frames play in the video.');
  }
  // The marks are frame indices. The sample times must agree with them, or the
  // HUD would put a mark on a frame the user never marked.
  const estimate = (frame: number) => (frame / session.fps) * 1_000;
  if (Math.abs(releaseMs - estimate(session.release.frame)) > VIDEO_TIMING_TOLERANCE_MS ||
      Math.abs(bounceMs - estimate(session.bounce.frame)) > VIDEO_TIMING_TOLERANCE_MS) {
    throw new Error('The marked frames do not line up with the video. Export an image instead.');
  }
  if (bounceMs > source.durationMs || releaseMs >= source.durationMs) {
    throw new Error('Saved marks fall outside the source video.');
  }
  const clipStartMs = Math.max(0, Math.floor(releaseMs - VIDEO_BEFORE_RELEASE_MS));
  const clipEndMs = Math.min(source.durationMs, Math.ceil(bounceMs + VIDEO_AFTER_BOUNCE_MS));
  if (clipEndMs <= clipStartMs) throw new Error('Saved marks cannot form a video clip.');

  const spec = CALIBRATION_SPECS[session.calibrationMethod];
  const watermark = !options.isPro;
  return {
    inputVideoPath: session.videoPath,
    source: { ...source },
    clipStartMs,
    clipEndMs,
    outputShortSide: outputShortSide(source),
    includeAudio: options.includeAudio ?? false,
    watermark,
    overlay: {
      kind: 'mark-to-mark',
      width: session.width,
      height: session.height,
      calibrationA: { ...session.calA },
      calibrationB: { ...session.calB },
      release: { ...session.release },
      bounce: { ...session.bounce },
      showReferences: !spec.sameFrame,
      referenceLabels: [spec.a.short, spec.b.short],
      bounceUncertain: session.markConfidence === 'uncertain',
      releaseAtMs: releaseMs - clipStartMs,
      bounceAtMs: bounceMs - clipStartMs,
      frameToleranceMs: 500 / session.fps,
      speedKmh: reading.speedKmh,
      errorKmh: reading.errorKmh,
      // Written as the share card writes them.
      speedText: `${reading.speedKmh.toFixed(1)} km/h`,
      rangeText: `± ${reading.errorKmh} km/h`,
      methodText: VIDEO_METHOD,
      pathLabel: VIDEO_PATH_LABEL,
      bandText: watermark ? VIDEO_BAND[1] : null,
    },
  };
}
