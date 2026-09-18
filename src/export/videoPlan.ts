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

/**
 * The native encoder can consume this plan without knowing about MMKV or the
 * measurement model. Coordinates are stored video pixels, not 1280-cap JPEG
 * pixels. A later detected trajectory can be added as another overlay layer;
 * this one deliberately contains only the four points the user marked.
 */
export type VideoExportPlan = {
  inputVideoPath: string;
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
    speedKmh: number;
    errorKmh: number;
    speedLabel: 'AVG SPEED TO BOUNCE';
    pathLabel: 'MARK-TO-MARK GUIDE · NOT A TRACKED BALL PATH';
  };
};

/**
 * Pure preparation only. Media3 will trim and encode the original MP4 after
 * Basit approves native build timing. `sourceDurationMs` must come from that
 * MP4's metadata, not frameCount or the JPEG extraction hint.
 */
export function planVideoExport(
  session: Session,
  sourceDurationMs: number,
  options: VideoExportOptions,
): VideoExportPlan {
  if (!isSession(session)) throw new Error('Cannot export an invalid saved delivery.');
  const reading = measurementState(session);
  if (reading.kind !== 'measured') {
    throw new Error('This delivery has no measured speed to export.');
  }
  if (!Number.isSafeInteger(sourceDurationMs) || sourceDurationMs <= 0) {
    throw new Error('Cannot export a video without a valid source duration.');
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
      bounceMs > sourceDurationMs || releaseMs >= sourceDurationMs) {
    throw new Error('Saved marks fall outside the source video.');
  }
  const clipStartMs = Math.max(0, Math.floor(releaseMs - VIDEO_CONTEXT_MS));
  const clipEndMs = Math.min(sourceDurationMs, Math.ceil(bounceMs + VIDEO_CONTEXT_MS));
  if (clipEndMs <= clipStartMs) throw new Error('Saved marks cannot form a video clip.');

  return {
    inputVideoPath: session.videoPath,
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
      speedKmh: reading.speedKmh,
      errorKmh: reading.errorKmh,
      speedLabel: 'AVG SPEED TO BOUNCE',
      pathLabel: 'MARK-TO-MARK GUIDE · NOT A TRACKED BALL PATH',
    },
  };
}
