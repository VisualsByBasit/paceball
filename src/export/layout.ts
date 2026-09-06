import type { Point, Session } from '../types';

export const EXPORT_WIDTH = 1080;
export const EXPORT_HEIGHT = 1200;
export const PHOTO = { x: 48, y: 200, width: 984, height: 660 };

/** Fit the whole decoded frame; transform from the session's coordinate space. */
export function exportGeometry(session: Session, imageWidth: number, imageHeight: number) {
  if (![imageWidth, imageHeight, session.width, session.height].every(
    (value) => Number.isFinite(value) && value > 0,
  )) throw new Error('Cannot export an image with invalid dimensions.');
  // A rotation mismatch needs correcting at capture, not stretching an overlay.
  const aspectError = Math.abs(imageWidth / imageHeight / (session.width / session.height) - 1);
  if (aspectError > 0.01) throw new Error('Saved frame orientation does not match this delivery.');
  const k = Math.min(PHOTO.width / imageWidth, PHOTO.height / imageHeight);
  const width = imageWidth * k;
  const height = imageHeight * k;
  const rect = { x: PHOTO.x + (PHOTO.width - width) / 2, y: PHOTO.y + (PHOTO.height - height) / 2, width, height };
  const point = (p: Point) => ({
    x: rect.x + (p.x / session.width) * width,
    y: rect.y + (p.y / session.height) * height,
  });
  return { rect, release: point(session.release), bounce: point(session.bounce) };
}

export function frameFileName(frame: number): string {
  if (!Number.isInteger(frame) || frame < 0) throw new Error('Invalid export frame.');
  return `frame_${String(frame).padStart(5, '0')}.jpg`;
}
