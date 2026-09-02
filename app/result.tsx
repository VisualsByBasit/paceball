import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createPlayer, listPlayers, saveSession } from '../src/data';
import { computeSpeed, PITCH_LENGTH_M, type SpeedResult } from '../src/physics/computeSpeed';
import { colors, radius, space, type } from '../src/ui/tokens';
import type { Point } from '../src/types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function finiteNumber(value: string | string[] | undefined): number | null {
  const n = Number(first(value));
  return Number.isFinite(n) ? n : null;
}

function positiveNumber(value: string | string[] | undefined): number | null {
  const n = finiteNumber(value);
  return n !== null && n > 0 ? n : null;
}

function parsePoint(value: string | string[] | undefined): Point | null {
  const raw = first(value);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { x, y, frame } = parsed as Record<string, unknown>;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isInteger(frame)) return null;
    if ((frame as number) < 0) return null;
    return { x: x as number, y: y as number, frame: frame as number };
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Reuses the existing player, or opens one the first time a session is saved. */
async function resolvePlayerId(): Promise<string> {
  const players = await listPlayers();
  if (players.length > 0) return players[0].id;
  return (await createPlayer('You')).id;
}

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  const [showWorking, setShowWorking] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const videoPath = first(params.videoPath);
  const framesDir = first(params.framesDir);
  const fps = positiveNumber(params.fps);
  const frameCount = positiveNumber(params.frameCount);
  const exposureBias = finiteNumber(params.exposureBias);
  const imageWidth = positiveNumber(params.imageWidth);
  const imageHeight = positiveNumber(params.imageHeight);
  const videoWidth = positiveNumber(params.width);
  const videoHeight = positiveNumber(params.height);

  const calA = parsePoint(params.nearWicket);
  const calB = parsePoint(params.farWicket);
  const release = parsePoint(params.release);
  const bounce = parsePoint(params.bounce);

  const reading = useMemo((): { result: SpeedResult } | { error: string } => {
    if (!fps) return { error: 'The clip did not report a usable frame rate.' };
    if (!calA || !calB || !release || !bounce) {
      return { error: 'The four marked points did not survive the trip to this screen.' };
    }
    try {
      return {
        result: computeSpeed({
          calA,
          calB,
          release,
          bounce,
          calRealMetres: PITCH_LENGTH_M,
          fps,
        }),
      };
    } catch (e) {
      return { error: message(e) };
    }
  }, [fps, calA, calB, release, bounce]);

  /**
   * Points were marked on the extracted JPEGs, whose long edge the extractor
   * caps. Scale them back to the video's own resolution so the saved session's
   * width and height describe the space its points live in. Only the long edge
   * is used, so this holds whether or not the decoder rotated the frames.
   */
  const saveGeometry = useMemo(() => {
    if (!imageWidth || !imageHeight) return null;
    const imageLongEdge = Math.max(imageWidth, imageHeight);
    const videoLongEdge = Math.max(videoWidth ?? 0, videoHeight ?? 0);
    const k = videoLongEdge > 0 ? videoLongEdge / imageLongEdge : 1;

    const width = Math.ceil(imageWidth * k);
    const height = Math.ceil(imageHeight * k);
    const scale = (p: Point): Point => ({
      x: clamp(p.x * k, 0, width - 1),
      y: clamp(p.y * k, 0, height - 1),
      frame: p.frame,
    });
    return { width, height, scale };
  }, [imageWidth, imageHeight, videoWidth, videoHeight]);

  const result = 'result' in reading ? reading.result : null;

  const canSave =
    result !== null &&
    saveGeometry !== null &&
    saveStatus !== 'saving' &&
    saveStatus !== 'saved' &&
    !!videoPath &&
    !!framesDir &&
    fps !== null &&
    frameCount !== null &&
    exposureBias !== null &&
    !!calA &&
    !!calB &&
    !!release &&
    !!bounce;

  const onSave = useCallback(async () => {
    if (
      !canSave ||
      !result ||
      !saveGeometry ||
      !fps ||
      !frameCount ||
      exposureBias === null ||
      !calA ||
      !calB ||
      !release ||
      !bounce
    ) {
      return;
    }

    setSaveStatus('saving');
    setSaveError(null);
    try {
      const playerId = await resolvePlayerId();
      await saveSession({
        playerId,
        videoPath,
        framesDir,
        fps,
        frameCount: Math.round(frameCount),
        width: saveGeometry.width,
        height: saveGeometry.height,
        exposureBias,
        calibrationMethod: 'stumps',
        calA: saveGeometry.scale(calA),
        calB: saveGeometry.scale(calB),
        calRealMetres: PITCH_LENGTH_M,
        pixelsPerMetre: result.pixelsPerMetre,
        release: saveGeometry.scale(release),
        bounce: saveGeometry.scale(bounce),
        travelMetres: result.travelMetres,
        speedKmh: result.speedKmh,
        errorKmh: result.errorKmh,
        // Release speed and launch angle are modelled, not measured, so they
        // stay empty rather than being presented as readings.
        releaseSpeedKmh: null,
        releaseAngleDeg: null,
      });
      setSaveStatus('saved');
    } catch (e) {
      setSaveStatus('error');
      setSaveError(message(e));
    }
  }, [
    canSave,
    result,
    saveGeometry,
    videoPath,
    framesDir,
    fps,
    frameCount,
    exposureBias,
    calA,
    calB,
    release,
    bounce,
  ]);

  if (!result) {
    return (
      <View style={[styles.screen, styles.fallback, { paddingTop: insets.top }]}>
        <Text style={styles.fallbackTitle}>No reading</Text>
        <Text style={styles.fallbackBody}>
          {'error' in reading ? reading.error : 'Something went wrong.'}
        </Text>
        <Pressable style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Back to marking</Text>
        </Pressable>
      </View>
    );
  }

  // The ball is released past the crease and pitches short of the far stumps,
  // so a travel anywhere near the pitch length means the marks are wrong.
  const implausible = result.travelMetres >= PITCH_LENGTH_M;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg },
      ]}
    >
      <View style={styles.header}>
        {/* Saving moves the clip and its frames out of the cache, so going back
            to re-mark is no longer possible once it has been saved. */}
        {saveStatus === 'saved' ? null : (
          <Pressable onPress={() => router.back()} hitSlop={space.md}>
            <Text style={styles.headerAction}>Back</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>AVG SPEED TO BOUNCE</Text>
        <Text
          style={styles.heroNumber}
          allowFontScaling={false}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {result.speedKmh.toFixed(1)}
        </Text>
        <Text style={styles.heroUnit}>km / h</Text>
        <Text style={styles.heroError}>± {result.errorKmh} km/h</Text>
      </View>

      {implausible ? (
        <Text style={styles.note}>
          The ball reads as travelling {result.travelMetres.toFixed(1)} m before bouncing,
          which is the length of the whole pitch. Check the wicket marks are on both sets
          of stumps and the ball marks are on the ball.
        </Text>
      ) : null}

      <Pressable
        style={styles.workingToggle}
        onPress={() => setShowWorking((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={showWorking ? 'Hide the working' : 'Show the working'}
      >
        <Text style={styles.workingToggleText}>Show the working</Text>
        <Text style={styles.workingChevron}>{showWorking ? '−' : '+'}</Text>
      </Pressable>

      {showWorking ? (
        <View style={styles.working}>
          <Row
            label="Marked frames"
            value={`${release!.frame} → ${bounce!.frame}`}
          />
          <Row label="Frame delta" value={`${result.frameDelta} frames`} />
          <Row label="fps used" value={fps!.toFixed(2)} />
          <Row label="Flight time" value={`${result.seconds.toFixed(4)} s`} />
          <Row label="Pixels per metre" value={result.pixelsPerMetre.toFixed(2)} />
          <Row label="Ball travelled" value={`${result.travelMetres.toFixed(2)} m`} />
          <Text style={styles.workingFootnote}>
            Scaled against {PITCH_LENGTH_M} m between the stumps. The ball covers far less
            than that before it pitches.
          </Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

        <Pressable
          onPress={onSave}
          disabled={!canSave}
          style={[
            styles.primaryButton,
            saveStatus === 'saved' && styles.savedButton,
            !canSave && saveStatus !== 'saved' && styles.buttonOff,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Save this delivery"
        >
          {saveStatus === 'saving' ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text
              style={[
                styles.primaryButtonText,
                saveStatus === 'saved' && styles.savedButtonText,
              ]}
            >
              {saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Try again' : 'Save'}
            </Text>
          )}
        </Pressable>

        {saveStatus === 'saved' ? (
          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.replace('/')}
            accessibilityRole="button"
            accessibilityLabel="Finish"
          >
            <Text style={styles.secondaryButtonText}>Done</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/** The numbers are the hero, so they get a fixed-width face on both platforms. */
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, flexGrow: 1 },

  header: { flexDirection: 'row', alignItems: 'center' },
  headerAction: { ...type.caption, color: colors.muted },

  hero: { alignItems: 'center', paddingVertical: space.xl },
  heroLabel: { ...type.label, color: colors.muted, marginBottom: space.md },
  heroNumber: {
    ...type.hero,
    fontFamily: MONO,
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: { ...type.body, color: colors.muted, marginTop: space.xs },
  heroError: {
    ...type.h2,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    marginTop: space.md,
  },

  note: {
    ...type.caption,
    color: colors.warn,
    borderWidth: 1,
    borderColor: colors.warn,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },

  workingToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
    paddingVertical: space.md,
  },
  workingToggleText: { ...type.body, color: colors.text },
  workingChevron: { ...type.h2, color: colors.muted },

  working: { paddingTop: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  rowLabel: { ...type.caption, color: colors.muted },
  rowValue: {
    ...type.caption,
    color: colors.text,
    fontFamily: MONO,
    fontVariant: ['tabular-nums'],
  },
  workingFootnote: { ...type.caption, color: colors.muted, marginTop: space.sm },

  footer: { marginTop: 'auto', paddingTop: space.xl },
  error: { ...type.caption, color: colors.danger, marginBottom: space.md },

  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { ...type.body, color: colors.bg, fontWeight: '800' },
  savedButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  savedButtonText: { color: colors.muted },
  buttonOff: { opacity: 0.3 },

  secondaryButton: { paddingVertical: space.md, alignItems: 'center' },
  secondaryButtonText: { ...type.body, color: colors.text },

  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  fallbackTitle: { ...type.h2, color: colors.text, marginBottom: space.sm },
  fallbackBody: {
    ...type.body,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: space.lg,
  },
});
