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
  extractFrames(
    path: string,
    startIndex: number,
    count: number,
    outDir: string
  ): Promise<string[]>;
}

export default requireNativeModule<FrameExtractorModule>('FrameExtractor');