import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createPlayer } from '../../src/data';
import { PITCH_LENGTH_M } from '../../src/physics/computeSpeed';
import { colors, opacity, radius, space, stroke, type } from '../../src/ui/tokens';

const REQUIREMENTS = [
  'Perpendicular to the pitch, square on — not standing down the line of it.',
  'Level with where the ball pitches, not level with either set of stumps.',
  'Both sets of stumps in frame for the whole delivery.',
];

/** Dots standing in for the ball between release and bounce. */
const BALL_DOTS = 9;

/**
 * Where the path sits along the strip, as a fraction of the pitch. The ball is
 * let go about 2 m past the crease and pitches 6–8 m short of the far stumps,
 * so it covers a bit over half the ruler it is measured against.
 */
const PATH_START = '12%';
const PATH_END = '36%';

const PITCH_HEIGHT = 68;
const STANDOFF_HEIGHT = 84;
const PHONE_WIDTH = 44;
const PHONE_HEIGHT = 12;
const LENS_SIZE = 4;
/** Gap between the lens and the pitch, which the cone fills. */
const CONE_HEIGHT = STANDOFF_HEIGHT - PHONE_HEIGHT - space.sm;
/** The cone leaves the phone at the lens and opens to the width of the pitch. */
const CONE_APEX_WIDTH = 12;

function Stumps() {
  return (
    <View style={styles.stumps}>
      <View style={styles.stump} />
      <View style={styles.stump} />
      <View style={styles.stump} />
    </View>
  );
}

/**
 * The shot, seen from above. Plain views rather than an image, so it inherits
 * the tokens and stays sharp at any density.
 *
 * The cone is a trapezoid built from a top border with transparent sides, and
 * borders are measured in pixels — hence measuring the pitch rather than laying
 * the cone out in percentages.
 */
function Diagram() {
  const [pitchWidth, setPitchWidth] = useState(0);
  const coneSpread = Math.max(0, (pitchWidth - CONE_APEX_WIDTH) / 2);

  return (
    <View
      style={styles.diagram}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        `Seen from above: a pitch with stumps at both ends, ${PITCH_LENGTH_M} metres apart, ` +
        'and the ball path along it. The phone sits 5 to 8 metres back from the middle of ' +
        'the pitch, square to it, with both sets of stumps inside its view.'
      }
    >
      <View style={styles.dimension}>
        <View style={styles.dimensionTick} />
        <View style={styles.dimensionLine} />
        <Text style={styles.dimensionLabel}>{PITCH_LENGTH_M} m</Text>
        <View style={styles.dimensionLine} />
        <View style={styles.dimensionTick} />
      </View>

      <View
        style={styles.pitch}
        onLayout={(e) => setPitchWidth(e.nativeEvent.layout.width)}
      >
        <Stumps />
        <View style={styles.ballPath}>
          {Array.from({ length: BALL_DOTS }, (_, i) => (
            <View key={i} style={styles.ballDot} />
          ))}
        </View>
        <Stumps />
      </View>

      <View style={styles.standoff}>
        {pitchWidth > 0 ? (
          <View
            style={[
              styles.cone,
              { borderLeftWidth: coneSpread, borderRightWidth: coneSpread },
            ]}
          />
        ) : null}

        <View style={styles.standoffDimension}>
          <View style={styles.standoffTick} />
          <View style={styles.standoffLine} />
          <View style={styles.standoffTick} />
        </View>
        <View style={styles.standoffLabelSlot}>
          <Text style={styles.standoffLabel}>5–8 m back</Text>
        </View>

        <View style={styles.phone}>
          <View style={styles.lens} />
        </View>
      </View>
    </View>
  );
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Setup 03 — where to stand, and how to frame the shot.
 *
 * Last in setup, because it only makes sense once the pitch has been named as
 * the ruler on the previous screen, and because it is the thing you act on as
 * you walk out to film. Like how-it-works it is reached two ways: with a `name`
 * param it closes onboarding and creates the profile; without one it is a
 * read-only reminder.
 */
