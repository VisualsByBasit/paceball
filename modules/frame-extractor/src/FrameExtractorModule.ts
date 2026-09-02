import { NativeModule, requireNativeModule } from 'expo';

export type VideoInfo = {
  frameCount: number;
  durationMs: number;
  width: number;
  height: number;
  captureFps: number;
  derivedFps: number;
};

declare class FrameExtractorModule extends NativeModule<{}> {
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
}

export default requireNativeModule<FrameExtractorModule>('FrameExtractor');
