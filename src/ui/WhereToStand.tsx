import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Group, Line, LinearGradient, Path, RoundedRect, Skia, vec } from '@shopify/react-native-skia';
import { PITCH_LENGTH_M } from '../physics/computeSpeed';
import { Pitch3D, Stadium3D, Wicket3D } from './cricket3d';
import { placementLayout } from './placement';
import { colors, opacity, radius, scene, space, stroke, type } from './tokens';

/** The three things to get right before recording, in the order you check them. */
export const PLACEMENT_REQUIREMENTS = [
  'Perpendicular to the pitch, square on, not standing down the line of it.',
  'Level with where the ball pitches, not level with either set of stumps.',
  'Both sets of stumps in frame for the whole delivery.',
];

/**
 * The shot, in 3D: the pitch side-on under the floodlights with a wicket at
 * each end, 20.12 m apart, and the phone standing square to it 5 to 8 m back,
 * with its view opening to take in both sets of stumps. No ball and no path:
 * nothing on this picture was marked.
 */
export function PlacementDiagram({ width }: { width: number }) {
  const l = useMemo(() => placementLayout(width), [width]);
  const { phone } = l;
  const lensY = phone.y - phone.h / 2;

  const cone = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(phone.x, lensY);
    p.lineTo(l.wickets[0].x, l.pitchY - l.stumpH);
    p.lineTo(l.wickets[1].x, l.pitchY - l.stumpH);
    p.close();
    return p;
  }, [phone.x, lensY, l]);

  const standX = phone.x + phone.w / 2 + space.md;
  const nearEdge = l.pitchY + space.md;
  const screen = { x: phone.x - phone.w / 2 + stroke.heavy, y: phone.y - phone.h / 2 + stroke.heavy, w: phone.w - stroke.heavy * 2, h: phone.h - stroke.heavy * 2 };
  const corner = screen.h * 0.28;
  const guide = useMemo(() => {
    const p = Skia.Path.Make();
    const inset = screen.h * 0.18;
    const x0 = screen.x + inset;
    const y0 = screen.y + inset;
    const x1 = screen.x + screen.w - inset;
    const y1 = screen.y + screen.h - inset;
    p.moveTo(x0, y0 + corner * 0.6); p.lineTo(x0, y0); p.lineTo(x0 + corner * 0.6, y0);
    p.moveTo(x1 - corner * 0.6, y0); p.lineTo(x1, y0); p.lineTo(x1, y0 + corner * 0.6);
    p.moveTo(x0, y1 - corner * 0.6); p.lineTo(x0, y1); p.lineTo(x0 + corner * 0.6, y1);
    p.moveTo(x1 - corner * 0.6, y1); p.lineTo(x1, y1); p.lineTo(x1, y1 - corner * 0.6);
    return p;
  }, [screen.x, screen.y, screen.w, screen.h, corner]);

  return (
    <View
      style={[styles.diagram, { width, height: l.height }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        `Side-on, under floodlights: a pitch with stumps at both ends, ${PITCH_LENGTH_M} metres apart. ` +
        'The phone stands 5 to 8 metres back from the middle of the pitch, square to it, ' +
        'with both sets of stumps inside its view.'
      }
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Stadium3D width={width} height={l.height} horizon={l.cam.horizon} intensity={opacity.scrim} />
        <Pitch3D width={width} height={l.height} cam={l.cam} stumpZ={l.pitchZ} across />
        {l.wickets.map((w, i) => (
          <Wicket3D key={i} x={w.x} y={w.y} height={l.stumpH} />
        ))}

        {/* What the phone sees: opening from the phone to both sets of stumps. */}
        <Path path={cone} opacity={opacity.inactive}>
          <LinearGradient start={vec(0, lensY)} end={vec(0, l.pitchY - l.stumpH)} colors={[colors.text, 'transparent']} />
        </Path>

        {/* The ruler above the pitch, called out by its length. */}
        <Line p1={vec(l.ruler.from, l.ruler.y)} p2={vec(l.ruler.to, l.ruler.y)} color={colors.muted} strokeWidth={stroke.hairline} />
        {[l.ruler.from, l.ruler.to].map((x) => (
          <Line key={x} p1={vec(x, l.ruler.y - space.xs)} p2={vec(x, l.ruler.y + space.xs)} color={colors.muted} strokeWidth={stroke.hairline} />
        ))}

        {/* How far back: from the phone to the near side of the pitch. */}
        <Line p1={vec(standX, lensY)} p2={vec(standX, nearEdge)} color={colors.muted} strokeWidth={stroke.hairline} />
        {[lensY, nearEdge].map((y) => (
          <Line key={y} p1={vec(standX - space.xs, y)} p2={vec(standX + space.xs, y)} color={colors.muted} strokeWidth={stroke.hairline} />
        ))}

        {/* The phone, square to the pitch on a tripod, its screen showing the framing guide. */}
        <Group>
          <Line p1={vec(phone.x, phone.y + phone.h / 2)} p2={vec(phone.x - phone.w * 0.35, l.height)} color={scene.metalDark} strokeWidth={stroke.heavy} strokeCap="round" />
          <Line p1={vec(phone.x, phone.y + phone.h / 2)} p2={vec(phone.x + phone.w * 0.35, l.height)} color={scene.metalDark} strokeWidth={stroke.heavy} strokeCap="round" />
          <Line p1={vec(phone.x, phone.y + phone.h / 2)} p2={vec(phone.x, l.height)} color={scene.metal} strokeWidth={stroke.medium} strokeCap="round" />
          <RoundedRect x={phone.x - phone.w / 2} y={phone.y - phone.h / 2} width={phone.w} height={phone.h} r={radius.sm}>
            <LinearGradient
              start={vec(phone.x - phone.w / 2, phone.y - phone.h / 2)}
              end={vec(phone.x + phone.w / 2, phone.y + phone.h / 2)}
              colors={[scene.metal, scene.metalDark]}
            />
          </RoundedRect>
          <RoundedRect x={screen.x} y={screen.y} width={screen.w} height={screen.h} r={radius.sm - stroke.medium} color={scene.night} />
          <Path path={guide} style="stroke" strokeWidth={stroke.medium} strokeCap="round" color={colors.accent} />
        </Group>
      </Canvas>

      <Text style={[styles.rulerLabel, { top: l.ruler.y - space.lg, width }]}>{PITCH_LENGTH_M} m</Text>
      <Text style={[styles.standLabel, { left: standX + space.sm, top: (lensY + nearEdge) / 2 - space.sm }]}>
        5–8 m back
      </Text>
      <View style={[styles.hereRow, { top: phone.y + phone.h / 2 + space.sm, width }]}>
        <View style={styles.herePlate}>
          <Text style={styles.hereText}>Stand here</Text>
        </View>
      </View>
    </View>
  );
}

/** The whole "where to stand" guide: the picture, then the three things to check. */
export function WhereToStand() {
  const [width, setWidth] = useState(0);
  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? <PlacementDiagram width={width} /> : null}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>BEFORE YOU RECORD</Text>
        {PLACEMENT_REQUIREMENTS.map((line) => (
          <View key={line} style={styles.cardRow}>
            <Text style={styles.cardBullet}>-</Text>
            <Text style={styles.cardText}>{line}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  diagram: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    marginTop: space.lg,
    marginBottom: space.lg,
  },
  rulerLabel: { ...type.caption, ...type.mono, color: colors.accent, position: 'absolute', textAlign: 'center' },
  standLabel: { ...type.caption, color: colors.text, position: 'absolute' },
  hereRow: { position: 'absolute', alignItems: 'center' },
  herePlate: {
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.control,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  hereText: { ...type.label, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    padding: space.md,
  },
  cardLabel: { ...type.label, color: colors.muted, marginBottom: space.sm },
  cardRow: { flexDirection: 'row', marginTop: space.sm },
  cardBullet: { ...type.caption, color: colors.muted, marginRight: space.sm },
  cardText: { ...type.caption, color: colors.text, flex: 1 },
});
