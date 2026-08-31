import { registerWebModule, NativeModule } from 'expo';

// FrameExtractorModule is not available on the web platform.
class FrameExtractorModule extends NativeModule<{}> {}

export default registerWebModule(FrameExtractorModule, 'FrameExtractorModule');
