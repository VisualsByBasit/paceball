import type { SkCanvas, SkFont, SkImage, Skia } from '@shopify/react-native-skia';
import type { Session } from '../types';
import { exportGeometry, EXPORT_WIDTH, EXPORT_HEIGHT, PHOTO } from './layout';

type Palette = { bg: string; surface: string; text: string; muted: string; accent: string };

/** Shared by the phone renderer and the real CanvasKit rendering test. */
export function drawCard(
  skia: typeof Skia, canvas: SkCanvas, photo: SkImage, session: Session,
  watermark: boolean, font: (size: number) => SkFont, colors: Palette,
) {
  const geometry = exportGeometry(session, photo.width(), photo.height());
  const paint = skia.Paint();
  try {
    paint.setAntiAlias(true);
    const fill = (color: string) => { paint.setColor(skia.Color(color)); return paint; };
    const text = (value: string, x: number, y: number, size: number, color = colors.text) =>
      canvas.drawText(value, x, y, fill(color), font(size));
    canvas.drawRect(skia.XYWHRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT), fill(colors.bg));
    text('AVG SPEED TO BOUNCE', 48, 65, 25, colors.muted);
    text(`${session.speedKmh.toFixed(1)} km/h`, 48, 154, 72, colors.accent);
    text(`± ${session.errorKmh} km/h`, 720, 148, 32);
    canvas.drawRect(PHOTO, fill(colors.surface));
    canvas.drawImageRect(photo, skia.XYWHRect(0, 0, photo.width(), photo.height()), geometry.rect, paint);
    const { release, bounce } = geometry;
    paint.setStrokeWidth(4);
    canvas.drawLine(release.x, release.y, bounce.x, bounce.y, fill(colors.accent));
    for (const p of [release, bounce]) {
      canvas.drawCircle(p.x, p.y, 9, fill(colors.bg));
      canvas.drawCircle(p.x, p.y, 5, fill(colors.accent));
    }
    text('Release-to-bounce marks · not a tracked flight path', 48, 905, 23, colors.muted);
    text(`${session.travelMetres.toFixed(2)} m  ·  ${session.fps.toFixed(2)} fps`, 48, 964, 30);
    text(`Calibration: ${session.calibrationMethod} · ${session.calRealMetres.toFixed(3)} m`, 48, 1014, 25, colors.muted);
    text('Release frame shown. Speed and uncertainty from the saved reading.', 48, 1064, 22, colors.muted);
    if (watermark) text('PACEBALL', 48, 1150, 40, colors.accent);
  } finally {
    paint.dispose();
  }
}
