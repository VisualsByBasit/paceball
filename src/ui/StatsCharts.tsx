import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Line,
  LinearGradient,
  Path,
  RoundedRect,
  Skia,
  vec,
  type SkPath,
} from '@shopify/react-native-skia';
import { interpolateColor } from 'react-native-reanimated';
import type { SpeedUnit } from '../settings/settings';
import { formatWhen } from './format';
import { monotoneControls, nearestIndex, percent, type DayCount, type SpeedPoint } from './stats';
import { colors, opacity, radius, size, space, stroke, type } from './tokens';
import { unitSpoken } from './units';

const LIME_LIT = interpolateColor(0.4, [0, 1], [colors.accent, colors.text]);
const LIME_SHADE = interpolateColor(0.4, [0, 1], [colors.accent, colors.bg]);
const WARN_SHADE = interpolateColor(0.4, [0, 1], [colors.warn, colors.bg]);

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

/**
 * Speed over time: every plausible measured reading, oldest to newest, as a
 * point on a smooth line with its own range as a translucent band around it.
 * The line is monotone between readings, so it never draws a speed beyond the
 * two it joins. Tap for a reading's date, speed and range; the list under the
 * chart says the same for a screen reader.
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

    const area = line.copy();
    area.lineTo(xs[xs.length - 1], bottom);
    area.lineTo(xs[0], bottom);
    area.close();
    return { lo, hi, xs, mid, line, band, area, left, right };
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
            {/* Grid: the top and foot of the scale. */}
            <Line p1={vec(geometry.left, top)} p2={vec(geometry.right, top)} color={colors.line} strokeWidth={stroke.hairline} />
            <Line p1={vec(geometry.left, bottom)} p2={vec(geometry.right, bottom)} color={colors.control} strokeWidth={stroke.hairline} />
            <Path path={geometry.area} opacity={opacity.faint}>
              <LinearGradient start={vec(0, top)} end={vec(0, bottom)} colors={[colors.accent, 'transparent']} />
            </Path>
            <Path path={geometry.band} color={colors.accent} opacity={opacity.band} />
            {points.length > 1 ? (
              <Group>
                <Path path={geometry.line} style="stroke" strokeWidth={stroke.heavy} strokeCap="round" color={colors.accent} opacity={opacity.inactive}>
                  <BlurMask blur={space.xs} style="normal" />
                </Path>
                <Path path={geometry.line} style="stroke" strokeWidth={stroke.medium} strokeCap="round" strokeJoin="round" color={colors.accent} />
              </Group>
            ) : null}
            {picked !== null ? (
              <Line p1={vec(geometry.xs[picked], top)} p2={vec(geometry.xs[picked], bottom)} color={colors.control} strokeWidth={stroke.hairline} />
            ) : null}
            {geometry.xs.map((x, i) => (
              <Group key={points[i].id}>
                <Circle cx={x} cy={geometry.mid[i]} r={space.xs + (i === picked ? stroke.heavy : 0)} color={colors.bg} />
                <Circle cx={x} cy={geometry.mid[i]} r={space.xs + (i === picked ? stroke.medium : 0)} color={i === picked ? colors.text : colors.accent} />
              </Group>
            ))}
          </Canvas>
        ) : null}
        {geometry ? (
          <>
            <Text style={[styles.axis, { top: top - space.sm }]}>{geometry.hi}</Text>
            <Text style={[styles.axis, { top: bottom - space.sm - space.xs }]}>{geometry.lo}</Text>
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
 * Deliveries per day for the last seven days, as lit bars: a count, never a
 * speed. A day with none shows a stub on the baseline, not a gap.
 */
export function DayBars({ days, narrowLabels }: { days: DayCount[]; narrowLabels: boolean }) {
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...days.map((d) => d.count));
  const h = size.bars;
  const col = width / Math.max(days.length, 1);
  const barW = Math.min(col * 0.55, space.xl);
  const label = (t: number) =>
    new Date(t).toLocaleDateString(undefined, { weekday: narrowLabels ? 'narrow' : 'short' });
  return (
    <View
      accessible
      accessibilityLabel={`Deliveries per day, last seven days. ${days
        .map((d) => `${new Date(d.start).toLocaleDateString(undefined, { weekday: 'long' })}: ${d.count}`)
        .join('. ')}.`}
    >
      <View style={styles.row} importantForAccessibility="no-hide-descendants">
        {days.map((d) => (
          <Text key={d.start} style={[styles.barCount, d.count === 0 && styles.barCountNone]}>
            {d.count}
          </Text>
        ))}
      </View>
      <View style={{ height: h }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            <Line p1={vec(0, h - stroke.hairline)} p2={vec(width, h - stroke.hairline)} color={colors.control} strokeWidth={stroke.hairline} />
            {days.map((d, i) => {
              const barH = d.count === 0 ? stroke.medium : Math.max((d.count / max) * (h - space.sm), space.sm);
              const x = col * i + (col - barW) / 2;
              const y = h - barH;
              return (
                <Group key={d.start}>
                  {d.count > 0 ? (
                    <RoundedRect x={x} y={y + space.xs} width={barW} height={barH - space.xs} r={radius.sm} color={colors.accent} opacity={opacity.faint}>
                      <BlurMask blur={space.sm} style="normal" />
                    </RoundedRect>
                  ) : null}
                  <RoundedRect x={x} y={y} width={barW} height={barH} r={d.count === 0 ? 0 : radius.sm} color={d.count === 0 ? colors.control : undefined}>
                    {d.count === 0 ? null : (
                      <LinearGradient start={vec(x, 0)} end={vec(x + barW, 0)} colors={[LIME_LIT, colors.accent, LIME_SHADE]} positions={[0, 0.35, 1]} />
                    )}
                  </RoundedRect>
                  {d.count > 0 ? (
                    <RoundedRect x={x + barW * 0.18} y={y + space.xs} width={barW * 0.14} height={Math.max(barH - space.sm, 0)} r={radius.pill} color={colors.text} opacity={opacity.band} />
                  ) : null}
                </Group>
              );
            })}
          </Canvas>
        ) : null}
      </View>
      <View style={styles.row} importantForAccessibility="no-hide-descendants">
        {days.map((d) => (
          <Text key={d.start} style={styles.barDay}>
            {label(d.start)}
          </Text>
        ))}
      </View>
    </View>
  );
}

