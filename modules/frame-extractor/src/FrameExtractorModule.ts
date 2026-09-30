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
  /** Scale the output to this short side, keeping its aspect; 0 keeps the source size. */
  outputShortSide: number;
  includeAudio: boolean;
  /** When true the HUD must draw the band; native refuses a free export without its words and wordmark. */
  watermark: boolean;
  /** Encoded MP4 dimensions, before display rotation. */
  sourceWidth: number;
  sourceHeight: number;
  sourceRotationDegrees: number;
  /** Full-resolution display-oriented space used by the saved session points. */
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
  /** Reference marks throughout the clip, or not at all. */
  showReferences: boolean;
  referenceALabel: string;
  referenceBLabel: string;
  /** Draw the bounce hollow, as Mark and Result draw a bounce that was hard to see. */
  bounceUncertain: boolean;
  /** Milliseconds into the trimmed output: release mark from here. */
  releaseAtMs: number;
  /** Bounce mark, connector and path label from here. */
  bounceAtMs: number;
  /** Half a frame, so each mark lands on its own frame. */
  frameToleranceMs: number;
  speedKmh: number;
  errorKmh: number;
  /** The HUD's words, written in TypeScript so native never formats a reading. */
  speedText: string;
  rangeText: string;
  methodText: string;
  pathText: string;
  /** "FREE", drawn in lime after the wordmark in the free band; empty for Pro. */
  bandText: string;
  /**
   * The PACEBALL wordmark's traced paths and their box (src/ui/wordmarkPaths.ts):
   * absolute M, L, Q and Z, which native draws in the band. Empty for Pro.
   */
  wordmarkWhite: string;
  wordmarkLime: string;
  wordmarkWidth: number;
  wordmarkHeight: number;
  /** App tokens, as #RRGGBB. */
  colorBg: string;
  colorText: string;
  colorMuted: string;
  colorAccent: string;
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
  /**
   * When each frame index plays, in milliseconds, read from the video track's
   * sample times in presentation order. -1 for an index past the last frame.
   */
  getFrameTimesMs(path: string, frames: number[]): Promise<number[]>;
  /** Media3 Transformer: trims, scales and burns the marked HUD into a private MP4. */
  exportVideo(request: NativeVideoExportRequest): Promise<NativeVideoExportResult>;
  cancelVideoExport(exportId: string): Promise<boolean>;
}

export default requireNativeModule<FrameExtractorModule>('FrameExtractor');
