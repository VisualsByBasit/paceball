import { useWindowDimensions } from 'react-native';

/**
 * The system font scale from which layouts give text the room: sticky footers
 * move into the page, side-by-side columns stack. A ratio of the user's own
 * text size, not a size the tokens could name.
 */
export const LARGE_TEXT_SCALE = 1.3;

/** Whether the user's text size is large enough that layouts should stack. */
export function useLargeText(): boolean {
  return useWindowDimensions().fontScale >= LARGE_TEXT_SCALE;
}
