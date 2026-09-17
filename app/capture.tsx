import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraDevices,
  useCameraPermission,
  useVideoOutput,
} from 'react-native-vision-camera';
import {
  CAPTURE_FPS,
  MIN_RECORDING_MS,
  useCapture,
  type CaptureResult,
} from '../src/capture/useCapture';
import { Screen } from '../src/ui/Screen';
import { captureExposure } from '../src/capture/exposure';
import { deviceForLens, hasUltraWide, LENS_LABEL, type Lens } from '../src/capture/lenses';
import { allowanceLine, canAnalyse, useEntitlements, usePurchases } from '../src/purchases';
import { useSettings } from '../src/settings';
import { colors, opacity, radius, space, stroke, type } from '../src/ui/tokens';

const TIPS = [
  'Stand side-on to the pitch, level with the bounce.',
  'Keep both sets of stumps in frame the whole delivery.',
  'Shoot in bright, even light. Avoid shooting into the sun.',
];

/** The day an allowance comes back, named as the phone names its weekdays. */
function weekdayOf(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { weekday: 'long' });
}

function formatElapsed(ms: number): string {
  const seconds = ms / 1000;
  return `${seconds.toFixed(1)}s`;
}

export default function CaptureScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { hasPermission, requestPermission } = useCameraPermission();
  const defaultDevice = useCameraDevice('back');
  // The whole pitch fits from closer on an ultra-wide, where the phone has one.
  // The option is only offered when such a camera really exists: the device
  // filter returns the nearest match rather than nothing, so it cannot be asked.
  const devices = useCameraDevices();
  const ultraWideAvailable = hasUltraWide(devices);
  const [lens, setLens] = useState<Lens>('wide');
  const device = deviceForLens(lens, devices, defaultDevice);
  const { exposureBias } = useSettings();
  const entitlements = useEntitlements();
  const { refreshAnalyses, isPro, allowance } = usePurchases();
  // Re-read on focus, so a delivery saved since this screen was last open
  // counts against the week.
  useEffect(() => {
    if (isFocused) refreshAnalyses();
  }, [isFocused, refreshAnalyses]);
  const allowed = canAnalyse(entitlements);
  // Pro is unlimited, so Pro is told nothing about limits anywhere.
  const allowanceNote = isPro ? null : allowanceLine(allowance, weekdayOf);
  const exposure = captureExposure(device, exposureBias);
  const [sessionReady, setSessionReady] = useState(false);
  const [showTips, setShowTips] = useState(true);

  const videoOutput = useVideoOutput({ fileType: 'mp4' });

  const onFinished = useCallback(
    ({ path, info }: CaptureResult) => {
      router.push({
        pathname: '/mark',
        params: {
          videoPath: path,
          // fps is read from the file, never assumed to be 60.
          fps: String(info.derivedFps),
          captureFps: String(info.captureFps),
          frameCount: String(info.frameCount),
          durationMs: String(info.durationMs),
          width: String(info.width),
          height: String(info.height),
          exposureBias: String(exposure ?? 0),
        },
      });
    },
    [router, exposure]
  );

  const capture = useCapture(videoOutput, { onFinished });

  // Tearing the session down on navigation rejects any in-flight control write.
  // That is expected; anything else is a real session error and stays loud.
  const onCameraError = useCallback((e: Error) => {
    if (/not active/i.test(e.message)) return;
    console.error(e);
  }, []);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  if (!hasPermission) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.h2}>Camera access needed</Text>
        <Text style={styles.body}>
          Paceball measures from video recorded on this phone, and never uploads
          your videos or measurements.
        </Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Grant access</Text>
        </Pressable>
      </Screen>
    );
  }

  if (!device) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.h2}>No back camera found</Text>
        <Text style={styles.body}>Paceball needs a rear camera to record.</Text>
      </Screen>
    );
  }

  const { isRecording, isProcessing, elapsedMs, remainingMs, canStop, error } =
    capture;
  const lockedSeconds = Math.ceil(remainingMs / 1000);

  let hint: string;
  if (isProcessing) hint = 'Reading the clip…';
  else if (!allowed) hint = 'Tap to see Pro.';
  else if (!isRecording) hint = `Tap to record · ${MIN_RECORDING_MS / 1000}s minimum`;
  else if (canStop) hint = 'Tap to stop';
  else hint = `Stop unlocks in ${lockedSeconds}s`;

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isFocused}
        outputs={[videoOutput]}
        constraints={[{ fps: CAPTURE_FPS }, { videoStabilizationMode: 'off' }]}
        exposure={isFocused && sessionReady ? exposure : undefined}
        onStarted={() => setSessionReady(true)}
        onStopped={() => setSessionReady(false)}
        onError={onCameraError}
      />

      {isProcessing ? <View style={[StyleSheet.absoluteFill, styles.scrim]} /> : null}

      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.top} pointerEvents="box-none">
          {!isRecording && !isProcessing && ultraWideAvailable ? (
            <View style={styles.lenses} accessibilityRole="radiogroup">
              {(['wide', 'ultra-wide'] as Lens[]).map((option) => {
                const on = option === lens;
                return (
                  <Pressable
                    key={option}
                    style={[styles.lens, on && styles.lensOn]}
                    onPress={() => setLens(option)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={
                      option === 'ultra-wide'
                        ? 'Ultra wide lens, 0.6x'
                        : 'Standard lens, 1x'
                    }
                  >
                    <Text style={[styles.lensText, on && styles.lensTextOn]}>
                      {LENS_LABEL[option]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {isRecording || isProcessing ? null : showTips ? (
            <View style={styles.tipsCard}>
              <View style={styles.tipsHeader}>
                <Text style={styles.label}>TIPS FOR BEST RESULTS</Text>
                <Pressable
                  onPress={() => setShowTips(false)}
                  hitSlop={space.md}
                  accessibilityLabel="Hide tips"
                >
                  <Text style={styles.tipsToggleText}>Hide</Text>
                </Pressable>
              </View>
              {TIPS.map((tip) => (
                <View key={tip} style={styles.tipRow}>
                  <Text style={styles.tipBullet}>—</Text>
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Pressable
              style={styles.tipsPill}
              onPress={() => setShowTips(true)}
              accessibilityLabel="Show tips"
            >
              <Text style={styles.tipsToggleText}>Tips</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.bottom} pointerEvents="box-none">
          {error ? (
            <Pressable
              style={styles.errorCard}
              onPress={capture.clearError}
              accessibilityRole="button"
              accessibilityLabel="Dismiss error"
            >
              <Text style={styles.errorText}>{error}</Text>
            </Pressable>
          ) : null}

          <View style={styles.timerRow}>
            {isRecording ? <View style={styles.recDot} /> : null}
            <Text style={[styles.timer, !isRecording && styles.timerIdle]}>
              {formatElapsed(isRecording ? elapsedMs : 0)}
            </Text>
          </View>

          <Pressable
            onPress={
              isRecording
                ? capture.stop
                : // The limit is checked at the moment of recording, so the clip
                  // is never taken and then refused.
                  allowed
                  ? capture.start
                  : () => router.push({ pathname: '/paywall', params: { context: 'limit' } })
            }
            disabled={!sessionReady || isProcessing || (isRecording && !canStop)}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
            style={styles.shutter}
          >
            <View
              style={[
                styles.shutterCore,
                isRecording ? styles.shutterCoreRecording : styles.shutterCoreIdle,
                isProcessing || (isRecording && !canStop)
                  ? styles.shutterCoreLocked
                  : null,
              ]}
            >
              {isRecording && !canStop ? (
                <Text style={styles.countdown}>{lockedSeconds}</Text>
              ) : null}
            </View>
          </Pressable>

          {allowanceNote ? (
            <Text style={[styles.hint, !allowed && styles.hintLimit]}>{allowanceNote}</Text>
          ) : null}
          <Text style={styles.hint}>{hint}</Text>
        </View>
      </View>
    </View>
  );
}

const SHUTTER_SIZE = 88;
const SHUTTER_CORE_SIZE = 68;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  top: { alignItems: 'stretch' },
  bottom: { alignItems: 'center' },

  h2: { ...type.h2, color: colors.text, marginBottom: space.sm },
  body: { ...type.body, color: colors.muted, textAlign: 'center' },
  label: { ...type.label, color: colors.muted },

  primaryButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    marginTop: space.lg,
  },
  primaryButtonText: { ...type.body, color: colors.bg, fontWeight: '800' },

  scrim: { backgroundColor: colors.bg, opacity: opacity.scrim },

  tipsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    padding: space.md,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  tipsToggleText: { ...type.caption, color: colors.muted },
  tipRow: { flexDirection: 'row', marginTop: space.xs },
  tipBullet: { ...type.caption, color: colors.muted, marginRight: space.sm },
  tipText: { ...type.caption, color: colors.text, flex: 1 },
  tipsPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },

  errorCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.danger,
    padding: space.md,
    marginBottom: space.md,
  },
  errorText: { ...type.caption, color: colors.danger },

  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.md,
  },
  recDot: {
    width: space.sm,
    height: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    marginRight: space.sm,
  },
  timer: {
    ...type.h1,
    ...type.tabular,
    color: colors.text,
  },
  timerIdle: { color: colors.muted },

  shutter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: radius.pill,
    borderWidth: stroke.heavy,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCore: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCoreIdle: {
    width: SHUTTER_CORE_SIZE,
    height: SHUTTER_CORE_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  shutterCoreRecording: {
    width: SHUTTER_CORE_SIZE * 0.6,
    height: SHUTTER_CORE_SIZE * 0.6,
    borderRadius: radius.sm,
    backgroundColor: colors.danger,
  },
  shutterCoreLocked: { opacity: opacity.disabled },
  countdown: { ...type.h2, ...type.tabular, color: colors.text },

  hint: { ...type.caption, color: colors.muted, marginTop: space.md },
  lenses: { flexDirection: 'row', alignSelf: 'center', marginBottom: space.md },
  lens: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    marginHorizontal: space.xs,
  },
  lensOn: { backgroundColor: colors.text, borderColor: colors.text },
  lensText: { ...type.caption, ...type.tabular, color: colors.text },
  lensTextOn: { color: colors.bg, fontWeight: '800' },
  // The allowance is worth reading at a glance once it has run out.
  hintLimit: { color: colors.warn },
});
