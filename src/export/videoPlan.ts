import type { Point, Session } from '../types';
import { isSession } from '../data/validation';
import { measurementState } from '../physics/measurementState';

/** Share only the delivery, with a little context before and after its marks. */
export const VIDEO_CONTEXT_MS = 1_000;

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
 * The native encoder can consume this plan without knowing about MMKV or the
 * measurement model. The points are in the capped, display-oriented marking
 * frame, while `source` describes the original MP4. Keeping both lets native
 * code scale and rotate the marks instead of treating 1280-space as 4K-space.
 * A later detected trajectory can be added as another overlay layer; this one
 * deliberately contains only the four points the user marked.
 */
export type VideoExportPlan = {
  inputVideoPath: string;
  source: SourceVideoMetadata;
  clipStartMs: number;
  clipEndMs: number;
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
    /** Milliseconds in the trimmed output, used for the count-up animation. */
    releaseAtMs: number;
    bounceAtMs: number;
    speedKmh: number;
    errorKmh: number;
    speedLabel: 'AVG SPEED TO BOUNCE';
    pathLabel: 'MARK-TO-MARK GUIDE · NOT A TRACKED BALL PATH';
  };
};

/**
 * Pure preparation for Media3. `source` must come from the original MP4's
 * metadata, not frameCount or the capped JPEG extraction dimensions.
 */
export function planVideoExport(
  session: Session,
  source: SourceVideoMetadata,
  options: VideoExportOptions,
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

  // The marks are frame indices; the clip is padded enough to tolerate their
  // approximate frame/fps mapping. Device verification must check the alignment.
  const releaseMs = session.release.frame / session.fps * 1_000;
  const bounceMs = session.bounce.frame / session.fps * 1_000;
  if (!Number.isFinite(releaseMs) || !Number.isFinite(bounceMs) ||
      bounceMs > source.durationMs || releaseMs >= source.durationMs) {
    throw new Error('Saved marks fall outside the source video.');
  }
  const clipStartMs = Math.max(0, Math.floor(releaseMs - VIDEO_CONTEXT_MS));
  const clipEndMs = Math.min(source.durationMs, Math.ceil(bounceMs + VIDEO_CONTEXT_MS));
  if (clipEndMs <= clipStartMs) throw new Error('Saved marks cannot form a video clip.');

  return {
    inputVideoPath: session.videoPath,
    source: { ...source },
    clipStartMs,
    clipEndMs,
    includeAudio: options.includeAudio ?? false,
    watermark: !options.isPro,
    overlay: {
      kind: 'mark-to-mark',
      width: session.width,
      height: session.height,
      calibrationA: { ...session.calA },
      calibrationB: { ...session.calB },
      release: { ...session.release },
      bounce: { ...session.bounce },
      releaseAtMs: releaseMs - clipStartMs,
      bounceAtMs: bounceMs - clipStartMs,
      speedKmh: reading.speedKmh,
      errorKmh: reading.errorKmh,
      speedLabel: 'AVG SPEED TO BOUNCE',
      pathLabel: 'MARK-TO-MARK GUIDE · NOT A TRACKED BALL PATH',
    },
  };
}