export default function SetupCameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ name?: string }>();

  const name = (Array.isArray(params.name) ? params.name[0] : params.name)?.trim() ?? '';
  const isOnboarding = name.length > 0;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = useCallback(async () => {
    if (!isOnboarding) {
      router.back();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createPlayer(name);
      // Unwind setup before opening the camera, so Back from the camera does
      // not walk into onboarding again and offer to create a second profile.
      router.dismissAll();
      router.push('/capture');
    } catch (e) {
      setSaving(false);
      setError(message(e));
    }
  }, [isOnboarding, name, router]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: space.lg },
        ]}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={space.md}>
            <Text style={styles.headerAction}>Back</Text>
          </Pressable>
          {isOnboarding ? <Text style={styles.headerStep}>3 OF 3</Text> : null}
        </View>

        <Text style={styles.title}>Stand side-on to the pitch</Text>
        <Text style={styles.sub}>
          Paceball measures how far the ball travels and how long it takes. The pitch
          is the ruler — the {PITCH_LENGTH_M} m between the wickets is what turns
          pixels into metres. Filming from an angle distorts that ruler, so the number
          comes out wrong.
        </Text>

        <Diagram />

        <View style={styles.card}>
          <Text style={styles.cardLabel}>BEFORE YOU RECORD</Text>
          {REQUIREMENTS.map((line) => (
            <View key={line} style={styles.cardRow}>
              <Text style={styles.cardBullet}>—</Text>
              <Text style={styles.cardText}>{line}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.primaryButton, saving && styles.buttonOff]}
          onPress={onFinish}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={isOnboarding ? 'Create profile and start' : 'Done'}
        >
          {saving ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {isOnboarding ? `Start bowling as ${name}` : 'Got it'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xl,
  },
  headerAction: { ...type.caption, color: colors.muted },
  headerStep: { ...type.label, color: colors.muted },

  title: { ...type.h1, color: colors.text },
  sub: { ...type.body, color: colors.muted, marginTop: space.sm },

  diagram: { marginTop: space.xl, marginBottom: space.lg },

  // The ruler, called out above the strip it measures.
  dimension: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  dimensionTick: {
    width: stroke.hairline,
    height: space.sm + space.xs,
    backgroundColor: colors.muted,
    opacity: opacity.inactive,
  },
  dimensionLine: {
    flex: 1,
    height: stroke.hairline,
    backgroundColor: colors.muted,
    opacity: opacity.inactive,
  },
  dimensionLabel: {
    ...type.caption,
    ...type.mono,
    color: colors.accent,
    paddingHorizontal: space.sm,
  },

  pitch: {
    height: PITCH_HEIGHT,
    backgroundColor: colors.surface,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stumps: { gap: space.xs },
  stump: {
    width: stroke.medium + stroke.hairline,
    height: stroke.medium + stroke.hairline,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
  },

  ballPath: {
    position: 'absolute',
    left: PATH_START,
    right: PATH_END,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ballDot: {
    width: stroke.heavy,
    height: stroke.heavy,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },

  standoff: { height: STANDOFF_HEIGHT, alignItems: 'center' },
  cone: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: CONE_APEX_WIDTH,
    height: 0,
    borderTopWidth: CONE_HEIGHT,
    borderTopColor: colors.line,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },

  // The stand-off, measured beside the cone rather than through it.
  standoffDimension: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  standoffTick: {
    width: space.sm + space.xs,
    height: stroke.hairline,
    backgroundColor: colors.muted,
    opacity: opacity.inactive,
  },
  standoffLine: {
    flex: 1,
    width: stroke.hairline,
    backgroundColor: colors.muted,
    opacity: opacity.inactive,
  },
  standoffLabelSlot: {
    position: 'absolute',
    left: space.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  standoffLabel: {
    ...type.caption,
    color: colors.muted,
    // Punches a hole in the cone behind it so both stay readable.
    backgroundColor: colors.bg,
    paddingHorizontal: space.xs,
  },

  phone: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    width: PHONE_WIDTH,
    height: PHONE_HEIGHT,
    borderRadius: radius.sm,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  lens: {
    width: LENS_SIZE,
    height: LENS_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
    marginTop: stroke.medium,
  },

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

  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: stroke.hairline,
    borderColor: colors.line,
  },
  error: { ...type.caption, color: colors.danger, marginBottom: space.md },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { ...type.body, color: colors.bg, fontWeight: '800' },
  buttonOff: { opacity: opacity.disabled },
});
