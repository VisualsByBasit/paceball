import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File } from 'expo-file-system';
import {
  Camera,
  useCameraDevice,
  useCameraDevices,
  useCameraPermission,
  useMicrophonePermission,
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
import { highBitRate, profileFrom } from '../src/capture/bitrate';
import { deviceForLens, hasUltraWide, LENS_LABEL, type Lens } from '../src/capture/lenses';
import {
  MICROPHONE_OFFER_ALLOW,
  MICROPHONE_OFFER_REASON,
  MICROPHONE_OFFER_SKIP,
  MICROPHONE_OFFER_TITLE,
  recordsSound,
  shouldOfferMicrophone,
} from '../src/capture/microphone';
import {
  allowanceLine,
  canAnalyse,
  canRecordHighBitrate,
  shouldShowOnboardingPaywall,
  useEntitlements,
  usePurchases,
} from '../src/purchases';
import { getSettings, updateSettings, useSettings } from '../src/settings';
import { colors, opacity, radius, space, stroke, type } from '../src/ui/tokens';

/**
 * A lens swap restarts the camera session, and on a real phone that takes far
 * longer than any fixed fade, and a different time on every phone. So the
 * preview fades out, stays dark under a "Switching lens" label while the session
 * restarts, and fades back in on the new lens's first preview frame. It is a
 * swap between two lenses, not a zoom ramp.
 */
const LENS_FADE_OUT_MS = 120;
const LENS_FADE_IN_MS = 180;
/** If the first frame is never reported, the preview comes back anyway. */
const LENS_SWAP_TIMEOUT_MS = 2000;

const TIPS = [
  'Stand side-on to the pitch, level with the bounce.',
  'Keep both sets of stumps in frame the whole delivery.',
  'Shoot in bright, even light. Avoid shooting into the sun.',
];

/** The day an allowance comes back, named as the phone names its weekdays. */
function weekdayOf(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { weekday: 'long' });
}

/** Bytes on disk, or null if the file cannot be read. */
function fileSize(path: string): number | null {
  try {
    const file = new File(path.startsWith('file://') ? path : `file://${path}`);
    return file.exists ? file.size : null;
  } catch {
    return null;
  }
}

function formatElapsed(ms: number): string {
  const seconds = ms / 1000;
  return `${seconds.toFixed(1)}s`;
}

