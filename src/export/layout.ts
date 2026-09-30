import type { Point, Session } from '../types';

export const EXPORT_WIDTH = 1080;
export const EXPORT_HEIGHT = 1350;

type Box = { x: number; y: number; width: number; height: number };

/**
 * The share card, in its own pixels, drawn natively at 1080 x 1350. Laid out
 * after docs/design/share-card/*-reference.png: a lime-edged rounded card
 * holding a header, the marked frame, the reading, the date and, on a free
 * card, the upgrade bar.
 */
export const CARD = {
  /** The card itself, centred on the export. */
  width: 820,
  radius: 48,
  border: 4,
  /** The soft lime glow around the border, as a blur sigma. */
  glow: 16,
  /** The inner dark panel, inside the border. */
  innerInset: 9,
  innerRadius: 40,
  /** From the card's edge to the panels inside it, and between panels. */
  inset: 16,
  gap: 14,
  /** The wordmark's height is its traced letters' height, drawn from paths. */
  header: { height: 118, icon: 88, wordmark: 46, pill: { width: 184, height: 64 } },
  frame: { radius: 28, border: 3, min: 360 },
  reading: { radius: 28, pad: 28, border: 2 },
  footer: { height: 96, radius: 24 },
  upgrade: { height: 86, radius: 26, border: 3 },
  /** The free card and the Pro card, whole, top to bottom. */
  heightFree: 1272,
  heightPro: 1172,
  text: {
    pill: 40,
    label: 32,
    speed: 104,
    range: 44,
    check: 24,
    method: 29,
    name: 36,
    mark: 24,
    caution: 24,
    date: 34,
    foot: 26,
    upgrade: 34,
    band: 58,
  },
  /** Reading panel: baselines, each from the one above it. */
  lines: { label: 52, speed: 91, range: 56, check: 52, method: 44, name: 46, bottom: 26 },
  check: { height: 40, pad: 14 },
  caution: { pad: 16, labelLine: 30, line: 32 },
  /** The diagonal band on a free card's frame. */
  band: { angle: -30, thickness: 96, margin: 10 },
  /** Marks on the frame, exactly as they have always been drawn. */
  mark: { ring: 12, dot: 7, dotGap: 28, dotRadius: 4, cross: 10, stroke: 4, plate: 8 },
  /** How far inside the frame every mark is kept when the frame is cropped to fill. */
  markMargin: 32,
} as const;

/** Roughly where a line's capitals start, measured up from its baseline. */
export const capHeight = (size: number) => Math.round(size * 0.74);

export type ShareCardLayout = {
  card: Box;
  header: Box;
  icon: Box;
  pill: Box;
  frame: Box;
  reading: Box & {
    labelBaseline: number;
    speedBaseline: number;
    rangeBaseline: number;
    /** The "Check this reading" chip's top, when the reading is implausible. */
    checkTop: number | null;
    methodBaseline: number;
    nameBaseline: number | null;
  };
  /** One box per caution the reading carries, under the reading. */
  cautions: Box[];
  footer: Box & { dateBaseline: number; footBaseline: number };
  /** Free cards only. */
  upgrade: Box | null;
};

/**
 * Where everything on the card goes. The card is a fixed height for each
 * variant and centred; the frame takes whatever the panels around it leave,
 * so a name, a caution or the implausible chip shortens the photo, never the
 * reading.
 */
