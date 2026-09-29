import type { Point, Session } from '../types';

export const EXPORT_WIDTH = 1080;
export const EXPORT_HEIGHT = 1350;

/**
 * The share card, in its own pixels. The card is 1080 across, about 2.6 px for
 * every dp of a phone screen, so each text size is its app token times 2.6: the
 * speed is `type.reading` (40 dp), the range and name sit near `type.h2`.
 */
export const CARD = {
  pad: 64,
  /** Between one block of text and the next. */
  gap: 28,
  text: {
    wordmark: 30,
    speed: 104,
    strip: 34,
    range: 44,
    method: 30,
    name: 36,
    mark: 24,
    cautionLabel: 22,
    caution: 26,
    date: 30,
    foot: 26,
  },
  /** The free card's watermark: full width and opaque, between the speed and its range. */
  strip: { height: 72 },
  /** Line pitch for wrapped caution text. */
  cautionLine: 36,
  cautionLabelLine: 32,
  /** Between two cautions, and between the last one and the date. */
  cautionGap: 20,
  /** Space left under the release frame before whatever follows it. */
  photoGap: 60,
  /** The caption under the frame when the reference was marked on another one. */
  captionLine: 36,
  /** Marks on the frame. */
  mark: { ring: 12, dot: 7, dotGap: 28, dotRadius: 4, cross: 10, stroke: 4, plate: 8 },
} as const;

/** Roughly where a line's capitals start, measured up from its baseline. */
const capHeight = (size: number) => Math.round(size * 0.74);

export type CardLayout = {
  wordmarkBaseline: number;
  speedBaseline: number;
  /** Absent on a Pro card, and everything under it moves up to close the gap. */
  strip: { top: number; height: number; baseline: number } | null;
  rangeBaseline: number;
  methodBaseline: number;
  nameBaseline: number | null;
  photo: { x: number; y: number; width: number; height: number };
  captionBaseline: number | null;
  cautionTop: number;
  dateBaseline: number;
  footBaseline: number;
};

/**
 * Where everything on the card goes. The top block flows down from the
 * wordmark, the date and the method note sit on the bottom edge, cautions stack
 * above them, and the release frame takes the space in between.
 */
export function cardLayout(options: {
  watermark: boolean;
  hasName: boolean;
  /** Lines of wrapped text in each caution, in order. */
  cautionLines: number[];
  hasCaption: boolean;
}): CardLayout {
  const { pad, gap, text } = CARD;
  const wordmarkBaseline = pad + capHeight(text.wordmark);
  const speedBaseline = wordmarkBaseline + 36 + capHeight(text.speed);
  let y = speedBaseline + gap;
  let strip: CardLayout['strip'] = null;
  if (options.watermark) {
    const height = CARD.strip.height;
    strip = { top: y, height, baseline: y + Math.round((height + capHeight(text.strip)) / 2) };
    y += height + gap;
  }
  const rangeBaseline = y + capHeight(text.range);
  const methodBaseline = rangeBaseline + 48;
  const nameBaseline = options.hasName ? methodBaseline + 52 : null;
  const photoTop = (nameBaseline ?? methodBaseline) + 40;

  const footBaseline = EXPORT_HEIGHT - pad;
  const dateBaseline = footBaseline - 44;
  const bottomTop = dateBaseline - capHeight(text.date);
  const cautions = options.cautionLines.reduce(
    (sum, lines) => sum + CARD.cautionLabelLine + lines * CARD.cautionLine + CARD.cautionGap, 0,
  );
  const cautionTop = bottomTop - cautions - (cautions > 0 ? CARD.cautionGap : 0);
  const caption = options.hasCaption ? CARD.captionLine : 0;
  const photoBottom = cautionTop - CARD.photoGap - caption;
  const photo = { x: pad, y: photoTop, width: EXPORT_WIDTH - pad * 2, height: photoBottom - photoTop };
  return {
    wordmarkBaseline,
    speedBaseline,
    strip,
    rangeBaseline,
    methodBaseline,
    nameBaseline,
    photo,
    captionBaseline: options.hasCaption ? photoBottom + CARD.captionLine - 8 : null,
    cautionTop,
    dateBaseline,
    footBaseline,
  };
}

/** The frame's box on a free card with a player name and nothing to caution. */
export const PHOTO = cardLayout({ watermark: true, hasName: true, cautionLines: [], hasCaption: false }).photo;

type Box = { x: number; y: number; width: number; height: number };

/** Fit the whole decoded frame; transform from the session's coordinate space. */
export function exportGeometry(session: Session, imageWidth: number, imageHeight: number, box: Box = PHOTO) {
  if (![imageWidth, imageHeight, session.width, session.height].every(
    (value) => Number.isFinite(value) && value > 0,
  )) throw new Error('Cannot export an image with invalid dimensions.');
  // A rotation mismatch needs correcting at capture, not stretching an overlay.
  const aspectError = Math.abs(imageWidth / imageHeight / (session.width / session.height) - 1);
  if (aspectError > 0.01) throw new Error('Saved frame orientation does not match this delivery.');
  const k = Math.min(box.width / imageWidth, box.height / imageHeight);
  const width = imageWidth * k;
  const height = imageHeight * k;
  const rect = { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
  const point = (p: Point) => ({
    x: rect.x + (p.x / session.width) * width,
    y: rect.y + (p.y / session.height) * height,
  });
  return {
    rect,
    release: point(session.release),
    bounce: point(session.bounce),
    calA: point(session.calA),
    calB: point(session.calB),
  };
}

export function frameFileName(frame: number): string {
  if (!Number.isInteger(frame) || frame < 0) throw new Error('Invalid export frame.');
  return `frame_${String(frame).padStart(5, '0')}.jpg`;
}
