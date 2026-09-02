import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useVideoOutput,
} from 'react-native-vision-camera';
import {
  CAPTURE_EXPOSURE,
  CAPTURE_FPS,
  MIN_RECORDING_MS,
  useCapture,
  type CaptureResult,
} from '../src/capture/useCapture';
import { Screen } from '../src/ui/Screen';
import { colors, radius, space, type } from '../src/ui/tokens';

const TIPS = [
  'Stand side-on to the pitch, level with the bounce.',
  'Keep both sets of stumps in frame the whole delivery.',
  'Shoot in bright, even light. Avoid shooting into the sun.',
];

function formatElapsed(ms: number): string {
  const seconds = ms / 1000;
  return `${seconds.toFixed(1)}s`;
}

export default function CaptureScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
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
          exposureBias: String(CAPTURE_EXPOSURE),
        },
      });
    },
    [router]
  );

  const capture = useCapture(videoOutput, { onFinished });

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  if (!hasPermission) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.h2}>Camera access needed</Text>
        <Text style={styles.body}>
          Paceball measures from video recorded on this phone. Nothing leaves the
          device.
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
        exposure={sessionReady ? CAPTURE_EXPOSURE : undefined}
        onStarted={() => setSessionReady(true)}
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
            onPress={isRecording ? capture.stop : capture.start}
            disabled={isProcessing || (isRecording && !canStop)}
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

  scrim: { backgroundColor: colors.bg, opacity: 0.75 },

  tipsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
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
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },

  errorCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
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
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  timerIdle: { color: colors.muted },

  shutter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: radius.pill,
    borderWidth: 3,
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
  shutterCoreLocked: { opacity: 0.45 },
  countdown: { ...type.h2, color: colors.text, fontVariant: ['tabular-nums'] },

  hint: { ...type.caption, color: colors.muted, marginTop: space.md },
});
