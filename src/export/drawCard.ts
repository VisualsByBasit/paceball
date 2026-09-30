import type { SkCanvas, SkFont, SkImage, SkPaint, Skia } from '@shopify/react-native-skia';
import type { Session } from '../types';
import type { SpeedUnit } from '../settings/settings';
import { measurementState } from '../physics/measurementState';
import { CALIBRATION_SPECS, travelWarning } from '../physics/calibration';
import { referenceFraming, spanBetween } from '../capture/framing';
import { CHECK_READING, implausible } from '../ui/gauge';
import { errorIn, formatSpeed, unitLabel } from '../ui/units';
import { WORDMARK_PATHS, wordmarkWidth } from '../ui/wordmarkPaths';
import {
  bandPlacement,
  capHeight,
  CARD,
  coverGeometry,
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  labelBox,
  shareCardLayout,
} from './layout';

/** The app's colours, and the card's own few from `shareCard` in tokens.ts. */
export type CardPalette = {
  bg: string;
  surface: string;
  line: string;
  control: string;
  text: string;
  muted: string;
  accent: string;
  warn: string;
  lavender: string;
  panel: string;
  limeDeep: string;
};
type FontFor = (size: number, bold?: boolean) => SkFont;

export const CARD_LABEL = 'Bowling Speed';
export const CARD_METHOD = 'Average speed, release to bounce';
export const CARD_PATH_LABEL = 'Marked, not tracked';
export const CARD_FOOT = 'Estimated from marked distance and frame timing.';
export const CARD_UPGRADE = 'Upgrade to Pro for clean exports';
/**
 * The free card's band across the frame: the wordmark, then FREE in lime.
 * The wordmark is drawn from its traced paths, never set in a font.
 */
export const CARD_BAND = ['PACEBALL', 'FREE'] as const;

// Skia's own enum values, as numbers so this file loads without the native
// module; export.test checks they still match the library.
export const SK = {
  fill: 0, stroke: 1, roundCap: 1, roundJoin: 1, intersect: 1, blurNormal: 0, clamp: 0, screen: 14,
} as const;

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
 * Shared by the phone renderer and the real CanvasKit rendering test. Drawn
 * at 1080 x 1350 in its own pixels, after docs/design/share-card/*-reference.
 *
 * A lime-edged card: the icon, the wordmark and a PRO or FREE pill; the
 * release frame, cropped to fill but never cropping a mark, with the marks
 * exactly as the app draws them; the reading, its range always beside it, how
 * it was measured and whose it is; any caution; the date and how it was
 * estimated. A free card adds a translucent band across the frame that keeps
 * clear of the Release and Bounce labels, and an upgrade bar. Speed from the
 * saved reading; range recomputed from its marks.
 */
