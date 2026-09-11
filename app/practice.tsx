import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { computeSpeed, PITCH_LENGTH_M } from '../src/physics/computeSpeed';
import { CountUpReading } from '../src/ui/motion/CountUpReading';
import { DetentStrip } from '../src/ui/motion/DetentStrip';
import { PathDots, pointsAlong } from '../src/ui/motion/PathDots';
import { colors, opacity, radius, space, stroke, type } from '../src/ui/tokens';

/**
 * THROWAWAY. Reanimated practice — delete before production, same as
 * debug.tsx. Nothing here is a feature.
 *
 * The three components live in src/ui/motion and are what Mark and Result will
 * use. This screen only gives them somewhere to be poked. Delete this file,
 * not those.
 */

const DEMO_FPS = 59.94;
const DEMO_PIXELS_PER_METRE = 50;
const STRIP_COUNTS = [12, 30, 90];
const PATH_DOTS = 9;

/**
 * A made-up delivery run through the real formula, so the demo's error range
 * comes from its own frame delta the way a real reading's does.
 */
function demoReading() {
  const frameDelta = 17 + Math.floor(Math.random() * 6);
  const travelMetres = 10 + Math.random() * 2;
  const px = (metres: number) => metres * DEMO_PIXELS_PER_METRE;
  const result = computeSpeed({
    calA: { x: 0, y: 0, frame: 0 },
    calB: { x: px(PITCH_LENGTH_M), y: 0, frame: 0 },
    release: { x: 0, y: px(1), frame: 0 },
    bounce: { x: px(travelMetres), y: px(1), frame: frameDelta },
    calRealMetres: PITCH_LENGTH_M,
    fps: DEMO_FPS,
  });
  return result;
}

export default function PracticeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [reading, setReading] = useState(demoReading);
  const [readingRun, setReadingRun] = useState(0);

  const [count, setCount] = useState(STRIP_COUNTS[1]);
  const [index, setIndex] = useState(0);

  const [box, setBox] = useState({ w: 0, h: 0 });
  const [pathRun, setPathRun] = useState(0);
  // Stand-ins for a release mark and a bounce mark on a frame.
  const path = useMemo(
    () =>
      box.w === 0
        ? []
        : pointsAlong(
            { x: box.w * 0.18, y: box.h * 0.3 },
            { x: box.w * 0.82, y: box.h * 0.72 },
            PATH_DOTS
          ),
    [box]
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg },
      ]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={space.md}>
          <Text style={styles.headerAction}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>PRACTICE · REANIMATED</Text>
      </View>

      <Section
        title="COUNT-UP"
        note="Lands on the reading without passing it, then the error range arrives."
        onReplay={() => {
          setReading(demoReading());
          setReadingRun((n) => n + 1);
        }}
      >
        <View style={styles.reading}>
          <Text style={styles.readingLabel}>AVG SPEED TO BOUNCE</Text>
          <CountUpReading
            key={readingRun}
            value={reading.speedKmh}
            decimals={1}
            style={styles.readingNumber}
            allowFontScaling={false}
          >
            <Text style={styles.readingUnit}>km / h</Text>
            <Text style={styles.readingError}>± {reading.errorKmh} km/h</Text>
          </CountUpReading>
          <Text style={styles.readingWorking}>
            demo · {reading.travelMetres.toFixed(2)} m in {reading.frameDelta} frames at{' '}
            {DEMO_FPS} fps
          </Text>
        </View>
      </Section>

      <Section
        title="DETENT STRIP"
        note="Drag, or flick and let go. One tick per item crossed; the playhead lags a little and lands with one overshoot."
      >
        <View style={styles.segment}>
          {STRIP_COUNTS.map((n) => {
            const on = n === count;
            return (
              <Pressable
                key={n}
                onPress={() => {
                  setCount(n);
                  setIndex((i) => Math.min(i, n - 1));
                }}
                style={[styles.segmentItem, on && styles.segmentItemOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${n} items`}
              >
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{n}</Text>
              </Pressable>
            );
          })}
        </View>

        <DetentStrip
          count={count}
          index={index}
          onChange={setIndex}
          accessibilityLabel="Practice strip"
        />

        <View style={styles.stepRow}>
          <StepButton
            label="−"
            accessibilityLabel="Previous item"
            disabled={index === 0}
            onPress={() => setIndex((i) => Math.max(0, i - 1))}
          />
          <Text style={styles.stepReadout}>
            {index}
            <Text style={styles.stepTotal}> / {count - 1}</Text>
          </Text>
          <StepButton
            label="+"
            accessibilityLabel="Next item"
            disabled={index >= count - 1}
            onPress={() => setIndex((i) => Math.min(count - 1, i + 1))}
          />
        </View>
      </Section>

      <Section
        title="PATH DOTS"
        note="Straight between the two marks — the flight is not tracked, so it is not drawn curved."
        onReplay={() => setPathRun((n) => n + 1)}
      >
        <View
          style={styles.pathBox}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setBox({ w: width, h: height });
          }}
        >
          {path.length > 0 ? <PathDots key={pathRun} points={path} /> : null}
        </View>
      </Section>
    </ScrollView>
  );
}

function Section({
  title,
  note,
  onReplay,
  children,
}: {
  title: string;
  note: string;
  onReplay?: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {onReplay ? (
          <Pressable
            onPress={onReplay}
            hitSlop={space.sm}
            accessibilityRole="button"
            accessibilityLabel={`Replay ${title.toLowerCase()}`}
          >
            <Text style={styles.replay}>Replay</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.sectionNote}>{note}</Text>
      {children}
    </View>
  );
}

function StepButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={space.sm}
      style={[styles.stepButton, disabled && styles.off]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={styles.stepButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  headerAction: { ...type.caption, color: colors.muted },
  headerTitle: { ...type.label, color: colors.muted },

  section: {
    borderTopWidth: stroke.hairline,
    borderColor: colors.line,
    paddingVertical: space.lg,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { ...type.label, color: colors.text },
  replay: { ...type.caption, color: colors.muted, textDecorationLine: 'underline' },
  sectionNote: { ...type.caption, color: colors.muted, marginTop: space.xs, marginBottom: space.md },

  reading: { alignItems: 'center', paddingVertical: space.md },
  readingLabel: { ...type.label, color: colors.muted, marginBottom: space.md },
  readingNumber: { ...type.hero, ...type.mono, color: colors.accent },
  readingUnit: { ...type.body, color: colors.muted, marginTop: space.xs },
  readingError: { ...type.h2, ...type.mono, color: colors.text, marginTop: space.md },
  readingWorking: {
    ...type.caption,
    ...type.mono,
    color: colors.muted,
    marginTop: space.lg,
    opacity: opacity.secondary,
  },

  segment: { flexDirection: 'row', marginBottom: space.md },
  segmentItem: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    marginRight: space.sm,
  },
  segmentItemOn: { backgroundColor: colors.text, borderColor: colors.text },
  segmentText: { ...type.caption, ...type.tabular, color: colors.muted },
  segmentTextOn: { color: colors.bg, fontWeight: '800' },

  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  stepButton: {
    width: space.xl,
    height: space.xl,
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonText: { ...type.h2, color: colors.text },
  stepReadout: { ...type.h2, ...type.tabular, color: colors.text },
  stepTotal: { ...type.caption, color: colors.muted },
  off: { opacity: opacity.disabled },

  pathBox: {
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
});