export default function CaptureScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { hasPermission, requestPermission, canRequestPermission } = useCameraPermission();
  // Offered the first time Capture opens, never at launch and never from the
  // shutter. Refused or not, recording goes ahead; without it the clip is
  // simply video only.
  const microphone = useMicrophonePermission();
  const [offeringMicrophone, setOfferingMicrophone] = useState(false);
  // The microphone was held by something else (a call, a voice note) and a
  // recording fell back to video only. Kept for this visit, never saved.
  const [microphoneBusy, setMicrophoneBusy] = useState(false);
  const defaultDevice = useCameraDevice('back');
  // The whole pitch fits from closer on an ultra-wide, where the phone has one.
  // The option is only offered when such a camera really exists: the device
  // filter returns the nearest match rather than nothing, so it cannot be asked.
  const devices = useCameraDevices();
  const ultraWideAvailable = hasUltraWide(devices);
  const [lens, setLens] = useState<Lens>('wide');
  const device = deviceForLens(lens, devices, defaultDevice);

  /**
   * Swapping lenses restarts the camera session, so the preview blinks. It
   * cannot be avoided with a device swap, so it is made deliberate: fade out,
   * swap, hold dark under "Switching lens" until the new lens is streaming, fade
   * back in. The controls and the lens label sit outside this and stay visible.
   */
  const previewFade = useRef(new Animated.Value(1)).current;
  const [switchingLens, setSwitchingLens] = useState(false);
  const swapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The fade-out finishes 120 ms after a tap, possibly after the screen has
  // gone, and must not start the reveal timer then.
  const mounted = useRef(true);
  const revealPreview = useCallback(() => {
    if (swapTimeout.current === null) return;
    clearTimeout(swapTimeout.current);
    swapTimeout.current = null;
    setSwitchingLens(false);
    Animated.timing(previewFade, {
      toValue: 1,
      duration: LENS_FADE_IN_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [previewFade]);
  const chooseLens = useCallback(
    (next: Lens) => {
      if (next === lens || switchingLens) return;
      setSwitchingLens(true);
      Animated.timing(previewFade, {
        toValue: 0,
        duration: LENS_FADE_OUT_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        if (!mounted.current) return;
        setLens(next);
        // Waiting from here on for the new lens's first preview frame.
        swapTimeout.current = setTimeout(revealPreview, LENS_SWAP_TIMEOUT_MS);
      });
    },
    [lens, switchingLens, previewFade, revealPreview]
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (swapTimeout.current !== null) clearTimeout(swapTimeout.current);
    };
  }, []);
  const { exposureBias, lastRecording } = useSettings();
  const entitlements = useEntitlements();
  const { refreshAnalyses, isPro, allowance, configured, loading } = usePurchases();
  const [showGuide, setShowGuide] = useState(true);
  // Re-read on focus, so a delivery saved since this screen was last open
  // counts against the week.
  useEffect(() => {
    if (isFocused) refreshAnalyses();
  }, [isFocused, refreshAnalyses]);

  // The onboarding offer, one screen late. Setup does not wait for the store,
  // so an install whose entitlement had not arrived by the end of setup was
  // sent straight here with nothing offered and nothing marked shown. The same
  // conditions are weighed again as soon as the store answers, against the same
  // once ever flag, so the offer is deferred rather than lost.
  const offered = useRef(false);
  useEffect(() => {
    if (offered.current) return;
    const offer = shouldShowOnboardingPaywall({
      shown: getSettings().onboardingPaywallShown,
      isPro,
      configured,
      loading,
    });
    if (!offer) return;
    offered.current = true;
    // Recorded before it opens, so buying, skipping or closing the app on it
    // all count as the one time it is offered.
    updateSettings({ onboardingPaywallShown: true });
    // Replaced rather than pushed: the paywall returns to Capture itself when
    // it is dismissed, so pushing would leave a second Capture beneath it.
    router.replace({ pathname: '/paywall', params: { context: 'onboarding' } });
  }, [configured, isPro, loading, router]);
  const allowed = canAnalyse(entitlements);
  // Pro is unlimited, so Pro is told nothing about limits anywhere.
  const allowanceNote = isPro ? null : allowanceLine(allowance, weekdayOf);
  const exposure = captureExposure(device, exposureBias);

  // Pro records the same frames with less compression. The target is set
  // clearly above what this camera writes on its own default, measured from a
  // real recording. It is null until that has been measured, or when no target
  // clearly above it is possible, and then the camera keeps its own default and
  // nothing on screen claims Pro quality.
  const bitRate = canRecordHighBitrate(entitlements) ? highBitRate(lastRecording) : null;
  const [sessionReady, setSessionReady] = useState(false);
  const [showTips, setShowTips] = useState(true);

  // Sound is a second track in the same file. fps, frame count and dimensions
  // are read off the video track alone, so it cannot move a reading.
  const enableAudio = recordsSound(microphone.status) && !microphoneBusy;
  const videoOutput = useVideoOutput(
    bitRate === null
      ? { fileType: 'mp4', enableAudio }
      : { fileType: 'mp4', targetBitRate: bitRate, enableAudio }
  );

  const onFinished = useCallback(
    ({ path, info }: CaptureResult) => {
      // What the camera really delivered, so the next Pro recording can be
      // scaled to it. Read off the file, never assumed from the camera.
      const profile = profileFrom(
        info,
        fileSize(path),
        bitRate,
        getSettings().lastRecording
      );
      if (profile) updateSettings({ lastRecording: profile });
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
    [router, exposure, bitRate]
  );

  const onAudioFailure = useCallback(() => setMicrophoneBusy(true), []);
  const capture = useCapture(videoOutput, { onFinished, withAudio: enableAudio, onAudioFailure });

  // Offered on the first visit, once the camera itself is allowed so two system
  // dialogs never stack. Answering it restarts the session for sound, which is
  // why it happens here and not while a bowler is running in.
  useEffect(() => {
    if (!hasPermission) return;
    if (shouldOfferMicrophone(microphone.status, getSettings().microphoneAsked)) {
      setOfferingMicrophone(true);
    }
  }, [hasPermission, microphone.status]);

  const answerMicrophone = useCallback(
    async (allow: boolean) => {
      // Recorded before the dialog, so closing the app on it still counts as asked.
      updateSettings({ microphoneAsked: true });
      setOfferingMicrophone(false);
      if (allow) await microphone.requestPermission().catch(() => false);
    },
    [microphone]
  );

  // Tearing the session down on navigation rejects any in-flight control write.
  // That is expected; anything else is a real session error and stays loud.
  const onCameraError = useCallback((e: Error) => {
    if (/not active/i.test(e.message)) return;
    console.error(e);
  }, []);

  useEffect(() => {
    if (!hasPermission && canRequestPermission) void requestPermission().catch(() => false);
  }, [hasPermission, canRequestPermission, requestPermission]);

  if (!hasPermission) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.h2}>Camera access needed</Text>
        <Text style={styles.body}>
          Paceball measures from video recorded on this phone, and never uploads
          your videos or measurements.
        </Text>
        {/* Once Android stops showing its dialog, asking again does nothing.
            The camera can then only be allowed from the system settings,
            which come back here with the permission re-read. */}
        {canRequestPermission ? null : (
          <Text style={[styles.body, styles.settingsNote]}>
            Android will not ask again. Allow the camera for Paceball in the phone's settings.
          </Text>
        )}
        <Pressable
          style={styles.primaryButton}
          onPress={() =>
            void (canRequestPermission
              ? requestPermission().catch(() => false)
              : Linking.openSettings().catch(() => undefined))
          }
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>
            {canRequestPermission ? 'Grant access' : 'Open settings'}
          </Text>
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
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: previewFade }]}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isFocused}
        outputs={[videoOutput]}
        constraints={[{ fps: CAPTURE_FPS }, { videoStabilizationMode: 'off' }]}
        exposure={isFocused && sessionReady ? exposure : undefined}
        onStarted={() => setSessionReady(true)}
        onStopped={() => setSessionReady(false)}
        onPreviewStarted={revealPreview}
        onError={onCameraError}
      />
      </Animated.View>

      {switchingLens ? (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <Text style={styles.switchingText}>Switching lens</Text>
        </View>
      ) : null}

      {isProcessing ? <View style={[StyleSheet.absoluteFill, styles.scrim]} /> : null}

      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.top} pointerEvents="box-none">
          {showGuide ? (
            <FramingGuide dimmed={isRecording} onDismiss={() => setShowGuide(false)} />
          ) : null}

          {!isRecording && !isProcessing && ultraWideAvailable ? (
            <View style={styles.lenses} accessibilityRole="radiogroup">
              {(['wide', 'ultra-wide'] as Lens[]).map((option) => {
                const on = option === lens;
                return (
                  <Pressable
                    key={option}
                    style={[styles.lens, on && styles.lensOn]}
                    onPress={() => chooseLens(option)}
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
                  <Text style={styles.tipBullet}>–</Text>
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
          {/* Out of the way while recording: answering it mid-clip would restart
              the session under the recording. It comes back afterwards. */}
          {offeringMicrophone && !isRecording && !isProcessing ? (
            <View style={styles.micCard}>
              <Text style={styles.guideTitle}>{MICROPHONE_OFFER_TITLE}</Text>
              <Text style={styles.guideBody}>{MICROPHONE_OFFER_REASON}</Text>
              <View style={styles.micActions}>
                <Pressable
                  style={styles.micSkip}
                  onPress={() => answerMicrophone(false)}
                  accessibilityRole="button"
                >
                  <Text style={styles.micSkipText}>{MICROPHONE_OFFER_SKIP}</Text>
                </Pressable>
                <Pressable
                  style={styles.micAllow}
                  onPress={() => answerMicrophone(true)}
                  accessibilityRole="button"
                >
                  <Text style={styles.micAllowText}>{MICROPHONE_OFFER_ALLOW}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {capture.notice ? (
            <Pressable
              style={styles.noticeCard}
              onPress={capture.clearNotice}
              accessibilityRole="button"
              accessibilityLabel="Dismiss notice"
            >
              <Text style={styles.noticeText}>{capture.notice}</Text>
            </Pressable>
          ) : null}

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

          {bitRate !== null ? (
            <View style={styles.qualityMark}>
              <Text style={styles.qualityMarkText}>PRO QUALITY</Text>
            </View>
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
            disabled={!sessionReady || switchingLens || isProcessing || (isRecording && !canStop)}
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

/**
 * Where the reference should sit in frame, and why it matters.
 *
 * This is guidance, not a check. The app cannot tell how much of the frame the
 * reference fills until the marks are placed, so nothing here claims to have
 * measured the framing; Result says something about it afterwards, once the
 * marks exist.
 */
function FramingGuide({ dimmed, onDismiss }: { dimmed: boolean; onDismiss: () => void }) {
  return (
    <View style={[styles.guide, dimmed && styles.guideDimmed]} pointerEvents="box-none">
      <View style={styles.guideBand} pointerEvents="none">
        <View style={styles.guideEnd} />
        <View style={styles.guideLine} />
        <View style={styles.guideEnd} />
      </View>
      <View style={styles.guideCard}>
        <View style={styles.guideHeader}>
          <Text style={styles.label}>FRAMING</Text>
          <Pressable onPress={onDismiss} hitSlop={space.md} accessibilityRole="button">
            <Text style={styles.tipsToggleText}>Hide</Text>
          </Pressable>
        </View>
        <Text style={styles.guideTitle}>Fit both ends of your reference inside the guide</Text>
        <Text style={styles.guideBody}>
          Both sets of stumps, or both markers, close to the end bars. The scale comes from
          that one distance, so the more of the frame it fills, the less the reading drifts.
          Standing too far back reads low, and the error range cannot see it.
        </Text>
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
  settingsNote: { marginTop: space.md },
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
  // A fallback that worked, so it reads as information rather than an error.
  noticeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    padding: space.md,
    marginBottom: space.md,
  },
  noticeText: { ...type.caption, color: colors.text },

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
  guide: { alignSelf: 'stretch' },
  guideDimmed: { opacity: opacity.inactive },
  guideBand: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.md,
  },
  guideEnd: {
    width: stroke.heavy,
    height: space.xl,
    backgroundColor: colors.accent,
  },
  guideLine: {
    flex: 1,
    height: stroke.medium,
    backgroundColor: colors.accent,
    opacity: opacity.secondary,
  },
  guideCard: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    padding: space.md,
    marginBottom: space.md,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  guideTitle: { ...type.body, color: colors.text, fontWeight: '800' },
  guideBody: { ...type.caption, color: colors.muted, marginTop: space.xs },
  qualityMark: {
    alignSelf: 'center',
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    marginBottom: space.sm,
  },
  qualityMarkText: { ...type.label, color: colors.muted },
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
  switchingText: { ...type.caption, color: colors.muted },
  micCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    padding: space.md,
    marginBottom: space.md,
  },
  micActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: space.md },
  micSkip: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginRight: space.sm,
  },
  micSkipText: { ...type.caption, color: colors.text },
  micAllow: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  micAllowText: { ...type.caption, color: colors.bg, fontWeight: '800' },
  // The allowance is worth reading at a glance once it has run out.
  hintLimit: { color: colors.warn },
});
