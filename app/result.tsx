import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createPlayer, getActivePlayer, saveSession } from '../src/data';
import { SessionActions } from '../src/export/SessionActions';
import { restoredGeometry } from '../src/data/geometry';
import {
  CALIBRATION_SPECS,
  MARKER_SOURCE_SPECS,
  formatMetres,
  isCalibrationMethod,
  travelWarning,
} from '../src/physics/calibration';
import {
  computeSpeed,
  MARKING_LONG_EDGE_PX,
  type SpeedResult,
} from '../src/physics/computeSpeed';
import { referenceFraming, spanBetween } from '../src/capture/framing';
import { measurementState } from '../src/physics/measurementState';
import { canExportWithoutWatermark, useEntitlements } from '../src/purchases';
import { useSettings } from '../src/settings';
import { colors, opacity, radius, space, stroke, type } from '../src/ui/tokens';
import { errorIn, formatSpeed, unitLabel } from '../src/ui/units';
import type { CalibrationMethod, MarkConfidence, MarkerSource, Point } from '../src/types';

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

function parseCalibrationMethod(
  value: string | string[] | undefined
): CalibrationMethod | null {
  const raw = first(value);
  return isCalibrationMethod(raw) ? raw : null;
}

function parseMarkConfidence(
  value: string | string[] | undefined
): MarkConfidence | null {
  const raw = first(value);
  return raw === 'seen' || raw === 'uncertain' || raw === 'guessed' ? raw : null;
}