export function shareCardLayout(options: {
  pro: boolean;
  hasName: boolean;
  implausible: boolean;
  /** Height of each caution box, in order. */
  cautionHeights: number[];
}): ShareCardLayout {
  const { inset, gap, lines } = CARD;
  const readingHeight =
    lines.label + lines.speed + lines.range + (options.implausible ? lines.check : 0) + lines.method +
    (options.hasName ? lines.name : 0) + lines.bottom;
  // Everything but the frame, top to bottom.
  const fixed = inset + CARD.header.height + gap / 2 + gap + readingHeight +
    options.cautionHeights.reduce((sum, h) => sum + gap + h, 0) +
    gap + CARD.footer.height + (options.pro ? 0 : gap + CARD.upgrade.height) + inset;
  // The card keeps its height, and grows (never past the export) only when
  // cautions would squeeze the frame under its least.
  const base = options.pro ? CARD.heightPro : CARD.heightFree;
  const height = Math.min(Math.max(base, fixed + CARD.frame.min), EXPORT_HEIGHT - inset * 2);
  const card = { x: (EXPORT_WIDTH - CARD.width) / 2, y: Math.round((EXPORT_HEIGHT - height) / 2), width: CARD.width, height };
  const x = card.x + inset;
  const width = card.width - inset * 2;

  const header = { x, y: card.y + inset, width, height: CARD.header.height };
  const icon = {
    x: x + 10, y: header.y + (header.height - CARD.header.icon) / 2,
    width: CARD.header.icon, height: CARD.header.icon,
  };
  const pill = {
    x: x + width - CARD.header.pill.width - 8, y: header.y + (header.height - CARD.header.pill.height) / 2,
    width: CARD.header.pill.width, height: CARD.header.pill.height,
  };

  const frameTop = header.y + header.height + gap / 2;
  const frame = { x, y: frameTop, width, height: height - fixed };
  const readingTop = frame.y + frame.height + gap;
  let y = readingTop + readingHeight;
  const cautions: Box[] = options.cautionHeights.map((h) => {
    const box = { x, y: y + gap, width, height: h };
    y += gap + h;
    return box;
  });
  const footer = { x, y: y + gap, width, height: CARD.footer.height };
  const upgrade = options.pro ? null : { x, y: footer.y + footer.height + gap, width, height: CARD.upgrade.height };

  const labelBaseline = readingTop + lines.label;
  const speedBaseline = labelBaseline + lines.speed;
  const rangeBaseline = speedBaseline + lines.range;
  const checkTop = options.implausible ? rangeBaseline + 14 : null;
  const methodBaseline = rangeBaseline + (options.implausible ? lines.check : 0) + lines.method;
  const nameBaseline = options.hasName ? methodBaseline + lines.name : null;

  return {
    card,
    header,
    icon,
    pill,
    frame,
    reading: {
      x, y: readingTop, width, height: readingHeight,
      labelBaseline, speedBaseline, rangeBaseline, checkTop, methodBaseline, nameBaseline,
    },
    cautions,
    footer: {
      ...footer,
      dateBaseline: footer.y + 42,
      footBaseline: footer.y + 76,
    },
    upgrade,
  };
}

/**
 * The frame, cropped to fill its panel, but never at the cost of a mark: the
 * crop is moved, and if need be widened back towards the whole frame, until
 * every mark given sits at least `margin` inside the panel. Transform from the
 * session's coordinate space.
 */
export function coverGeometry(
  session: Session, imageWidth: number, imageHeight: number, box: Box, keep: Point[], margin: number = CARD.markMargin,
) {
  checkDimensions(session, imageWidth, imageHeight);
  const cover = Math.max(box.width / imageWidth, box.height / imageHeight);
  const contain = Math.min(box.width / imageWidth, box.height / imageHeight);
  const us = keep.map((p) => p.x / session.width);
  const vs = keep.map((p) => p.y / session.height);
  const uSpan = keep.length ? Math.max(...us) - Math.min(...us) : 0;
  const vSpan = keep.length ? Math.max(...vs) - Math.min(...vs) : 0;
  const fitU = uSpan > 0 ? (box.width - margin * 2) / (uSpan * imageWidth) : Infinity;
  const fitV = vSpan > 0 ? (box.height - margin * 2) / (vSpan * imageHeight) : Infinity;
  const k = Math.max(contain, Math.min(cover, fitU, fitV));
  const width = imageWidth * k;
  const height = imageHeight * k;

  // Covering the panel where the image is big enough, centred where it is
  // not, then moved as little as it takes to bring every mark inside it. A
  // mark at the very edge of the frame stays on the panel, if closer to its edge.
  const place = (start: number, size: number, image: number, at: number[]) => {
    const lo = size >= image ? start + image - size : start + (image - size) / 2;
    const hi = size >= image ? start : lo;
    let want = start + (image - size) / 2;
    if (at.length) {
      const markLo = start + margin - Math.min(...at) * size;
      const markHi = start + image - margin - Math.max(...at) * size;
      want = markLo <= markHi ? Math.min(Math.max(want, markLo), markHi) : (markLo + markHi) / 2;
    }
    return Math.min(Math.max(want, lo), hi);
  };
  const rect = {
    x: place(box.x, width, box.width, us),
    y: place(box.y, height, box.height, vs),
    width,
    height,
  };
  const point = (p: Point) => ({
    x: rect.x + (p.x / session.width) * width,
    y: rect.y + (p.y / session.height) * height,
  });
  // The whole frame cropped to fill the panel, for behind it where the
  // mark-safe crop leaves the panel's edges bare.
  const backdrop = {
    width: imageWidth * cover,
    height: imageHeight * cover,
    x: box.x + (box.width - imageWidth * cover) / 2,
    y: box.y + (box.height - imageHeight * cover) / 2,
  };
  return {
    rect,
    backdrop,
    release: point(session.release),
    bounce: point(session.bounce),
    calA: point(session.calA),
    calB: point(session.calB),
  };
}

