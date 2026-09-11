import { matchFont, type SkFont } from '@shopify/react-native-skia';

// Covers the card's fixed captions, calibration labels, numbers and symbols.
// Do not silently save a blank card when Android cannot resolve a typeface.
const REQUIRED_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .:/-±·';

export function createExportFont(size: number): SkFont {
  const font = matchFont({ fontFamily: 'sans-serif', fontSize: size });
  try {
    const glyphs = font.getGlyphIDs(REQUIRED_GLYPHS);
    // getGlyphWidths is available on both native Skia and CanvasKit; this
    // installed Skia version does not implement measureText on the web backend.
    const width = font.getGlyphWidths(glyphs).reduce((sum, value) => sum + value, 0);
    if (glyphs.length !== REQUIRED_GLYPHS.length || glyphs.some((id) => id === 0) ||
        !Number.isFinite(width) || width <= 0) {
      throw new Error('The export font cannot render the required text.');
    }
    return font;
  } catch (error) {
    font.dispose();
    throw error;
  }
}