function parseMarkerSource(
  value: string | string[] | undefined
): MarkerSource | null {
  const raw = first(value);
  return raw === 'measured' || raw === 'paced-measured-shoe' || raw === 'paced-shoe-size'
    ? raw
    : null;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * The delivery belongs to the active player — with more than one profile, the
 * first on file is not necessarily the one bowling. Setup creates the profile,
 * so this normally just reads it back. The fallback only fires if a reading
 * somehow reaches this screen with no player on file at all, where opening one
 * beats losing the delivery.
 */
async function resolvePlayerId(): Promise<string> {
  const active = await getActivePlayer();
  if (active) return active.id;
  return (await createPlayer('You')).id;
}

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  const [showWorking, setShowWorking] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const savingRef = useRef(false);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (savingRef.current) return true;
      if (savedId) { router.dismissAll(); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [savedId, router]));

  // Display only. The reading is computed and saved in km/h whatever this says.
  const { unit } = useSettings();
  // Read when the card is made, never stored with the delivery.
  const entitlements = useEntitlements();

  const videoPath = first(params.videoPath);
  const framesDir = first(params.framesDir);
  const fps = positiveNumber(params.fps);
  const frameCount = positiveNumber(params.frameCount);
  const exposureBias = finiteNumber(params.exposureBias);
  const imageWidth = positiveNumber(params.imageWidth);
  const imageHeight = positiveNumber(params.imageHeight);
  const videoWidth = positiveNumber(params.width);
  const videoHeight = positiveNumber(params.height);

  // The scale reference the marks were placed against. There is no default
  // worth falling back on — assuming a pitch would rescale the whole reading.
  const calibrationMethod = parseCalibrationMethod(params.calibrationMethod);
  const calRealMetres = positiveNumber(params.calRealMetres);
  const spec = calibrationMethod ? CALIBRATION_SPECS[calibrationMethod] : null;

  const calA = parsePoint(params.calA);
  const calB = parsePoint(params.calB);
  const release = parsePoint(params.release);
  const bounce = parsePoint(params.bounce);

  // What the bounce mark was worth. Never defaulted to 'seen' — assuming the
  // ball was visible is exactly the claim this field exists to stop.
  const markConfidence = parseMarkConfidence(params.markConfidence);

  // How a markers distance was established, and the paces behind it. Absent for
  // every other method, and absent on a taped distance.
  const markerSource = parseMarkerSource(params.markerSource);
  const paceCount = positiveNumber(params.paceCount);

  const reading = useMemo((): { result: SpeedResult } | { error: string } => {
    if (!fps) return { error: 'The clip did not report a usable frame rate.' };
    if (!calA || !calB || !release || !bounce) {
      return { error: 'The four marked points did not survive the trip to this screen.' };
    }
    if (!calibrationMethod || calRealMetres === null) {
      return { error: 'The scale reference did not survive the trip to this screen.' };
    }
    if (markConfidence === null) {
      return { error: 'The bounce mark did not say how well it was seen.' };
    }
    try {
      return {
        result: computeSpeed({
          calA,
          calB,
          release,
          bounce,
          calRealMetres,
          fps,
          calibrationMethod,
          // Narrows the reference term from the pessimistic 5% a markers
          // reading falls back to when nothing recorded how it was measured.
          markerSource: markerSource ?? undefined,
          markConfidence,
          // The points are still in the extracted JPEG's pixel space here, so
          // the default sigma is already in the right space.
        }),
      };
    } catch (e) {
      return { error: message(e) };
    }
  }, [
    fps,
    calA,
    calB,
    release,
    bounce,
    calibrationMethod,
    calRealMetres,
    markerSource,
    markConfidence,
  ]);

  /**
   * Points were marked on the extracted JPEGs, whose long edge the extractor
   * caps. Scale them back to the video's own resolution so the saved session's
   * width and height describe the space its points live in. Only the long edge
   * is used, so this holds whether or not the decoder rotated the frames.
   */
  const saveGeometry = useMemo(() => {
    if (!imageWidth || !imageHeight || !videoWidth || !videoHeight) return null;
    return restoredGeometry(imageWidth, imageHeight, videoWidth, videoHeight);
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
    !!calibrationMethod &&
    calRealMetres !== null &&
    markConfidence !== null &&
    !!calA &&
    !!calB &&
    !!release &&
    !!bounce;

  const onSave = useCallback(async () => {
    if (
      savingRef.current ||
      !canSave ||
      !result ||
      !saveGeometry ||
      !fps ||
      !frameCount ||
      exposureBias === null ||
      !calibrationMethod ||
      calRealMetres === null ||
      markConfidence === null ||
      !calA ||
      !calB ||
      !release ||
      !bounce
    ) {
      return;
    }

    savingRef.current = true;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const playerId = await resolvePlayerId();
      const saved = await saveSession({
        playerId,
        videoPath,
        framesDir,
        fps,
        frameCount: Math.round(frameCount),
        width: saveGeometry.width,
        height: saveGeometry.height,
        exposureBias,
        calibrationMethod,
        // Only meaningful for markers, and a pace count only for a paced one.
        // The data layer rejects either anywhere else.
        ...(calibrationMethod === 'markers' && markerSource ? { markerSource } : {}),
        ...(calibrationMethod === 'markers' &&
        markerSource !== null &&
        markerSource !== 'measured' &&
        paceCount !== null
          ? { paceCount }
          : {}),
        calA: saveGeometry.scale(calA),
        calB: saveGeometry.scale(calB),
        calRealMetres,
        pixelsPerMetre: result.pixelsPerMetre * saveGeometry.factor,
        release: saveGeometry.scale(release),
        bounce: saveGeometry.scale(bounce),
        markConfidence,
        travelMetres: result.travelMetres,
        // Both null when the bounce was guessed. The delivery is still kept —
        // the clip, the marks and the scale — it just carries no reading.
        speedKmh: result.speedKmh,
        errorKmh: result.errorKmh,
        // Timing, reference length and both pixel markings, combined.
        uncertaintyModelVersion: 2,
        // Release speed and launch angle are modelled, not measured, so they
        // stay empty rather than being presented as readings.
        releaseSpeedKmh: null,
        releaseAngleDeg: null,
      });
      setSavedId(saved.id);
      setSaveStatus('saved');
    } catch (e) {
      setSaveStatus('error');
      setSaveError(message(e));
    } finally {
      savingRef.current = false;
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
    calibrationMethod,
    calRealMetres,
    markerSource,
    paceCount,
    markConfidence,
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

  // Read the same way History and Analysis read the saved delivery, so the range
  // shown here is the range those screens will show. Nothing is saved yet, so the
  // points are still in the extracted frame's own space, where the marking scale
  // is 1 by definition — the frame's size stands in if it did not survive.
  const state = measurementState({
    speedKmh: result.speedKmh,
    markConfidence: markConfidence!,
    calA: calA!,
    calB: calB!,
    release: release!,
    bounce: bounce!,
    width: imageWidth ?? MARKING_LONG_EDGE_PX,
    height: imageHeight ?? MARKING_LONG_EDGE_PX,
    calibrationMethod: calibrationMethod!,
    markerSource: markerSource ?? undefined,
  });

  // Everything downstream of the bounce mark — the flight time, the frame
  // delta and the distance travelled — is only worth as much as that mark.
  const measured = state.kind === 'measured';

  // How much of the frame's width the two calibration marks spanned, in the
  // space they were marked in.
  const framing =
    calA && calB && imageWidth ? referenceFraming(spanBetween(calA, calB), imageWidth) : null;

  // Measured against the ruler that was actually chosen. Warning on the pitch
  // length alone never fired for markers, ball or height.
  const warning = travelWarning(result.travelMetres, calRealMetres!, calibrationMethod!);

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
          <Pressable disabled={saveStatus === 'saving'} onPress={() => router.back()} hitSlop={space.md}>
            <Text style={styles.headerAction}>Back</Text>
          </Pressable>
        )}
      </View>

      {state.kind === 'unusable' ? (
        <View style={styles.unmeasured}>
          <Text style={styles.unmeasuredTitle}>This delivery can't be measured from these marks</Text>
          <Text style={styles.unmeasuredBody}>
            The marks don't hold enough to put an error range on the speed, and a
            speed without its range is not a reading. Paceball will not show one.
          </Text>
          <Pressable
            style={styles.remarkButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back and re-mark the delivery"
          >
            <Text style={styles.remarkButtonText}>Re-mark the delivery</Text>
          </Pressable>
        </View>
      ) : state.kind === 'not-seen' ? (
        <View style={styles.unmeasured}>
          <Text style={styles.unmeasuredTitle}>The bounce wasn't seen</Text>
          <Text style={styles.unmeasuredBody}>
            You marked the bounce without being able to see the ball in that frame.
            The flight time is read from that frame, so any speed taken from it
            would be invented rather than measured. Paceball will not show one.
          </Text>
          <Text style={styles.unmeasuredBody}>
            Go back and re-mark it if you can find the frame the ball lands on. You
            can still save the delivery to keep the clip and the marks — it will
            carry no speed, and it stays out of your trend.
          </Text>
          <Pressable
            style={styles.remarkButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back and re-mark the bounce"
          >
            <Text style={styles.remarkButtonText}>Re-mark the bounce</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>AVG SPEED TO BOUNCE</Text>
          <Text
            style={styles.heroNumber}
            allowFontScaling={false}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatSpeed(state.speedKmh, unit)}
          </Text>
          <Text style={styles.heroUnit}>{unitLabel(unit)}</Text>
          <Text style={styles.heroError}>
            ± {errorIn(state.errorKmh, unit)} {unitLabel(unit)}
          </Text>
        </View>
      )}

      {/* The warning quotes the travel figure, so on a guessed bounce it would
          leak the very number the rest of the screen is withholding. */}
      {warning && measured ? <Text style={styles.note}>{warning.message}</Text> : null}
      {/* Now the marks exist, how much of the frame the reference filled is
          known. Only worth saying where the reference is laid along the pitch:
          a ball or a standing bowler is small in frame by nature. */}
      {framing && !framing.tight && spec!.rulerBoundsTravel && measured ? (
        <Text style={styles.note}>
          Your reference filled about {Math.round(framing.fraction * 100)}% of the frame. The
          scale comes from that one distance, so a reference this small in frame can read low
          by more than the range above allows for. Stand so both ends sit near the edges next
          time.
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
          {measured ? (
            <Row label="Frame delta" value={`${result.frameDelta} frames`} />
          ) : null}
          <Row label="fps used" value={fps!.toFixed(2)} />
          {measured ? (
            <Row label="Flight time" value={`${result.seconds.toFixed(4)} s`} />
          ) : null}
          <Row
            label="Scale reference"
            value={`${spec!.short} · ${formatMetres(calRealMetres!)}`}
          />
          {markerSource ? (
            <Row
              label="Distance from"
              value={
                paceCount === null
                  ? MARKER_SOURCE_SPECS[markerSource].short
                  : `${paceCount} paces · ${MARKER_SOURCE_SPECS[markerSource].short}`
              }
            />
          ) : null}
          <Row label="Pixels per metre" value={result.pixelsPerMetre.toFixed(2)} />
          {measured ? (
            <Row label="Ball travelled" value={`${result.travelMetres.toFixed(2)} m`} />
          ) : (
            <Text style={styles.workingFootnote}>
              {state.kind === 'not-seen'
                ? 'Frame delta, flight time and distance travelled are not shown. Each is measured from the bounce mark, and that frame was guessed — they would be as invented as the speed. All three are still saved with the delivery.'
                : 'Frame delta, flight time and distance travelled are not shown. They come from the same marks that cannot produce a reading, so they are worth no more than the speed would be.'}
            </Text>
          )}
          <Text style={styles.workingFootnote}>
            Scaled against {formatMetres(calRealMetres!)} — {spec!.detail.toLowerCase()} The
            ball's own travel is measured with that scale, not assumed from it.
          </Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        {/* Nothing to put on a share card without a measured speed. Pro's card
            is clean, as it is in Analysis; everyone else's carries the mark. */}
        {savedId && measured ? (
          <SessionActions
            sessionId={savedId}
            watermark={!canExportWithoutWatermark(entitlements)}
          />
        ) : null}
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
            onPress={() => router.dismissAll()}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, flexGrow: 1 },

  header: { flexDirection: 'row', alignItems: 'center' },
  headerAction: { ...type.caption, color: colors.muted },

  hero: { alignItems: 'center', paddingVertical: space.xl },
  heroLabel: { ...type.label, color: colors.muted, marginBottom: space.md },
  heroNumber: {
    ...type.hero,
    ...type.mono,
    color: colors.accent,
  },
  heroUnit: { ...type.body, color: colors.muted, marginTop: space.xs },
  heroError: {
    ...type.h2,
    ...type.mono,
    color: colors.text,
    marginTop: space.md,
  },

  unmeasured: {
    borderWidth: stroke.hairline,
    borderColor: colors.warn,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.xl,
    marginBottom: space.md,
  },
  unmeasuredTitle: { ...type.h2, color: colors.warn, marginBottom: space.sm },
  unmeasuredBody: { ...type.body, color: colors.text, marginBottom: space.sm },
  remarkButton: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.text,
    paddingVertical: space.sm,
    alignItems: 'center',
    marginTop: space.xs,
  },
  remarkButtonText: { ...type.body, color: colors.text, fontWeight: '800' },

  note: {
    ...type.caption,
    color: colors.warn,
    borderWidth: stroke.hairline,
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
    ...type.mono,
    color: colors.text,
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
  savedButton: { backgroundColor: colors.surface, borderWidth: stroke.hairline, borderColor: colors.line },
  savedButtonText: { color: colors.muted },
  buttonOff: { opacity: opacity.disabled },

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