/**
 * A share as a half dial: the track, and the share lit along it. The figure
 * and its name are words under the arc, so the colour is never the message.
 */
export function HalfGauge({ part, whole, label, tone }: { part: number; whole: number; label: string; tone: 'accent' | 'warn' }) {
  const w = size.halfGauge;
  const sw = w * 0.1;
  const r = w / 2 - sw;
  const h = w / 2 + sw;
  const share = whole > 0 ? part / whole : 0;
  const pct = percent(part, whole);
  const lit = tone === 'accent' ? colors.accent : colors.warn;
  const shade = tone === 'accent' ? LIME_SHADE : WARN_SHADE;
  const arcs = useMemo(() => {
    const oval = Skia.XYWHRect(w / 2 - r, sw, r * 2, r * 2);
    const track = Skia.Path.Make();
    track.addArc(oval, 180, 180);
    const value = Skia.Path.Make();
    if (share > 0) value.addArc(oval, 180, Math.max(180 * share, 1));
    return { track, value };
  }, [w, r, sw, share]);
  return (
    <View style={styles.gauge} accessible accessibilityLabel={`${label}: ${pct} percent, ${part} of ${whole}.`}>
      <View style={{ width: w, height: h }}>
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path path={arcs.track} style="stroke" strokeWidth={sw} strokeCap="round" color={colors.line} />
          {share > 0 ? (
            <Group>
              <Path path={arcs.value} style="stroke" strokeWidth={sw} strokeCap="round" color={lit} opacity={opacity.inactive}>
                <BlurMask blur={sw * 0.6} style="normal" />
              </Path>
              <Path path={arcs.value} style="stroke" strokeWidth={sw} strokeCap="round">
                <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={[lit, shade]} />
              </Path>
            </Group>
          ) : null}
        </Canvas>
        <Text style={styles.gaugeValue}>{pct}%</Text>
      </View>
      <Text style={styles.gaugeLabel}>{label}</Text>
      <Text style={styles.gaugeCount}>
        {part} of {whole}
      </Text>
    </View>
  );
}

