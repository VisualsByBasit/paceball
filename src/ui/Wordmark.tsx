import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { wordmarkWidth } from './wordmarkPaths';

const WORDMARK_IMAGE = require('../../assets/brand/wordmark.png');

/**
 * The PACEBALL wordmark, the logo's own letters in white and lime, at a given
 * height. Read out as the name; never set in a system font.
 */
export function Wordmark({ height, style }: { height: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={WORDMARK_IMAGE}
      style={[{ height, width: wordmarkWidth(height) }, style]}
      resizeMode="contain"
      accessible
      accessibilityRole="image"
      accessibilityLabel="Paceball"
      accessibilityIgnoresInvertColors
    />
  );
}
