import type { SkCanvas, SkFont, SkImage, Skia } from '@shopify/react-native-skia';
import type { Session } from '../types';
import { measurementState } from '../physics/measurementState';
import { CALIBRATION_SPECS, travelWarning } from '../physics/calibration';
import { referenceFraming, spanBetween } from '../capture/framing';
import { CARD, cardLayout, exportGeometry, EXPORT_WIDTH, EXPORT_HEIGHT } from './layout';

type Palette = { bg: string; surface: string; text: string; muted: string; accent: string; warn: string };
type FontFor = (size: number, bold?: boolean) => SkFont;

export const CARD_WORDMARK = 'Paceball';
export const CARD_STRIP = 'PACEBALL · FREE';
export const CARD_METHOD = 'Average speed, release to bounce';
export const CARD_PATH_LABEL = 'Marked, not tracked';
export const CARD_FOOT = 'Estimated from marked distance and frame timing.';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** "29 September 2026", in the phone's own time zone. */
export function cardDate(createdAt: number): string {
  const date = new Date(createdAt);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * The cautions the reading carries, worded as Result words them, so the card
 * never travels without the doubt the app showed beside the same number.
 */
export function cardCautions(session: Session): string[] {
  const cautions: string[] = [];
  const warning = travelWarning(session.travelMetres, session.calRealMetres, session.calibrationMethod);
  if (warning) cautions.push(warning.message);
  // A fraction of the frame, so the same in video pixels as in marking pixels.
  const framing = referenceFraming(spanBetween(session.calA, session.calB), session.width);
  if (framing && !framing.tight && CALIBRATION_SPECS[session.calibrationMethod].rulerBoundsTravel) {
    cautions.push(`Your reference filled about ${Math.round(framing.fraction * 100)}% of the frame. The scale comes from that one distance, so a reference this small in frame can read low by more than the range above allows for. Stand so both ends sit near the edges next time.`);
  }
  return cautions;
}

/** Width of a line of text, measured from the font where it can be. */
function measure(font: SkFont | null, value: string, size: number): number {
  if (font && typeof font.getGlyphWidths === 'function') {
    return font.getGlyphWidths(font.getGlyphIDs(value)).reduce((sum, w) => sum + w, 0);
  }
  // Only a stand-in font gets here. Generous, so wrapped lines never overrun.
  return value.length * size * 0.56;
}

/** Greedy word wrap to `width`. A single word longer than the line gets a line to itself. */
export function wrapText(value: string, width: number, widthOf: (line: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && widthOf(next) > width) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Cut a line to fit, marking the cut. */
function fitLine(value: string, width: number, widthOf: (line: string) => number): string {
  if (widthOf(value) <= width) return value;
  let cut = value;
  while (cut.length > 1 && widthOf(`${cut}...`) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

/**
 * Shared by the phone renderer and the real CanvasKit rendering test.
 *
 * Top: the wordmark, the speed, its range, what it is and whose it is. Middle:
 * the release frame with the marks the reading came from. Bottom: any caution,
 * the date and how it was estimated. A free card puts its watermark between the
 * speed and its range, so cropping the mark off cuts the reading in half.
 */
export function drawCard(
  skia: typeof Skia, canvas: SkCanvas, photo: SkImage, session: Session,
  watermark: boolean, font: FontFor, colors: Palette,
  details: { playerName?: string | null } = {},
) {
  // Speed from the saved reading; range recomputed from its marks.
  const reading = measurementState(session);
  if (reading.kind !== 'measured') {
    throw new Error('This delivery has no measured speed to export.');
  }
  const { speedKmh, errorKmh } = reading;
  const spec = CALIBRATION_SPECS[session.calibrationMethod];
  const { pad, text: size } = CARD;
  const contentWidth = EXPORT_WIDTH - pad * 2;
  const widthAt = (px: number, bold = false) => (value: string) => measure(font(px, bold), value, px);

  const cautionIndent = 20;
  const cautions = cardCautions(session).map((message) =>
    wrapText(message, contentWidth - cautionIndent, widthAt(size.caution)));
  const refsOnFrame = !spec.sameFrame ||
    (session.calA.frame === session.release.frame && session.calB.frame === session.release.frame);
  const caption = refsOnFrame ? null : `${spec.short} reference marked on frame ${session.calA.frame}`;
  const name = details.playerName?.trim() || null;
  const layout = cardLayout({
    watermark, hasName: name !== null, cautionLines: cautions.map((lines) => lines.length), hasCaption: caption !== null,
  });
  const geometry = exportGeometry(session, photo.width(), photo.height(), layout.photo);

  const paint = skia.Paint();
  try {
    paint.setAntiAlias(true);
    const fill = (color: string) => { paint.setColor(skia.Color(color)); return paint; };
    const text = (value: string, x: number, y: number, px: number, color = colors.text, bold = false) =>
      canvas.drawText(value, x, y, fill(color), font(px, bold));
    const rect = (x: number, y: number, width: number, height: number, color: string) =>
      canvas.drawRect(skia.XYWHRect(x, y, width, height), fill(color));
    const line = (x1: number, y1: number, x2: number, y2: number, color: string) => {
      paint.setStrokeWidth(CARD.mark.stroke);
      canvas.drawLine(x1, y1, x2, y2, fill(color));
    };

    rect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT, colors.bg);

    // Top: the reading, and nothing between the speed and its range but the watermark.
    text(CARD_WORDMARK, pad, layout.wordmarkBaseline, size.wordmark, colors.text, true);
    text(`${speedKmh.toFixed(1)} km/h`, pad, layout.speedBaseline, size.speed, colors.accent, true);
    if (layout.strip) {
      rect(0, layout.strip.top, EXPORT_WIDTH, layout.strip.height, colors.text);
      const stripWidth = widthAt(size.strip, true)(CARD_STRIP);
      text(CARD_STRIP, (EXPORT_WIDTH - stripWidth) / 2, layout.strip.baseline, size.strip, colors.bg, true);
    }
    text(`± ${errorKmh} km/h`, pad, layout.rangeBaseline, size.range);
    text(CARD_METHOD, pad, layout.methodBaseline, size.method, colors.muted);
    if (name && layout.nameBaseline !== null) {
      text(fitLine(name, contentWidth, widthAt(size.name)), pad, layout.nameBaseline, size.name);
    }

    // Middle: the release frame and the marks the reading came from.
    const { rect: frame, release, bounce, calA, calB } = geometry;
    rect(frame.x, frame.y, frame.width, frame.height, colors.surface);
    canvas.drawImageRect(photo, skia.XYWHRect(0, 0, photo.width(), photo.height()),
      skia.XYWHRect(frame.x, frame.y, frame.width, frame.height), paint);

    // Straight, because the ball was marked at two points and nowhere between.
    const { mark } = CARD;
    const span = Math.hypot(bounce.x - release.x, bounce.y - release.y);
    const dots = Math.max(2, Math.floor(span / mark.dotGap));
    for (let i = 1; i < dots; i++) {
      const t = i / dots;
      canvas.drawCircle(release.x + (bounce.x - release.x) * t, release.y + (bounce.y - release.y) * t,
        mark.dotRadius, fill(colors.accent));
    }

    const references = refsOnFrame
      ? [{ at: calA, label: spec.a.short }, { at: calB, label: spec.b.short }]
      : [];
    for (const { at } of references) {
      canvas.drawCircle(at.x, at.y, mark.ring, fill(colors.bg));
      line(at.x - mark.cross, at.y, at.x + mark.cross, at.y, colors.text);
      line(at.x, at.y - mark.cross, at.x, at.y + mark.cross, colors.text);
    }
    canvas.drawCircle(release.x, release.y, mark.ring, fill(colors.bg));
    canvas.drawCircle(release.x, release.y, mark.dot, fill(colors.accent));
    canvas.drawCircle(bounce.x, bounce.y, mark.ring, fill(colors.bg));
    if (session.markConfidence === 'uncertain') {
      // Hollow, as Mark and Result draw a bounce that was hard to see.
      const r = mark.dot + 2;
      line(bounce.x, bounce.y - r, bounce.x + r, bounce.y, colors.accent);
      line(bounce.x + r, bounce.y, bounce.x, bounce.y + r, colors.accent);
      line(bounce.x, bounce.y + r, bounce.x - r, bounce.y, colors.accent);
      line(bounce.x - r, bounce.y, bounce.x, bounce.y - r, colors.accent);
    } else {
      canvas.drawCircle(bounce.x, bounce.y, mark.dot, fill(colors.accent));
    }

    // Labels on opaque plates, so they read over any frame, kept inside it.
    const plate = (value: string, x: number, y: number) => {
      const width = widthAt(size.mark)(value) + mark.plate * 2;
      const height = size.mark + mark.plate * 2;
      const left = Math.min(Math.max(x, frame.x), frame.x + frame.width - width);
      const top = Math.min(Math.max(y, frame.y), frame.y + frame.height - height);
      rect(left, top, width, height, colors.bg);
      text(value, left + mark.plate, top + mark.plate + Math.round(size.mark * 0.8), size.mark);
    };
    const labelAt = (value: string, p: { x: number; y: number }) => {
      const height = size.mark + mark.plate * 2;
      const above = p.y - mark.ring - 6 - height;
      const width = widthAt(size.mark)(value) + mark.plate * 2;
      plate(value, p.x - width / 2, above >= frame.y ? above : p.y + mark.ring + 6);
    };
    for (const { at, label } of references) labelAt(label, at);
    labelAt('Release', release);
    labelAt('Bounce', bounce);
    // Always on: the marks are the user's, not something the app found.
    plate(CARD_PATH_LABEL, frame.x + 12, frame.y + 12);
    if (caption && layout.captionBaseline !== null) {
      text(caption, pad, layout.captionBaseline, size.mark, colors.muted);
    }

    // Bottom: the doubts first, with the word as well as the colour, then when and how.
    let y = layout.cautionTop;
    for (const lines of cautions) {
      const height = CARD.cautionLabelLine + lines.length * CARD.cautionLine;
      rect(pad, y, 4, height - 8, colors.warn);
      text('Caution', pad + cautionIndent, y + size.cautionLabel, size.cautionLabel, colors.warn, true);
      lines.forEach((value, i) => text(value, pad + cautionIndent,
        y + CARD.cautionLabelLine + (i + 1) * CARD.cautionLine - 10, size.caution));
      y += height + CARD.cautionGap;
    }
    text(cardDate(session.createdAt), pad, layout.dateBaseline, size.date);
    text(CARD_FOOT, pad, layout.footBaseline, size.foot, colors.muted);
  } finally {
    paint.dispose();
  }
}
