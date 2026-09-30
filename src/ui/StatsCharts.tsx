import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { Canvas, Circle, Line, Path, RoundedRect, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import type { SpeedUnit } from '../settings/settings';
import { formatWhen } from './format';
import { monotoneControls, nearestIndex, percent, type DayCount, type SpeedPoint } from './stats';
import { colors, opacity, radius, size, space, stroke, type } from './tokens';
import { unitSpoken } from './units';

/** Adds a smooth run through the points to a path already at the first one. */
function runThrough(path: SkPath, xs: number[], ys: number[]) {
  const controls = monotoneControls(xs, ys);
  controls.forEach(({ c1, c2 }, i) => path.cubicTo(c1[0], c1[1], c2[0], c2[1], xs[i + 1], ys[i + 1]));
}

/** The same run, walked back from the last point to the first. */
function runBack(path: SkPath, xs: number[], ys: number[]) {
  const controls = monotoneControls(xs, ys);
  for (let i = controls.length - 1; i >= 0; i--) {
    const { c1, c2 } = controls[i];
    path.cubicTo(c2[0], c2[1], c1[0], c1[1], xs[i], ys[i]);
  }
}

/** A chart point's dot, and the ring that marks the best one. */
const DOT = space.xs * 0.75;
const RING = space.sm;

/**
 * Speed over time: every plausible measured reading, oldest to newest, as a
 * small point on a thin line, with its own range as a faint band around it.
 * The line is monotone between readings, so it never draws a speed beyond the
 * two it joins. The best reading is ringed. Tap for a reading's date, speed
 * and range; the list under the chart says the same for a screen reader.
 */
export function SpeedChart({ points, unit }: { points: SpeedPoint[]; unit: SpeedUnit }) {
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const h = size.chart;
  const top = space.md;
  const bottom = h - space.md;

  const geometry = useMemo(() => {
    if (width === 0 || points.length === 0) return null;
    const lo = Math.max(0, Math.floor(Math.min(...points.map((p) => p.view.value - p.view.error))) - 2);
    const hi = Math.ceil(Math.max(...points.map((p) => p.view.value + p.view.error))) + 2;
    const span = Math.max(hi - lo, 1);
    const y = (v: number) => bottom - ((v - lo) / span) * (bottom - top);
    const left = space.xl + space.sm;
    const right = width - space.md;
    const xs =
      points.length === 1
        ? [(left + right) / 2]
        : points.map((_, i) => left + ((right - left) * i) / (points.length - 1));
    const mid = points.map((p) => y(p.view.value));
    const upper = points.map((p) => y(p.view.value + p.view.error));
    const lower = points.map((p) => y(Math.max(lo, p.view.value - p.view.error)));

    const line = Skia.Path.Make();
    line.moveTo(xs[0], mid[0]);
    runThrough(line, xs, mid);

    const band = Skia.Path.Make();
    if (points.length === 1) {
      band.addRRect(Skia.RRectXY(Skia.XYWHRect(xs[0] - space.sm, upper[0], space.md, lower[0] - upper[0]), space.xs, space.xs));
    } else {
      band.moveTo(xs[0], upper[0]);
      runThrough(band, xs, upper);
      band.lineTo(xs[xs.length - 1], lower[lower.length - 1]);
      runBack(band, xs, lower);
      band.close();
    }
    // The best reading: the highest, the first of equals.
    const best = points.reduce((b, p, i) => (p.view.value > points[b].view.value ? i : b), 0);
    return { lo, hi, xs, mid, line, band, left, right, best };
  }, [width, points, top, bottom]);

  const onTap = (e: GestureResponderEvent) => {
    if (!geometry) return;
    const i = nearestIndex(geometry.xs, e.nativeEvent.locationX);
    setPicked((current) => (current === i ? null : i));
  };

  const pick = picked !== null && picked < points.length ? points[picked] : null;
  const tipLeft =
    geometry && picked !== null
      ? Math.min(Math.max(geometry.xs[picked] - size.tooltip / 2, 0), Math.max(width - size.tooltip, 0))
      : 0;
  const first = points[0];
  const last = points[points.length - 1];
  const grid = [top, (top + bottom) / 2, bottom];

  return (
    <View
      accessible
      accessibilityLabel={`Speed over time. ${points.length} measured ${points.length === 1 ? 'delivery' : 'deliveries'}${geometry ? `, on a scale from ${geometry.lo} to ${geometry.hi} ${unitSpoken(unit)}` : ''}. Each is listed below with its range.`}
    >
      <Pressable
        style={{ height: h }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPress={onTap}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {geometry ? (
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* Faint gridlines: the top, middle and foot of the scale. */}
            {grid.map((gy) => (
              <Line key={gy} p1={vec(geometry.left, gy)} p2={vec(geometry.right, gy)} color={colors.line} strokeWidth={stroke.hairline} />
            ))}
            <Path path={geometry.band} color={colors.accent} opacity={opacity.faint} />
            {points.length > 1 ? (
              <Path path={geometry.line} style="stroke" strokeWidth={stroke.medium} strokeCap="round" strokeJoin="round" color={colors.accent} />
            ) : null}
            {picked !== null ? (
              <Line p1={vec(geometry.xs[picked], top)} p2={vec(geometry.xs[picked], bottom)} color={colors.control} strokeWidth={stroke.hairline} />
            ) : null}
            <Circle cx={geometry.xs[geometry.best]} cy={geometry.mid[geometry.best]} r={RING} style="stroke" strokeWidth={stroke.hairline} color={colors.accent} />
            {geometry.xs.map((x, i) => (
              <Circle key={points[i].id} cx={x} cy={geometry.mid[i]} r={i === picked ? DOT + stroke.medium : DOT} color={i === picked ? colors.text : colors.accent} />
            ))}
          </Canvas>
        ) : null}
        {geometry ? (
          <>
            <Text style={[styles.axis, { top: top - space.sm }]}>{geometry.hi}</Text>
            <Text style={[styles.axis, { top: bottom - space.sm - space.xs }]}>{geometry.lo}</Text>
            {/* The best point's name, just above its ring, kept inside the chart. */}
            <Text
              style={[
                styles.bestLabel,
                {
                  top: Math.max(geometry.mid[geometry.best] - RING - space.md - space.xs, 0),
                  left: Math.min(Math.max(geometry.xs[geometry.best] - space.md, geometry.left), geometry.right - space.xl),
                },
              ]}
            >
              Best
            </Text>
          </>
        ) : null}
        {pick && geometry ? (
          <View style={[styles.tip, { left: tipLeft }]} pointerEvents="none">
            <Text style={styles.tipDate}>{formatWhen(pick.t)}</Text>
            <Text style={styles.tipSpeed}>
              {pick.view.speed} <Text style={styles.tipUnit}>{pick.view.unit}</Text>
            </Text>
            <Text style={styles.tipRange}>{pick.view.range}</Text>
          </View>
        ) : null}
      </Pressable>
      {first && last ? (
        <View style={styles.ends}>
          <Text style={styles.endText}>{new Date(first.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
          {points.length > 1 ? (
            <Text style={styles.endText}>{new Date(last.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.hint}>Tap the chart for a reading's date, speed and range.</Text>
    </View>
  );
}

/**
 * Deliveries per day for the last seven days: a count, never a speed. Thin
 * rounded bars in lime at a calm strength, today's at full lime, over a faint
 * baseline, each with its count above it in small muted figures.
 */
export function DayBars({ days, narrowLabels }: { days: DayCount[]; narrowLabels: boolean }) {
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...days.map((d) => d.count));
  const h = size.bars;
  const col = width / Math.max(days.length, 1);
  const barW = Math.min(col * 0.3, space.md);
  const today = days.length - 1;
  // The tallest bar leaves room above it for its count, at large text too.
  const label = (t: number) =>
    new Date(t).toLocaleDateString(undefined, { weekday: narrowLabels ? 'narrow' : 'short' });
  return (
    <View
      accessible
      accessibilityLabel={`Deliveries per day, last seven days. ${days
        .map((d) => `${new Date(d.start).toLocaleDateString(undefined, { weekday: 'long' })}: ${d.count}`)
        .join('. ')}.`}
    >
      <View style={{ height: h }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <>
            <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
              <Line p1={vec(0, h - stroke.hairline)} p2={vec(width, h - stroke.hairline)} color={colors.line} strokeWidth={stroke.hairline} />
              {days.map((d, i) => {
                if (d.count === 0) return null;
                const barH = Math.max((d.count / max) * (h - space.xl), space.xs);
                return (
                  <RoundedRect
                    key={d.start}
                    x={col * i + (col - barW) / 2}
                    y={h - stroke.hairline - barH}
                    width={barW}
                    height={barH}
                    r={radius.pill}
                    color={colors.accent}
                    opacity={i === today ? opacity.full : opacity.inactive}
                  />
                );
              })}
            </Canvas>
            {/* Each count just above its bar, or on the baseline for none. */}
            {days.map((d, i) => {
              const barH = d.count === 0 ? 0 : Math.max((d.count / max) * (h - space.xl), space.xs);
              return (
                <Text
                  key={d.start}
                  style={[styles.barCount, { left: col * i, width: col, bottom: barH + space.xs }]}
                  importantForAccessibility="no"
                >
                  {d.count}
                </Text>
              );
            })}
          </>
        ) : null}
      </View>
      <View style={styles.row} importantForAccessibility="no-hide-descendants">
        {days.map((d, i) => (
          <Text key={d.start} style={[styles.barDay, i === today && styles.barToday]}>
            {label(d.start)}
          </Text>
        ))}
      </View>
    </View>
  );
}

export type SplitPart = { label: string; value: number; color: string };

/**
 * A whole split into its parts along one thin bar, each part as wide as its
 * share, with a legend of names, counts and shares beneath. The words carry
 * the meaning; the colour only matches them to the bar.
 */
export function SplitBar({ parts, spoken }: { parts: SplitPart[]; spoken: string }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  return (
    <View accessible accessibilityLabel={spoken}>
      <View style={styles.split}>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <View key={p.label} style={[styles.segment, { flex: p.value, backgroundColor: p.color }]} />
          ))}
      </View>
      <View style={styles.legend} importantForAccessibility="no-hide-descendants">
        {parts.map((p) => (
          <View key={p.label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: p.color }]} />
            <Text style={styles.legendLabel}>{p.label}</Text>
            <Text style={styles.legendValue}>{p.value}</Text>
            <Text style={styles.legendShare}>{percent(p.value, total)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * What a locked Pro card holds, as a dimmed outline of its shape: never a
 * figure, never the player's data, never sample numbers.
 */
export function LockedPreview({ kind }: { kind: 'trend' | 'bars' | 'split' }) {
  const [width, setWidth] = useState(0);
  const h = kind === 'split' ? space.sm : size.bars / 2;
  const trend = useMemo(() => {
    if (kind !== 'trend' || width === 0) return null;
    const path = Skia.Path.Make();
    const shape = [0.7, 0.55, 0.62, 0.4, 0.46, 0.25, 0.32];
    shape.forEach((f, i) => {
      const x = (width * i) / (shape.length - 1);
      if (i === 0) path.moveTo(x, h * f);
      else path.lineTo(x, h * f);
    });
    return path;
  }, [kind, width, h]);
  return (
    <View
      style={[styles.preview, { height: h }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {kind === 'split' ? (
        <View style={styles.split}>
          <View style={[styles.segment, styles.previewPart, { flex: 3 }]} />
          <View style={[styles.segment, styles.previewRest, { flex: 1 }]} />
        </View>
      ) : width > 0 ? (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <Line p1={vec(0, h - stroke.hairline)} p2={vec(width, h - stroke.hairline)} color={colors.line} strokeWidth={stroke.hairline} />
          {kind === 'trend' && trend ? (
            <Path path={trend} style="stroke" strokeWidth={stroke.medium} strokeCap="round" strokeJoin="round" color={colors.control} />
          ) : null}
          {kind === 'bars'
            ? [0.4, 0.7, 0.25, 0.9, 0.5, 0.6, 0.8].map((f, i) => {
                const col = width / 7;
                const barW = Math.min(col * 0.3, space.md);
                return (
                  <RoundedRect key={i} x={col * i + (col - barW) / 2} y={h - h * f} width={barW} height={h * f - stroke.hairline} r={radius.pill} color={colors.control} />
                );
              })
            : null}
        </Canvas>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { ...type.caption, ...type.tabular, color: colors.muted, position: 'absolute', left: 0 },
  bestLabel: { ...type.caption, color: colors.accent, position: 'absolute' },
  tip: {
    position: 'absolute',
    top: 0,
    width: size.tooltip,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    padding: space.sm,
  },
  tipDate: { ...type.caption, color: colors.muted },
  tipSpeed: { ...type.h2, ...type.tabular, color: colors.accent },
  tipUnit: { ...type.caption, color: colors.muted },
  tipRange: { ...type.caption, ...type.tabular, color: colors.text },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs },
  endText: { ...type.caption, color: colors.muted, flexShrink: 1 },
  hint: { ...type.caption, color: colors.muted, marginTop: space.sm },
  row: { flexDirection: 'row' },
  barCount: { ...type.caption, ...type.tabular, color: colors.muted, position: 'absolute', textAlign: 'center' },
  barDay: { ...type.caption, color: colors.muted, flex: 1, textAlign: 'center', marginTop: space.xs },
  barToday: { color: colors.text },
  split: {
    flexDirection: 'row',
    height: space.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
    gap: stroke.medium,
    backgroundColor: colors.line,
  },
  segment: { height: space.sm },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs, marginTop: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: size.target / 2 },
  swatch: { width: space.sm, height: space.sm, borderRadius: radius.pill },
  legendLabel: { ...type.caption, color: colors.text },
  legendValue: { ...type.caption, ...type.tabular, color: colors.text, fontWeight: '700' },
  legendShare: { ...type.caption, ...type.tabular, color: colors.muted },
  preview: { opacity: opacity.inactive, justifyContent: 'center' },
  previewPart: { backgroundColor: colors.control },
  previewRest: { backgroundColor: colors.line },
});
