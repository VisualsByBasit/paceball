import { NativeModule, requireNativeModule } from 'expo';

export type VideoInfo = {
  frameCount: number;
  durationMs: number;
  width: number;
  height: number;
  rotationDegrees: number;
  captureFps: number;
  derivedFps: number;
};

export type NativeVideoExportRequest = {
  exportId: string;
  inputPath: string;
  outputPath: string;
  clipStartMs: number;
  clipEndMs: number;
  includeAudio: boolean;
  watermark: boolean;
  /** Encoded MP4 dimensions, before display rotation. */
  sourceWidth: number;
  sourceHeight: number;
  sourceRotationDegrees: number;
  /** Dimensions of the capped, display-oriented frame where marks were made. */
  coordinateWidth: number;
  coordinateHeight: number;
  calAX: number;
  calAY: number;
  calBX: number;
  calBY: number;
  releaseX: number;
  releaseY: number;
  bounceX: number;
  bounceY: number;
  releaseAtMs: number;
  bounceAtMs: number;
  speedKmh: number;
  errorKmh: number;
};

export type NativeVideoExportResult = {
  outputPath: string;
  outputBytes: number;
  elapsedMs: number;
  canvasWidth: number;
  canvasHeight: number;
  sourceRotationDegrees: number;
  coordinateMode: 'display-oriented' | 'inverse-rotation-90' | 'inverse-rotation-270';
};

type FrameExtractorEvents = {
  onVideoExportProgress(event: { exportId: string; progress: number }): void;
};

declare class FrameExtractorModule extends NativeModule<FrameExtractorEvents> {
  getVideoInfo(path: string): Promise<VideoInfo>;
  /**
   * Writes `count` frames from `startIndex` into `outDir` as JPEGs and returns
   * their `file://` paths in index order.
   *
   * May resolve with FEWER paths than requested — the frame count reported by the
   * container routinely over-runs what the decoder will produce, so a short list
   * means the video ended there. An empty list means nothing decoded at all.
   *
   * `maxWidth` caps the long edge before encoding. Pass 0 for full resolution.
   */
  extractFrames(
    path: string,
    startIndex: number,
    count: number,
    outDir: string,
    maxWidth: number
  ): Promise<string[]>;
  /** Media3 Transformer spike: trims and burns the marked HUD into a private MP4. */
  exportVideo(request: NativeVideoExportRequest): Promise<NativeVideoExportResult>;
  cancelVideoExport(exportId: string): Promise<boolean>;
}

export default requireNativeModule<FrameExtractorModule>('FrameExtractor');