/** Measured against no speed, as a ring: the measured share in lime, the rest in grey. */
export function MeasuredDonut({ measured, noSpeed }: { measured: number; noSpeed: number }) {
  const d = size.donut;
  const sw = d * 0.13;
  const total = measured + noSpeed;
  const share = total > 0 ? measured / total : 0;
  const rings = useMemo(() => {
    const oval = Skia.XYWHRect(sw / 2, sw / 2, d - sw, d - sw);
    const on = Skia.Path.Make();
    const off = Skia.Path.Make();
    if (share >= 1) on.addOval(oval);
    else if (share <= 0) off.addOval(oval);
    else {
      on.addArc(oval, -90, 360 * share);
      off.addArc(oval, -90 + 360 * share, 360 * (1 - share));
    }
    return { on, off };
  }, [d, sw, share]);
  return (
    <View style={{ width: d, height: d }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path path={rings.off} style="stroke" strokeWidth={sw} color={colors.control} />
        {share > 0 ? (
          <Group>
            <Path path={rings.on} style="stroke" strokeWidth={sw} color={colors.accent} opacity={opacity.inactive}>
              <BlurMask blur={sw * 0.5} style="normal" />
            </Path>
            <Path path={rings.on} style="stroke" strokeWidth={sw}>
              <LinearGradient start={vec(0, 0)} end={vec(d, d)} colors={[LIME_LIT, colors.accent, LIME_SHADE]} />
            </Path>
          </Group>
        ) : null}
      </Canvas>
      <View style={styles.donutCenter}>
        <Text style={styles.donutValue}>{percent(measured, total)}%</Text>
        <Text style={styles.donutCaption}>measured</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { ...type.caption, ...type.tabular, color: colors.muted, position: 'absolute', left: 0 },
  tip: {
    position: 'absolute',
    top: 0,
    width: size.tooltip,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.control,
    padding: space.sm,
  },
  tipDate: { ...type.caption, color: colors.muted },
  tipSpeed: { ...type.h2, ...type.mono, color: colors.accent },
  tipUnit: { ...type.caption, color: colors.muted },
  tipRange: { ...type.caption, ...type.mono, color: colors.text },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs },
  endText: { ...type.caption, color: colors.muted, flexShrink: 1 },
  hint: { ...type.caption, color: colors.muted, marginTop: space.sm },
  row: { flexDirection: 'row' },
  barCount: { ...type.caption, ...type.tabular, color: colors.text, flex: 1, textAlign: 'center', marginBottom: space.xs },
  barCountNone: { color: colors.muted },
  barDay: { ...type.caption, color: colors.muted, flex: 1, textAlign: 'center', marginTop: space.xs },
  gauge: { alignItems: 'center', flexShrink: 1 },
  gaugeValue: {
    ...type.h2,
    ...type.tabular,
    color: colors.text,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    textAlign: 'center',
  },
  gaugeLabel: { ...type.body, color: colors.text, marginTop: space.xs, textAlign: 'center' },
  gaugeCount: { ...type.caption, ...type.tabular, color: colors.muted, textAlign: 'center' },
  donutCenter: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  donutValue: { ...type.h2, ...type.tabular, color: colors.text },
  donutCaption: { ...type.caption, color: colors.muted },
});