export function drawCard(
  skia: typeof Skia, canvas: SkCanvas, photo: SkImage, session: Session,
  watermark: boolean, font: FontFor, colors: CardPalette,
  details: { playerName?: string | null; unit?: SpeedUnit; icon?: SkImage | null } = {},
) {
  const reading = measurementState(session);
  if (reading.kind !== 'measured') {
    throw new Error('This delivery has no measured speed to export.');
  }
  const unit = details.unit ?? 'kmh';
  const pro = !watermark;
  const flagged = implausible(reading);
  const spec = CALIBRATION_SPECS[session.calibrationMethod];
  const { text: size, reading: panel, mark } = CARD;
  const widthAt = (px: number, bold = false) => (value: string) => measure(font(px, bold), value, px);

  const innerWidth = CARD.width - CARD.inset * 2 - CARD.pad * 2;
  const cautions = cardCautions(session).map((message) => wrapText(message, innerWidth, widthAt(size.caution)));
  const cautionHeights = cautions.map((lines) => CARD.pad * 2 + CARD.caution.labelLine + lines.length * CARD.caution.line);
  const refsOnFrame = !spec.sameFrame ||
    (session.calA.frame === session.release.frame && session.calB.frame === session.release.frame);
  const caption = refsOnFrame ? null : `${spec.short} reference marked on frame ${session.calA.frame}`;
  const name = details.playerName?.trim() || null;
  const layout = shareCardLayout({ pro, hasName: name !== null, implausible: flagged, cautionHeights });
  const keep = [session.release, session.bounce, ...(refsOnFrame ? [session.calA, session.calB] : [])];
  const geometry = coverGeometry(session, photo.width(), photo.height(), layout.frame, keep);

  const paints: SkPaint[] = [];
  const newPaint = () => {
    const p = skia.Paint();
    p.setAntiAlias(true);
    paints.push(p);
    return p;
  };
  const fill = (color: string, alpha = 1) => {
    const p = newPaint();
    p.setColor(skia.Color(color));
    if (alpha < 1) p.setAlphaf(alpha);
    return p;
  };
  const stroke = (color: string, width: number, alpha = 1) => {
    const p = fill(color, alpha);
    p.setStyle(SK.stroke);
    p.setStrokeWidth(width);
    p.setStrokeCap(SK.roundCap);
    p.setStrokeJoin(SK.roundJoin);
    return p;
  };
  const glow = (p: SkPaint, sigma: number) => {
    p.setMaskFilter(skia.MaskFilter.MakeBlur(SK.blurNormal, sigma, true));
    return p;
  };
  const vertical = (p: SkPaint, y0: number, y1: number, from: string, to: string) => {
    p.setShader(skia.Shader.MakeLinearGradient(
      skia.Point(0, y0), skia.Point(0, y1), [skia.Color(from), skia.Color(to)], null, SK.clamp,
    ));
    // Two near-blacks over a tall panel step visibly in 8 bits; dither smooths them.
    p.setDither(true);
    return p;
  };
  /** A faint lime dot grid across a box, fading in to the right. */
  const dotGrid = (from: number, top: number, right: number, bottom: number, step: number, dot: number, lo: number, hi: number) => {
    for (let gx = from; gx < right; gx += step) {
      for (let gy = top; gy < bottom; gy += step) {
        const fade = (gx - from) / Math.max(right - from, 1);
        canvas.drawCircle(gx, gy, dot, fill(colors.accent, lo + hi * fade));
      }
    }
  };
  const rrect = (b: { x: number; y: number; width: number; height: number }, r: number) =>
    skia.RRectXY(skia.XYWHRect(b.x, b.y, b.width, b.height), r, r);
  const text = (value: string, x: number, y: number, px: number, color = colors.text, bold = false, alpha = 1) =>
    canvas.drawText(value, x, y, fill(color, alpha), font(px, bold));

  // The PACEBALL wordmark, from the paths traced off the logo: white letters,
  // lime in the A's and the E. Never set in a system font.
  const wordPaths = [
    { path: skia.Path.MakeFromSVGString(WORDMARK_PATHS.white), lime: false },
    { path: skia.Path.MakeFromSVGString(WORDMARK_PATHS.lime), lime: true },
  ];
  const wordmark = (x: number, top: number, height: number, alpha = 1, limeAlpha = alpha) => {
    const k = height / WORDMARK_PATHS.height;
    canvas.save();
    canvas.translate(x, top);
    canvas.scale(k, k);
    for (const { path, lime } of wordPaths) {
      if (path) canvas.drawPath(path, fill(lime ? colors.accent : colors.text, lime ? limeAlpha : alpha));
    }
    canvas.restore();
  };

  try {
    canvas.drawRect(skia.XYWHRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT), fill(colors.bg));

    // The card: a soft lime glow, the lime edge, and a dark panel inside it.
    const { card } = layout;
    canvas.drawRRect(rrect(card, CARD.radius), glow(stroke(colors.accent, CARD.border * 3, 0.55), CARD.glow));
    canvas.drawRRect(rrect(card, CARD.radius), fill(colors.bg));
    canvas.drawRRect(rrect(card, CARD.radius), stroke(colors.accent, CARD.border));
    const inner = {
      x: card.x + CARD.innerInset, y: card.y + CARD.innerInset,
      width: card.width - CARD.innerInset * 2, height: card.height - CARD.innerInset * 2,
    };
    canvas.drawRRect(rrect(inner, CARD.innerRadius), vertical(fill(colors.panel), inner.y, inner.y + inner.height * 0.5, colors.panel, colors.bg));
    canvas.drawRRect(rrect(inner, CARD.innerRadius), stroke(colors.line, 1.5));

    // Header: the icon, the wordmark, and PRO or FREE centred on the wordmark.
    const { header, icon, pill } = layout;
    const wordX = icon.x + icon.width + 16;
    const wordHeight = Math.min(CARD.header.wordmark, (pill.x - 24 - wordX) * WORDMARK_PATHS.height / WORDMARK_PATHS.width);
    if (details.icon) {
      const p = newPaint();
      // Its own black background adds nothing on screen blend: only the lit ball shows.
      p.setBlendMode(SK.screen);
      canvas.drawImageRect(details.icon, skia.XYWHRect(0, 0, details.icon.width(), details.icon.height()),
        skia.XYWHRect(icon.x, icon.y, icon.width, icon.height), p);
    } else {
      canvas.drawCircle(icon.x + icon.width * 0.58, icon.y + icon.height / 2, icon.width * 0.34, stroke(colors.accent, 4));
    }
    wordmark(wordX, header.y + (header.height - wordHeight) / 2, wordHeight);
    canvas.drawRRect(rrect(pill, pill.height / 2), glow(stroke(colors.accent, 6, 0.35), 8));
    canvas.drawRRect(rrect(pill, pill.height / 2), vertical(fill(colors.limeDeep), pill.y, pill.y + pill.height, colors.limeDeep, colors.bg));
    canvas.drawRRect(rrect(pill, pill.height / 2), stroke(colors.accent, 3));
    const pillWord = pro ? 'PRO' : 'FREE';
    text(pillWord, pill.x + (pill.width - widthAt(size.pill, true)(pillWord)) / 2,
      pill.y + pill.height / 2 + Math.round(capHeight(size.pill) / 2), size.pill, colors.accent, true);

    // The frame, cropped to fill, the marks on it exactly as the app draws them.
    const frame = layout.frame;
    const frameShape = rrect(frame, CARD.frame.radius);
    canvas.save();
    canvas.clipRRect(frameShape, SK.intersect, true);
    canvas.drawRect(skia.XYWHRect(frame.x, frame.y, frame.width, frame.height), fill(colors.surface));
    const { rect: shot, backdrop, release, bounce, calA, calB } = geometry;
    const whole = skia.XYWHRect(0, 0, photo.width(), photo.height());
    if (shot.width < frame.width - 1 || shot.height < frame.height - 1) {
      // Where keeping every mark in view leaves bare edges, the same frame,
      // softened and dimmed, fills them: the panel is always full.
      const soft = newPaint();
      soft.setImageFilter(skia.ImageFilter.MakeBlur(18, 18, SK.clamp, null));
      canvas.drawImageRect(photo, whole, skia.XYWHRect(backdrop.x, backdrop.y, backdrop.width, backdrop.height), soft);
      canvas.drawRect(skia.XYWHRect(frame.x, frame.y, frame.width, frame.height), fill(colors.bg, 0.45));
    }
    canvas.drawImageRect(photo, whole, skia.XYWHRect(shot.x, shot.y, shot.width, shot.height), newPaint());

    // Straight, because the ball was marked at two points and nowhere between.
    const span = Math.hypot(bounce.x - release.x, bounce.y - release.y);
    const dots = Math.max(2, Math.floor(span / mark.dotGap));
    for (let i = 1; i < dots; i++) {
      const t = i / dots;
      canvas.drawCircle(release.x + (bounce.x - release.x) * t, release.y + (bounce.y - release.y) * t,
        mark.dotRadius, fill(colors.accent));
    }
    const line = (x1: number, y1: number, x2: number, y2: number, color: string) =>
      canvas.drawLine(x1, y1, x2, y2, stroke(color, mark.stroke));
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

    const plateAt = (value: string, box: { x: number; y: number; width: number; height: number }) => {
      canvas.drawRect(skia.XYWHRect(box.x, box.y, box.width, box.height), fill(colors.bg));
      text(value, box.x + mark.plate, box.y + mark.plate + Math.round(size.mark * 0.8), size.mark);
    };
    const labelFor = (value: string, at: { x: number; y: number }) => labelBox(widthAt(size.mark)(value), at, frame);
    const releaseLabel = labelFor('Release', release);
    const bounceLabel = labelFor('Bounce', bounce);

    // Free: a translucent band across the frame, clear of the Release and Bounce labels.
    if (watermark) {
      const band = bandPlacement(frame, [releaseLabel, bounceLabel]);
      const px = band.cx + band.nx * band.offset;
      const py = band.cy + band.ny * band.offset;
      const length = Math.hypot(frame.width, frame.height) * 1.2;
      const t = CARD.band.thickness;
      canvas.save();
      canvas.translate(px, py);
      canvas.rotate(CARD.band.angle, 0, 0);
      canvas.drawRect(skia.XYWHRect(-length / 2, -t / 2, length, t), fill(colors.text, 0.1));
      canvas.drawLine(-length / 2, -t / 2, length / 2, -t / 2, stroke(colors.text, 1.5, 0.28));
      canvas.drawLine(-length / 2, t / 2, length / 2, t / 2, stroke(colors.text, 1.5, 0.28));
      // The wordmark as tall as FREE's capitals, then FREE, centred together.
      const [, second] = CARD_BAND;
      const markHeight = capHeight(size.band);
      const w1 = wordmarkWidth(markHeight) + size.band * 0.3;
      const w2 = widthAt(size.band, true)(second);
      const bx = -(w1 + w2) / 2;
      const by = Math.round(size.band * 0.36);
      wordmark(bx, by - markHeight, markHeight, 0.4, 0.5);
      text(second, bx + w1, by, size.band, colors.accent, true, 0.5);
      canvas.restore();
    }

    // Labels on opaque plates, so they read over any frame, kept inside it.
    for (const { at, label } of references) plateAt(label, labelFor(label, at));
    plateAt('Release', releaseLabel);
    plateAt('Bounce', bounceLabel);
    // Always on: the marks are the user's, not something the app found.
    plateAt(CARD_PATH_LABEL, {
      x: frame.x + 16, y: frame.y + 16,
      width: widthAt(size.mark)(CARD_PATH_LABEL) + mark.plate * 2, height: size.mark + mark.plate * 2,
    });
    if (caption) {
      const h = size.mark + mark.plate * 2;
      plateAt(caption, { x: frame.x + 16, y: frame.y + frame.height - 16 - h, width: widthAt(size.mark)(caption) + mark.plate * 2, height: h });
    }
    canvas.restore();
    canvas.drawRRect(frameShape, glow(stroke(colors.accent, CARD.frame.border * 2, 0.3), 6));
    canvas.drawRRect(frameShape, stroke(colors.accent, CARD.frame.border));

    // The reading: its range always right under it.
    const r = layout.reading;
    const readingShape = rrect(r, panel.radius);
    canvas.drawRRect(readingShape, vertical(fill(colors.panel), r.y, r.y + r.height, colors.panel, colors.bg));
    canvas.drawRRect(readingShape, stroke(colors.control, panel.border, 0.45));
    const left = r.x + CARD.pad;
    const room = r.width - CARD.pad * 2;
    // The number large and its unit smaller beside it, on the one baseline.
    const speedValue = formatSpeed(reading.speedKmh, unit);
    const speedUnit = unitLabel(unit);
    const speedFull = widthAt(size.speed, true)(speedValue) + size.unit * 0.3 + widthAt(size.unit, true)(speedUnit);
    const fit = Math.min(1, room / Math.max(speedFull, 1));
    const speedSize = size.speed * fit;
    const unitSize = size.unit * fit;
    const speedValueWidth = widthAt(speedSize, true)(speedValue);
    const unitX = left + speedValueWidth + unitSize * 0.3;
    const rangeLine = `± ${errorIn(reading.errorKmh, unit)} ${unitLabel(unit)}`;
    const nameLine = name ? fitLine(name, room, widthAt(size.name, true)) : null;
    const checkWidth = widthAt(size.check, true)(CHECK_READING) + CARD.check.pad * 2 + 26;
    const textRight = left + Math.max(
      widthAt(size.label)(CARD_LABEL),
      unitX - left + widthAt(unitSize, true)(speedUnit),
      widthAt(size.range, true)(rangeLine),
      flagged ? checkWidth : 0,
      widthAt(size.method)(CARD_METHOD),
      nameLine ? widthAt(size.name, true)(nameLine) : 0,
    );

    // The same faint dot grid on both cards, clear of the text, so the number has the room.
    canvas.save();
    canvas.clipRRect(readingShape, SK.intersect, true);
    const gridStep = 18;
    dotGrid(Math.max(textRight + CARD.pad * 2, r.x + r.width * 0.58), r.y + CARD.pad, r.x + r.width - CARD.pad + 1,
      r.y + r.height - CARD.pad + 1, gridStep, 2, 0.05, 0.1);
    canvas.restore();

    text(CARD_LABEL, left, r.labelBaseline, size.label, colors.lavender);
    text(speedValue, left, r.speedBaseline, speedSize, colors.accent, true);
    text(speedUnit, unitX, r.speedBaseline, unitSize, colors.accent, true);
    text(rangeLine, left, r.rangeBaseline, size.range, colors.text, true);
    if (flagged && r.checkTop !== null) {
      const chip = { x: left, y: r.checkTop, width: checkWidth, height: CARD.check.height };
      canvas.drawRRect(rrect(chip, chip.height / 2), fill(colors.warn, 0.14));
      canvas.drawRRect(rrect(chip, chip.height / 2), stroke(colors.warn, 2));
      const base = chip.y + chip.height / 2 + Math.round(size.check * 0.36);
      text('!', chip.x + CARD.check.pad, base, size.check, colors.warn, true);
      text(CHECK_READING, chip.x + CARD.check.pad + 26, base, size.check, colors.warn, true);
    }
    text(CARD_METHOD, left, r.methodBaseline, size.method, colors.lavender);
    if (nameLine && r.nameBaseline !== null) text(nameLine, left, r.nameBaseline, size.name, colors.text, true);

    // The doubts the app showed beside the same number, with the word as well as the colour.
    layout.cautions.forEach((box, i) => {
      canvas.drawRRect(rrect(box, 20), fill(colors.panel));
      canvas.drawRRect(rrect(box, 20), stroke(colors.warn, 1.5, 0.6));
      const x = box.x + CARD.pad;
      text('Caution', x, box.y + CARD.pad + 22, size.caution, colors.warn, true);
      cautions[i].forEach((value, j) => text(value, x,
        box.y + CARD.pad + CARD.caution.labelLine + (j + 1) * CARD.caution.line - 8, size.caution));
    });

    // Footer: a calendar, the date and how it was estimated.
    const f = layout.footer;
    const footerShape = rrect(f, CARD.footer.radius);
    canvas.drawRRect(footerShape, vertical(fill(colors.panel), f.y, f.y + f.height, colors.panel, colors.bg));
    canvas.drawRRect(footerShape, stroke(colors.control, panel.border, 0.45));
    const { icon: cal, iconGap } = CARD.footer;
    drawCalendar(f.x + CARD.pad, f.y + (f.height - cal) / 2, cal);
    const footText = f.x + CARD.pad + cal + iconGap;
    text(cardDate(session.createdAt), footText, f.dateBaseline, size.date);
    text(CARD_FOOT, footText, f.footBaseline, size.foot, colors.lavender);

    // Free: the way to a clean card. In a shared image it is a label, not a
    // button, so no arrow: the crown and the words, centred together.
    if (layout.upgrade) {
      const u = layout.upgrade;
      const shape = rrect(u, CARD.upgrade.radius);
      canvas.drawRRect(shape, glow(stroke(colors.accent, CARD.upgrade.border * 3, 0.5), 12));
      canvas.drawRRect(shape, vertical(fill(colors.limeDeep), u.y, u.y + u.height, colors.limeDeep, colors.bg));
      canvas.drawRRect(shape, stroke(colors.accent, CARD.upgrade.border));
      const { crown, iconGap } = CARD.upgrade;
      // The crown's widest points, its outer jewels included.
      const crownWidth = crown * 2.4;
      const groupWidth = crownWidth + iconGap + widthAt(size.upgrade, true)(CARD_UPGRADE);
      const gx = u.x + (u.width - groupWidth) / 2;
      drawCrown(gx + crownWidth / 2, u.y + u.height / 2, crown);
      text(CARD_UPGRADE, gx + crownWidth + iconGap, u.y + u.height / 2 + Math.round(capHeight(size.upgrade) / 2),
        size.upgrade, colors.text, true);
    }
  } finally {
    for (const p of paints) p.dispose();
    for (const { path } of wordPaths) path?.dispose();
  }

  /** A calendar page, drawn in the card's lavender. */
  function drawCalendar(x: number, y: number, s: number) {
    const ink = stroke(colors.lavender, 3.2);
    canvas.drawRRect(skia.RRectXY(skia.XYWHRect(x, y + s * 0.1, s, s * 0.9), s * 0.16, s * 0.16), ink);
    canvas.drawLine(x, y + s * 0.34, x + s, y + s * 0.34, ink);
    canvas.drawLine(x + s * 0.28, y, x + s * 0.28, y + s * 0.2, ink);
    canvas.drawLine(x + s * 0.72, y, x + s * 0.72, y + s * 0.2, ink);
    for (const [dx, dy] of [[0.26, 0.56], [0.26, 0.76]]) canvas.drawCircle(x + s * dx, y + s * dy, s * 0.05, fill(colors.lavender));
  }

  /** A crown, in lime. */
  function drawCrown(cx: number, cy: number, s: number) {
    const crown = skia.Path.Make();
    crown.moveTo(cx - s, cy + s * 0.45);
    crown.lineTo(cx - s * 1.05, cy - s * 0.55);
    crown.lineTo(cx - s * 0.45, cy - s * 0.05);
    crown.lineTo(cx, cy - s * 0.75);
    crown.lineTo(cx + s * 0.45, cy - s * 0.05);
    crown.lineTo(cx + s * 1.05, cy - s * 0.55);
    crown.lineTo(cx + s, cy + s * 0.45);
    crown.close();
    canvas.drawPath(crown, fill(colors.accent));
    canvas.drawRect(skia.XYWHRect(cx - s, cy + s * 0.6, s * 2, s * 0.3), fill(colors.accent));
    for (const dx of [-1.05, 0, 1.05]) canvas.drawCircle(cx + s * dx, cy - s * (dx === 0 ? 0.8 : 0.6), s * 0.14, fill(colors.accent));
  }
}
