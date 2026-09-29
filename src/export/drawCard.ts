import type { SkCanvas, SkFont, SkImage, SkPaint, Skia } from '@shopify/react-native-skia';
import type { Session } from '../types';
import type { SpeedUnit } from '../settings/settings';
import { measurementState } from '../physics/measurementState';
import { CALIBRATION_SPECS, travelWarning } from '../physics/calibration';
import { referenceFraming, spanBetween } from '../capture/framing';
import { CHECK_READING, implausible } from '../ui/gauge';
import { errorIn, formatSpeed, unitLabel } from '../ui/units';
import {
  ballBox,
  bandPlacement,
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

export const CARD_WORDMARK = 'PACEBALL';
export const CARD_LABEL = 'Bowling Speed';
export const CARD_METHOD = 'Average speed, release to bounce';
export const CARD_PATH_LABEL = 'Marked, not tracked';
export const CARD_FOOT = 'Estimated from marked distance and frame timing.';
export const CARD_UPGRADE = 'Upgrade to Pro for clean exports';
/** The free card's band across the frame: the name in grey, then FREE in lime. */
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

/** A small deterministic scatter, so the decoration is the same on every card. */
const jitter = (i: number) => {
  const s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
  return s - Math.floor(s);
};

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

  const innerWidth = CARD.width - CARD.inset * 2 - CARD.caution.pad * 2;
  const cautions = cardCautions(session).map((message) => wrapText(message, innerWidth - 12, widthAt(size.caution)));
  const cautionHeights = cautions.map((lines) => CARD.caution.pad * 2 + CARD.caution.labelLine + lines.length * CARD.caution.line);
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
    return p;
  };
  const rrect = (b: { x: number; y: number; width: number; height: number }, r: number) =>
    skia.RRectXY(skia.XYWHRect(b.x, b.y, b.width, b.height), r, r);
  const text = (value: string, x: number, y: number, px: number, color = colors.text, bold = false, alpha = 1) =>
    canvas.drawText(value, x, y, fill(color, alpha), font(px, bold));

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

    // Header: a faint dot grid, the icon, the wordmark, and PRO or FREE.
    const { header, icon, pill } = layout;
    const wordX = icon.x + icon.width + 18;
    const wordSize = Math.min(size.wordmark, (pill.x - 40 - wordX) / (widthAt(size.wordmark, true)(CARD_WORDMARK) / size.wordmark * 1.04));
    const wordWidth = widthAt(wordSize, true)(CARD_WORDMARK) * 1.04;
    const gridFrom = wordX + wordWidth + 24;
    for (let gx = gridFrom; gx < pill.x - 14; gx += 16) {
      for (let gy = header.y + 26; gy < header.y + header.height - 20; gy += 16) {
        const fade = 1 - (gx - gridFrom) / Math.max(pill.x - gridFrom, 1);
        canvas.drawCircle(gx, gy, 1.8, fill(colors.accent, 0.08 + 0.12 * fade));
      }
    }
    if (details.icon) {
      const p = newPaint();
      // Its own black background adds nothing on screen blend: only the lit ball shows.
      p.setBlendMode(SK.screen);
      canvas.drawImageRect(details.icon, skia.XYWHRect(0, 0, details.icon.width(), details.icon.height()),
        skia.XYWHRect(icon.x, icon.y, icon.width, icon.height), p);
    } else {
      canvas.drawCircle(icon.x + icon.width * 0.58, icon.y + icon.height / 2, icon.width * 0.34, stroke(colors.accent, 4));
    }
    // Heavy italic: slanted, and stroked as well as filled; the A's in lime.
    const wordBase = header.y + header.height / 2 + Math.round(wordSize * 0.36);
    canvas.save();
    canvas.translate(wordX, wordBase);
    canvas.skew(-0.2, 0);
    let wx = 0;
    for (const letter of CARD_WORDMARK) {
      const color = letter === 'A' ? colors.accent : colors.text;
      canvas.drawText(letter, wx, 0, stroke(color, 2.6), font(wordSize, true));
      canvas.drawText(letter, wx, 0, fill(color), font(wordSize, true));
      wx += widthAt(wordSize, true)(letter) * 1.04;
    }
    canvas.restore();
    canvas.drawRRect(rrect(pill, pill.height / 2), glow(stroke(colors.accent, 6, 0.35), 8));
    canvas.drawRRect(rrect(pill, pill.height / 2), vertical(fill(colors.limeDeep), pill.y, pill.y + pill.height, colors.limeDeep, colors.bg));
    canvas.drawRRect(rrect(pill, pill.height / 2), stroke(colors.accent, 3));
    const pillWord = pro ? 'PRO' : 'FREE';
    text(pillWord, pill.x + (pill.width - widthAt(size.pill, true)(pillWord)) / 2,
      pill.y + pill.height / 2 + Math.round(size.pill * 0.36), size.pill, colors.accent, true);

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
      const [first, second] = CARD_BAND;
      const w1 = widthAt(size.band, true)(`${first} `);
      const w2 = widthAt(size.band, true)(second);
      const bx = -(w1 + w2) / 2;
      const by = Math.round(size.band * 0.36);
      text(first, bx, by, size.band, colors.text, true, 0.4);
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
    const left = r.x + panel.pad;
    const speedLine = `${formatSpeed(reading.speedKmh, unit)} ${unitLabel(unit)}`;
    const rangeLine = `± ${errorIn(reading.errorKmh, unit)} ${unitLabel(unit)}`;
    const speedSize = Math.min(size.speed, size.speed * (r.width - panel.pad * 2) / Math.max(widthAt(size.speed, true)(speedLine), 1));
    const nameLine = name ? fitLine(name, r.width - panel.pad * 2, widthAt(size.name, true)) : null;
    const checkWidth = widthAt(size.check, true)(CHECK_READING) + CARD.check.pad * 2 + 26;
    const textRight = left + Math.max(
      widthAt(size.label)(CARD_LABEL),
      widthAt(speedSize, true)(speedLine),
      widthAt(size.range, true)(rangeLine),
      flagged ? checkWidth : 0,
      widthAt(size.method)(CARD_METHOD),
      nameLine ? widthAt(size.name, true)(nameLine) : 0,
    );

    canvas.save();
    canvas.clipRRect(readingShape, SK.intersect, true);
    if (pro) {
      const ball = ballBox(r, textRight);
      if (ball) drawBall(ball);
    } else {
      // A faint dot grid where Pro has its ball.
      const from = Math.max(textRight + 30, r.x + r.width * 0.55);
      for (let gx = from; gx < r.x + r.width - 18; gx += 18) {
        for (let gy = r.y + 22; gy < r.y + r.height - 16; gy += 18) {
          const fade = (gx - from) / Math.max(r.x + r.width - from, 1);
          canvas.drawCircle(gx, gy, 2, fill(colors.accent, 0.05 + 0.1 * fade));
        }
      }
    }
    canvas.restore();

    text(CARD_LABEL, left, r.labelBaseline, size.label, colors.lavender);
    text(speedLine, left, r.speedBaseline, speedSize, colors.accent, true);
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
      const x = box.x + CARD.caution.pad;
      text('Caution', x, box.y + CARD.caution.pad + 22, size.caution, colors.warn, true);
      cautions[i].forEach((value, j) => text(value, x,
        box.y + CARD.caution.pad + CARD.caution.labelLine + (j + 1) * CARD.caution.line - 8, size.caution));
    });

    // Footer: a calendar, the date and how it was estimated.
    const f = layout.footer;
    const footerShape = rrect(f, CARD.footer.radius);
    canvas.drawRRect(footerShape, vertical(fill(colors.panel), f.y, f.y + f.height, colors.panel, colors.bg));
    canvas.drawRRect(footerShape, stroke(colors.control, panel.border, 0.45));
    drawCalendar(f.x + 34, f.y + (f.height - 48) / 2, 48);
    text(cardDate(session.createdAt), f.x + 118, f.dateBaseline, size.date);
    text(CARD_FOOT, f.x + 118, f.footBaseline, size.foot, colors.lavender);

    // Free: the way to a clean card.
    if (layout.upgrade) {
      const u = layout.upgrade;
      const shape = rrect(u, CARD.upgrade.radius);
      canvas.drawRRect(shape, glow(stroke(colors.accent, CARD.upgrade.border * 3, 0.5), 12));
      canvas.drawRRect(shape, vertical(fill(colors.limeDeep), u.y, u.y + u.height, colors.limeDeep, colors.bg));
      canvas.drawRRect(shape, stroke(colors.accent, CARD.upgrade.border));
      drawCrown(u.x + 44, u.y + u.height / 2, 24);
      text(CARD_UPGRADE, u.x + 100, u.y + u.height / 2 + Math.round(size.upgrade * 0.36), size.upgrade, colors.text, true);
      const cx = u.x + u.width - 44;
      const cy = u.y + u.height / 2;
      const chevron = skia.Path.Make();
      chevron.moveTo(cx - 7, cy - 14);
      chevron.lineTo(cx + 7, cy);
      chevron.lineTo(cx - 7, cy + 14);
      canvas.drawPath(chevron, stroke(colors.accent, 5));
    }
  } finally {
    for (const p of paints) p.dispose();
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

  /**
   * The Pro card's ball, as in the logo: lime dots filling its near half,
   * circuit traces running off to the left, a stitched seam, a lit rim and
   * light swinging round it. Decoration only; it carries no data.
   */
  function drawBall({ cx, cy, r: R }: { cx: number; cy: number; r: number }) {
    // Light swinging round the ball.
    canvas.save();
    canvas.rotate(-16, cx, cy);
    for (const [k, alpha] of [[1.18, 0.55], [1.32, 0.35], [1.06, 0.7]] as const) {
      const orbit = skia.Path.Make();
      orbit.addArc(skia.XYWHRect(cx - R * k, cy - R * 0.42 * k, R * 2 * k, R * 0.84 * k), -10, 150);
      canvas.drawPath(orbit, glow(stroke(colors.accent, 3, alpha), 3));
      canvas.drawPath(orbit, stroke(colors.accent, 2, alpha));
    }
    canvas.restore();
    // The rim, lit.
    canvas.drawCircle(cx, cy, R, glow(stroke(colors.accent, 6, 0.5), 8));
    canvas.drawCircle(cx, cy, R, stroke(colors.accent, 2.5, 0.9));
    // Dots across the near half of the ball.
    const step = R * 0.12;
    for (let row = -7; row <= 7; row++) {
      const y = cy + row * step;
      const half = Math.sqrt(Math.max(R * R - (y - cy) ** 2, 0));
      for (let col = 0; col < 12; col++) {
        const x = cx - half + step * 0.6 + col * step;
        if (x > cx + R * 0.1) break;
        const depth = 1 - col / 12;
        canvas.drawCircle(x, y, step * (0.14 + 0.16 * depth), fill(colors.accent, 0.35 + 0.55 * depth));
      }
    }
    // Circuit traces running off to the left, each ending in a ring.
    for (let i = 0; i < 9; i++) {
      const y = cy + (i - 4) * step * 1.6;
      const edge = cx - Math.sqrt(Math.max(R * R - (y - cy) ** 2, 0));
      const reach = R * (0.35 + 0.55 * jitter(i));
      const start = edge - reach;
      canvas.drawLine(start + 6, y, edge + step * 0.3, y, stroke(colors.accent, 2, 0.75));
      canvas.drawCircle(start, y, 5, stroke(colors.accent, 2, 0.9));
    }
    // The seam: two stitched curves from top to bottom, bowing right.
    for (const shift of [-0.07, 0.07]) {
      const p0 = { x: cx + R * (0.12 + shift), y: cy - R * 0.97 };
      const c1 = { x: cx + R * (0.75 + shift), y: cy - R * 0.4 };
      const c2 = { x: cx - R * (0.25 - shift), y: cy + R * 0.35 };
      const p1 = { x: cx + R * (0.28 + shift), y: cy + R * 0.97 };
      const at = (t: number) => ({
        x: (1 - t) ** 3 * p0.x + 3 * (1 - t) ** 2 * t * c1.x + 3 * (1 - t) * t ** 2 * c2.x + t ** 3 * p1.x,
        y: (1 - t) ** 3 * p0.y + 3 * (1 - t) ** 2 * t * c1.y + 3 * (1 - t) * t ** 2 * c2.y + t ** 3 * p1.y,
      });
      for (let i = 0; i < 18; i++) {
        const a = at(i / 18 + 0.01);
        const b = at(i / 18 + 0.035);
        canvas.drawLine(a.x, a.y, b.x, b.y, stroke(colors.text, 3.2, 0.85));
      }
    }
  }
}
