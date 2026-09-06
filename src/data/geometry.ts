import type { Point } from '../types';

/** The decoder may rotate frames. Preserve its orientation and scale all pixels together. */
export function restoredGeometry(imageWidth: number, imageHeight: number, videoWidth: number, videoHeight: number) {
  const factor = Math.max(videoWidth, videoHeight) / Math.max(imageWidth, imageHeight);
  const width = Math.ceil(imageWidth * factor);
  const height = Math.ceil(imageHeight * factor);
  return {
    factor, width, height,
    scale: (p: Point): Point => ({
      x: Math.min(width - 1, Math.max(0, p.x * factor)),
      y: Math.min(height - 1, Math.max(0, p.y * factor)),
      frame: p.frame,
    }),
  };
}
