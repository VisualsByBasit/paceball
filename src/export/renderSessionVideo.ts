import { Directory, File, Paths } from 'expo-file-system';
import FrameExtractor, {
  type NativeVideoExportRequest,
  type NativeVideoExportResult,
} from '../../modules/frame-extractor/src/FrameExtractorModule';
import type { Session } from '../types';
import { colors } from '../ui/tokens';
import { planVideoExport, type VideoExportOptions } from './videoPlan';

export type VideoExportResult = NativeVideoExportResult & {
  inputBytes: number;
  clipDurationMs: number;
};

export type VideoExportTask = {
  exportId: string;
  result: Promise<VideoExportResult>;
  cancel: () => Promise<boolean>;
  onProgress: (listener: (progress: number) => void) => { remove: () => void };
};

function privateSource(uri: string): File {
  const file = new File(uri);
  const relative = Paths.relative(Paths.document, file);
  if (!uri.startsWith('file://') || !relative || relative === '..' ||
    relative.startsWith('../') || relative.startsWith('..\\') || Paths.isAbsolute(relative)) {
    throw new Error('Video export requires a recording in permanent app storage.');
  }
  if (!file.exists || file.size <= 0) throw new Error('The saved recording is missing or empty.');
  return file;
}

/** Whether an export ended because it was cancelled, rather than because it failed. */
export function isCancelledExport(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    (error as { code?: unknown }).code === 'E_VIDEO_EXPORT_CANCELLED';
}

/**
 * Starts the native Media3 export while keeping the session and measurement
 * model in TypeScript. The source recording is only ever read.
 */
export function createSessionVideoExport(
  session: Session,
  options: VideoExportOptions,
): VideoExportTask {
  const exportId = `video-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const directory = new Directory(Paths.cache, 'paceball-video-exports');
  directory.create({ intermediates: true, idempotent: true });
  const output = new File(directory, `${exportId}.mp4`);

  const result = (async (): Promise<VideoExportResult> => {
    const input = privateSource(session.videoPath);
    try {
      const info = await FrameExtractor.getVideoInfo(input.uri);
      // When the marked frames really play, from the track's own sample times.
      const [releaseMs, bounceMs] = await FrameExtractor.getFrameTimesMs(
        input.uri, [session.release.frame, session.bounce.frame],
      );
      const plan = planVideoExport(session, {
        durationMs: info.durationMs,
        width: info.width,
        height: info.height,
        rotationDegrees: info.rotationDegrees,
      }, options, { releaseMs, bounceMs });
      const { overlay } = plan;
      const request: NativeVideoExportRequest = {
        exportId,
        inputPath: plan.inputVideoPath,
        outputPath: output.uri,
        clipStartMs: plan.clipStartMs,
        clipEndMs: plan.clipEndMs,
        outputShortSide: plan.outputShortSide,
        includeAudio: plan.includeAudio,
        watermark: plan.watermark,
        sourceWidth: plan.source.width,
        sourceHeight: plan.source.height,
        sourceRotationDegrees: plan.source.rotationDegrees,
        coordinateWidth: overlay.width,
        coordinateHeight: overlay.height,
        calAX: overlay.calibrationA.x,
        calAY: overlay.calibrationA.y,
        calBX: overlay.calibrationB.x,
        calBY: overlay.calibrationB.y,
        releaseX: overlay.release.x,
        releaseY: overlay.release.y,
        bounceX: overlay.bounce.x,
        bounceY: overlay.bounce.y,
        showReferences: overlay.showReferences,
        referenceALabel: overlay.referenceLabels[0],
        referenceBLabel: overlay.referenceLabels[1],
        bounceUncertain: overlay.bounceUncertain,
        releaseAtMs: overlay.releaseAtMs,
        bounceAtMs: overlay.bounceAtMs,
        frameToleranceMs: overlay.frameToleranceMs,
        speedKmh: overlay.speedKmh,
        errorKmh: overlay.errorKmh,
        speedText: overlay.speedText,
        rangeText: overlay.rangeText,
        methodText: overlay.methodText,
        pathText: overlay.pathLabel,
        stripText: overlay.stripText ?? '',
        colorBg: colors.bg,
        colorText: colors.text,
        colorMuted: colors.muted,
        colorAccent: colors.accent,
      };
      const native = await FrameExtractor.exportVideo(request);
      const artifact = new File(native.outputPath);
      if (!artifact.exists || artifact.size <= 0) {
        throw new Error('Media3 returned an empty video export.');
      }
      return {
        ...native,
        outputBytes: artifact.size,
        inputBytes: input.size,
        clipDurationMs: plan.clipEndMs - plan.clipStartMs,
      };
    } catch (error) {
      if (output.exists) output.delete();
      throw error;
    }
  })();

  return {
    exportId,
    result,
    cancel: () => FrameExtractor.cancelVideoExport(exportId),
    onProgress(listener) {
      return FrameExtractor.addListener('onVideoExportProgress', (event) => {
        if (event.exportId === exportId) listener(event.progress);
      });
    },
  };
}

export async function renderSessionVideo(
  session: Session,
  options: VideoExportOptions,
): Promise<VideoExportResult> {
  return createSessionVideoExport(session, options).result;
}