function checkDimensions(session: Session, imageWidth: number, imageHeight: number) {
  if (![imageWidth, imageHeight, session.width, session.height].every(
    (value) => Number.isFinite(value) && value > 0,
  )) throw new Error('Cannot export an image with invalid dimensions.');
  // A rotation mismatch needs correcting at capture, not stretching an overlay.
  const aspectError = Math.abs(imageWidth / imageHeight / (session.width / session.height) - 1);
  if (aspectError > 0.01) throw new Error('Saved frame orientation does not match this delivery.');
}

/** The frame box of a free card with a name and nothing to caution. */
export const PHOTO = shareCardLayout({ pro: false, hasName: true, implausible: false, cautionHeights: [] }).frame;

/** Fit the whole decoded frame; transform from the session's coordinate space. */
export function exportGeometry(session: Session, imageWidth: number, imageHeight: number, box: Box = PHOTO) {
  checkDimensions(session, imageWidth, imageHeight);
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

/**
 * A mark's label plate: centred over the mark, below it where there is no
 * room above, and kept inside the frame. The same box drawCard draws.
 */
export function labelBox(
  textWidth: number, at: { x: number; y: number }, frame: Box,
): Box {
  const { mark } = CARD;
  const width = textWidth + mark.plate * 2;
  const height = CARD.text.mark + mark.plate * 2;
  const above = at.y - mark.ring - 6 - height;
  const x = at.x - width / 2;
  const y = above >= frame.y ? above : at.y + mark.ring + 6;
  return {
    x: Math.min(Math.max(x, frame.x), frame.x + frame.width - width),
    y: Math.min(Math.max(y, frame.y), frame.y + frame.height - height),
    width,
    height,
  };
}

/** Where a box lies across a line through the frame's centre at `angle` degrees, as a signed interval. */
function across(box: Box, cx: number, cy: number, nx: number, ny: number): [number, number] {
  const corners = [
    [box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height],
  ].map(([x, y]) => (x - cx) * nx + (y - cy) * ny);
  return [Math.min(...corners), Math.max(...corners)];
}

/**
 * The free card's diagonal band across the frame: at `angle` degrees, as thick
 * as given, and moved along its normal, as little from the centre as it can
 * be, until it covers none of the boxes to avoid (the Release and Bounce
 * labels). `offset` is that move; `clear` says whether a clear place was found.
 */
export function bandPlacement(
  frame: Box, avoid: Box[], angle: number = CARD.band.angle, thickness: number = CARD.band.thickness,
  margin: number = CARD.band.margin,
): { cx: number; cy: number; nx: number; ny: number; offset: number; clear: boolean } {
  const rad = (angle * Math.PI) / 180;
  const nx = -Math.sin(rad);
  const ny = Math.cos(rad);
  const cx = frame.x + frame.width / 2;
  const cy = frame.y + frame.height / 2;
  const intervals = avoid.map((b) => across(b, cx, cy, nx, ny));
  const hits = (offset: number) => intervals.filter(([lo, hi]) =>
    hi + margin > offset - thickness / 2 && lo - margin < offset + thickness / 2).length;
  // The band stays well inside the frame, so it always crosses a good length of it.
  const reach = Math.abs(across(frame, cx, cy, nx, ny)[0]) * 0.62;
  let best = { offset: 0, hits: hits(0) };
  for (let step = 4; step <= reach && best.hits > 0; step += 4) {
    for (const offset of [step, -step]) {
      const h = hits(offset);
      if (h < best.hits) best = { offset, hits: h };
      if (h === 0) break;
    }
  }
  return { cx, cy, nx, ny, offset: best.offset, clear: best.hits === 0 };
}

/**
 * The Pro card's decorative ball: to the right of the reading's text, never
 * over it, as big as the room allows up to its full size. Null when there is
 * too little room to draw it.
 */
/** How far the ball's drawing reaches left of the panel's edge, in radii. */
export const BALL_REACH = 2.7;

export function ballBox(reading: Box, textRight: number): { cx: number; cy: number; r: number } | null {
  const gap = 24;
  const full = reading.height * 0.62;
  // Its circle sits 0.72 r in from the panel's edge, and the circuit traces
  // run out up to 0.9 r beyond its left side: 2.7 r in all, from the edge.
  const room = reading.x + reading.width - (textRight + gap);
  const r = Math.min(full, room / BALL_REACH);
  if (r < 44) return null;
  return { cx: reading.x + reading.width - r * 0.72, cy: reading.y + reading.height / 2, r };
}

export function frameFileName(frame: number): string {
  if (!Number.isInteger(frame) || frame < 0) throw new Error('Invalid export frame.');
  return `frame_${String(frame).padStart(5, '0')}.jpg`;
}
