import { Directory, File, Paths } from 'expo-file-system';
import FrameExtractor, {
  type NativeVideoExportRequest,
  type NativeVideoExportResult,
} from '../../modules/frame-extractor/src/FrameExtractorModule';
import type { Session } from '../types';
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

/**
 * Starts the native Media3 spike while keeping the session/measurement model in
 * TypeScript. Nothing here changes the existing PNG renderer.
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
      const plan = planVideoExport(session, {
        durationMs: info.durationMs,
        width: info.width,
        height: info.height,
        rotationDegrees: info.rotationDegrees,
      }, options);
      const request: NativeVideoExportRequest = {
        exportId,
        inputPath: plan.inputVideoPath,
        outputPath: output.uri,
        clipStartMs: plan.clipStartMs,
        clipEndMs: plan.clipEndMs,
        includeAudio: plan.includeAudio,
        watermark: plan.watermark,
        sourceWidth: plan.source.width,
        sourceHeight: plan.source.height,
        sourceRotationDegrees: plan.source.rotationDegrees,
        coordinateWidth: plan.overlay.width,
        coordinateHeight: plan.overlay.height,
        calAX: plan.overlay.calibrationA.x,
        calAY: plan.overlay.calibrationA.y,
        calBX: plan.overlay.calibrationB.x,
        calBY: plan.overlay.calibrationB.y,
        releaseX: plan.overlay.release.x,
        releaseY: plan.overlay.release.y,
        bounceX: plan.overlay.bounce.x,
        bounceY: plan.overlay.bounce.y,
        releaseAtMs: Math.round(plan.overlay.releaseAtMs),
        bounceAtMs: Math.round(plan.overlay.bounceAtMs),
        speedKmh: plan.overlay.speedKmh,
        errorKmh: plan.overlay.errorKmh,
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
