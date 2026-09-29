import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File } from 'expo-file-system';
import {
  Camera,
  useCameraDevice,
  useCameraDevices,
  useCameraPermission,
  useMicrophonePermission,
  useOrientation,
  useVideoOutput,
} from 'react-native-vision-camera';
import {
  CAPTURE_FPS,
  MIN_RECORDING_MS,
  useCapture,
  type CaptureResult,
} from '../src/capture/useCapture';
import { Screen } from '../src/ui/Screen';
import { captureExposure, exposureSteps, stepExposure } from '../src/capture/exposure';
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
import { ActionButton } from '../src/ui/ActionButton';
import { AllowanceLine } from '../src/ui/AllowanceLine';
import { AppBar } from '../src/ui/AppBar';
import { BottomSheet } from '../src/ui/BottomSheet';
import { Notice } from '../src/ui/Notice';
import { RecordButtonFace } from '../src/ui/RecordButtonFace';
import { RotateInPlace } from '../src/ui/RotateInPlace';
import { uiRotation } from '../src/capture/orientation';
import { formatBias } from '../src/ui/format';
import { colors, motion, opacity, radius, size, space, stroke, type } from '../src/ui/tokens';
import type { CalibrationMethod } from '../src/types';

/**
 * A lens swap restarts the camera session, and on a real phone that takes far
 * longer than any fixed fade, and a different time on every phone. So the
 * preview fades out, stays dark under a "Switching lens" label while the session
 * restarts, and fades back in on the new lens's first preview frame. It is a
 * swap between two lenses, not a zoom ramp.
 */
const LENS_FADE_OUT_MS = motion.lens.out;
const LENS_FADE_IN_MS = motion.lens.in;
/** If the first frame is never reported, the preview comes back anyway. */
const LENS_SWAP_TIMEOUT_MS = 2000;

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
  const { exposureBias, lastRecording, calibrationMethod } = useSettings();
  // Starts from the Settings default on every visit and is never written back:
  // it is this session's light, not a preference.
  const [bias, setBias] = useState<number>(exposureBias);
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
  // The same request and the same clamp as ever, now from the value chosen here.
  const exposure = captureExposure(device, bias);

  // Pro records the same frames with less compression. The target is set
  // clearly above what this camera writes on its own default, measured from a
  // real recording. It is null until that has been measured, or when no target
  // clearly above it is possible, and then the camera keeps its own default and
  // nothing on screen claims Pro quality.
  const bitRate = canRecordHighBitrate(entitlements) ? highBitRate(lastRecording) : null;
  const [sessionReady, setSessionReady] = useState(false);

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

  // One light tap each time the recorder actually starts or stops: after the
  // camera's own state changes, never on the press that asked for it.
  const wasRecording = useRef(capture.isRecording);
  useEffect(() => {
    if (wasRecording.current === capture.isRecording) return;
    wasRecording.current = capture.isRecording;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, [capture.isRecording]);

  // The preview is contained in a 3:4 box, as large as the space allows.
  const [area, setArea] = useState({ w: 0, h: 0 });

  // Which way the phone is physically held. The screen stays portrait-locked;
  // only what is drawn over the preview turns to meet it, as in a camera app.
  // Read-only: the recording's own orientation is not touched.
  const rotation = uiRotation(useOrientation('device'));

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
        <ActionButton
          label={canRequestPermission ? 'Grant access' : 'Open settings'}
          onPress={() =>
            void (canRequestPermission
              ? requestPermission().catch(() => false)
              : Linking.openSettings().catch(() => undefined))
          }
          style={styles.permissionAction}
        />
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

  // The largest 3:4 box the space holds. The preview is contained in it, so
  // everything the camera records is on screen and nothing is cropped away.
  const boxWidth = Math.min(area.w, (area.h * PREVIEW_ASPECT_W) / PREVIEW_ASPECT_H);
  const box = { width: boxWidth, height: (boxWidth * PREVIEW_ASPECT_H) / PREVIEW_ASPECT_W };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Pro quality is named only when the higher bitrate is really being
          requested; everything else, Pro included before it is measured, is
          standard. The chip stays upright whichever way the phone is held: a
          word turned inside the app bar's short row gets clipped. */}
      <View style={styles.bar}>
        <AppBar
          title="Capture"
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          backDisabled={isRecording || isProcessing}
          right={bitRate !== null ? (
            <View style={styles.qualityMark}>
              <Text style={styles.qualityMarkText}>PRO QUALITY</Text>
            </View>
          ) : (
            <View style={styles.qualityChip}>
              <Text style={styles.qualityChipText}>STANDARD</Text>
            </View>
          )}
        />
      </View>

      <View
        style={styles.previewArea}
        onLayout={(e: LayoutChangeEvent) => {
          const { width, height } = e.nativeEvent.layout;
          setArea({ w: width, h: height });
        }}
      >
        <View style={[styles.previewBox, box]}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: previewFade }]}>
          <Camera
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
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

          <GuideOverlay
            method={calibrationMethod}
            dimmed={isRecording}
            rotation={rotation}
            box={box}
          />

          {switchingLens ? (
            <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
              <View style={styles.plate}>
                <Text style={styles.plateText}>Switching lens…</Text>
              </View>
            </View>
          ) : null}

          {isProcessing ? <View style={[StyleSheet.absoluteFill, styles.scrim]} /> : null}

          {showGuide ? (
            <View style={styles.guideSlot} pointerEvents="box-none">
              <FramingGuide dimmed={isRecording} onDismiss={() => setShowGuide(false)} />
            </View>
          ) : null}
        </View>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + space.md }]}>
        {capture.notice ? (
          <Notice tone="info" action={{ label: 'Dismiss', onPress: capture.clearNotice }}>
            {capture.notice}
          </Notice>
        ) : null}

        {error ? (
          <Notice tone="error" live action={{ label: 'Dismiss', onPress: capture.clearError }}>
            {error}
          </Notice>
        ) : null}

        <View style={styles.settingsRow}>
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
                    <RotateInPlace deg={rotation}>
                      <Text style={[styles.lensText, on && styles.lensTextOn]}>
                        {LENS_LABEL[option]}
                      </Text>
                    </RotateInPlace>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.lensSpacer} />
          )}

          <ExposureControl
            exposure={exposure}
            device={device}
            locked={isRecording || isProcessing}
            rotation={rotation}
            onChange={setBias}
          />
        </View>
        {exposure === undefined ? null : (
          <Text style={styles.helper}>
            Brighter video can mean more blur. Use more light when you can.
          </Text>
        )}

        <View style={styles.actionRow}>
          <View style={styles.soundSlot}>
            <RotateInPlace deg={rotation} style={styles.soundTurn}>
              <Text style={styles.sound} numberOfLines={1}>
                {enableAudio ? 'Sound on' : 'No sound'}
              </Text>
            </RotateInPlace>
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
            <RotateInPlace deg={rotation}>
              <RecordButtonFace
                recording={isRecording}
                lockedSeconds={isRecording && !canStop ? lockedSeconds : null}
                dimmed={!sessionReady || switchingLens || isProcessing || (isRecording && !canStop)}
              />
            </RotateInPlace>
          </Pressable>

          <View style={styles.timerSlot}>
            {isRecording ? <View style={styles.recDot} /> : null}
            <RotateInPlace deg={rotation}>
              <Text style={[styles.timer, !isRecording && styles.timerIdle]}>
                {formatElapsed(isRecording ? elapsedMs : 0)}
              </Text>
            </RotateInPlace>
          </View>
        </View>

        <Text style={styles.hint}>{hint}</Text>
        <AllowanceLine line={allowanceNote} allowance={allowance} weekday={weekdayOf} />
      </View>

      {/* Out of the way while recording: answering it mid-clip would restart
          the session under the recording. It comes back afterwards. Closing it
          without an answer leaves it unanswered, to be offered on the next visit. */}
      <BottomSheet
        visible={offeringMicrophone && !isRecording && !isProcessing}
        title={MICROPHONE_OFFER_TITLE}
        onClose={() => setOfferingMicrophone(false)}
      >
        <Text style={styles.sheetBody}>{MICROPHONE_OFFER_REASON}</Text>
        <View style={styles.sheetActions}>
          <ActionButton label={MICROPHONE_OFFER_ALLOW} onPress={() => answerMicrophone(true)} />
          <ActionButton
            variant="secondary"
            label={MICROPHONE_OFFER_SKIP}
            onPress={() => answerMicrophone(false)}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

/** The preview box's shape, width to height. */
const PREVIEW_ASPECT_W = 3;
const PREVIEW_ASPECT_H = 4;

/** What the plate over the preview asks to be in frame, for the reference Mark will open on. */
const GUIDE_PLATE: Record<CalibrationMethod, string> = {
  stumps: 'Fit both stumps, release and bounce',
  markers: 'Fit both markers, release and bounce',
  ball: 'Fit the ball in hand, release and bounce',
  height: 'Fit the whole bowler, release and bounce',
};

/**
 * Corner brackets, a baseline and a plate saying what belongs in frame, drawn
 * over the preview. A guide, never a detection result: nothing here looks at
 * the picture. The ends of the baseline show the reference Mark will open on,
 * stumps or markers; a ball or a bowler has no fixed ends to show.
 */
function GuideOverlay({
  method,
  dimmed,
  rotation,
  box,
}: {
  method: CalibrationMethod;
  dimmed: boolean;
  /** How far the phone is turned: the pitch then runs along the box's long side. */
  rotation: number;
  box: { width: number; height: number };
}) {
  // Held sideways, the framing is the box turned a quarter: laid out in a
  // frame with the box's sides swapped, centred on it, then turned in place.
  const turned = rotation !== 0;
  const frame = turned
    ? {
        width: box.height,
        height: box.width,
        left: (box.width - box.height) / 2,
        top: (box.height - box.width) / 2,
      }
    : { width: box.width, height: box.height, left: 0, top: 0 };
  const ends = method === 'stumps' ? styles.stumpIcon : method === 'markers' ? styles.markerIcon : null;
  return (
    <View
      style={[StyleSheet.absoluteFill, dimmed && styles.guideDimmed]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.bracket, styles.bracketTopLeft]} />
      <View style={[styles.bracket, styles.bracketTopRight]} />
      <View style={[styles.bracket, styles.bracketBottomLeft]} />
      <View style={[styles.bracket, styles.bracketBottomRight]} />
      <RotateInPlace deg={rotation} style={[styles.guideFrame, frame]}>
        <View style={styles.baselineRow}>
          {ends ? <View style={ends} /> : null}
          <View style={styles.baseline} />
          {ends ? <View style={ends} /> : null}
        </View>
        <View style={styles.guidePlateRow}>
          <View style={styles.plate}>
            <Text style={styles.plateText}>{GUIDE_PLATE[method]}</Text>
          </View>
        </View>
      </RotateInPlace>
    </View>
  );
}

/**
 * The exposure bias this recording asks for, starting from the Settings
 * default. It is the same value, through the same clamp, that capture has
 * always sent the camera; this only lets it change before recording. Locked
 * while recording, and off on a camera that has no bias to set.
 */
function ExposureControl({
  exposure,
  device,
  locked,
  rotation,
  onChange,
}: {
  /** What is actually sent, after the camera's own limits. Undefined when unsupported. */
  exposure: number | undefined;
  device: { minExposureBias: number; maxExposureBias: number };
  locked: boolean;
  /** How far to turn the labels so they read upright on a phone held sideways. */
  rotation: number;
  onChange: (bias: number) => void;
}) {
  const supported = exposure !== undefined;
  // Steps from what is actually sent, a whole unit at a time, as far as this
  // camera goes each way. Locked while recording.
  const steps = supported ? exposureSteps(exposure, device) : { darker: false, brighter: false };
  const canDarken = !locked && steps.darker;
  const canBrighten = !locked && steps.brighter;

  if (!supported) {
    return (
      <View style={styles.exposure}>
        <RotateInPlace deg={rotation}>
          <Text style={styles.exposureAuto}>Exposure uses camera auto on this phone.</Text>
        </RotateInPlace>
      </View>
    );
  }

  return (
    <View style={styles.exposure}>
      <RotateInPlace deg={rotation}>
        <Text style={styles.exposureLabel}>Exposure</Text>
      </RotateInPlace>
      <Pressable
        style={[styles.exposureStep, !canDarken && styles.off]}
        onPress={() => onChange(stepExposure(exposure, -1, device))}
        disabled={!canDarken}
        accessibilityRole="button"
        accessibilityLabel="Darker"
        accessibilityState={{ disabled: !canDarken }}
      >
        <RotateInPlace deg={rotation}>
          <Text style={styles.exposureStepText}>−</Text>
        </RotateInPlace>
      </Pressable>
      <Text
        style={styles.exposureValue}
        accessibilityLabel={`Exposure bias ${exposure}${locked ? ', locked while recording' : ''}`}
      >
        {formatBias(exposure)}
      </Text>
      <Pressable
        style={[styles.exposureStep, !canBrighten && styles.off]}
        onPress={() => onChange(stepExposure(exposure, 1, device))}
        disabled={!canBrighten}
        accessibilityRole="button"
        accessibilityLabel="Brighter"
        accessibilityState={{ disabled: !canBrighten }}
      >
        <RotateInPlace deg={rotation}>
          <Text style={styles.exposureStepText}>+</Text>
        </RotateInPlace>
      </Pressable>
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
    <View style={[styles.guideCard, dimmed && styles.guideDimmed]}>
      <View style={styles.guideHeader}>
        <Text style={styles.label}>FRAMING</Text>
        <Pressable onPress={onDismiss} style={styles.guideHide} accessibilityRole="button">
          <Text style={styles.guideHideText}>Hide</Text>
        </Pressable>
      </View>
      <Text style={styles.guideTitle}>Fit both ends of your reference inside the guide</Text>
      <Text style={styles.guideBody}>
        Both sets of stumps, or both markers, close to the end bars. The scale comes from
        that one distance, so the more of the frame it fills, the less the reading drifts.
        Standing too far back reads low, and the error range cannot see it.
      </Text>
    </View>
  );
}

/** The record button's ring. Kept by name: it is the target the thumb looks for. */
const SHUTTER_SIZE = size.record;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  bar: { paddingHorizontal: space.md },

  h2: { ...type.h2, color: colors.text, marginBottom: space.sm },
  body: { ...type.body, color: colors.muted, textAlign: 'center' },
  settingsNote: { marginTop: space.md },
  permissionAction: { marginTop: space.lg },
  label: { ...type.label, color: colors.muted },

  qualityMark: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.text,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  qualityMarkText: { ...type.label, color: colors.text },
  qualityChip: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.control,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  qualityChipText: { ...type.label, color: colors.muted },

  previewArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewBox: { overflow: 'hidden', backgroundColor: colors.bg },
  scrim: { backgroundColor: colors.bg, opacity: opacity.scrim },

  // Opaque, so it reads over any picture.
  plate: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  plateText: { ...type.caption, color: colors.text, textAlign: 'center' },

  guideDimmed: { opacity: opacity.inactive },
  bracket: {
    position: 'absolute',
    width: space.lg,
    height: space.lg,
    borderColor: colors.text,
  },
  bracketTopLeft: {
    top: space.md,
    left: space.md,
    borderTopWidth: stroke.medium,
    borderLeftWidth: stroke.medium,
  },
  bracketTopRight: {
    top: space.md,
    right: space.md,
    borderTopWidth: stroke.medium,
    borderRightWidth: stroke.medium,
  },
  bracketBottomLeft: {
    bottom: space.md,
    left: space.md,
    borderBottomWidth: stroke.medium,
    borderLeftWidth: stroke.medium,
  },
  bracketBottomRight: {
    bottom: space.md,
    right: space.md,
    borderBottomWidth: stroke.medium,
    borderRightWidth: stroke.medium,
  },
  baselineRow: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
    bottom: space.xxl,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  baseline: {
    flex: 1,
    height: stroke.hairline,
    backgroundColor: colors.text,
    opacity: opacity.secondary,
  },
  // Outlined, like a drawing of the thing, never a filled detection box.
  stumpIcon: {
    width: space.sm,
    height: space.lg,
    borderWidth: stroke.hairline,
    borderColor: colors.text,
  },
  markerIcon: {
    width: space.sm,
    height: space.sm,
    borderWidth: stroke.hairline,
    borderColor: colors.text,
  },
  guideFrame: { position: 'absolute' },
  guidePlateRow: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: space.xxl + space.md,
    alignItems: 'center',
  },

  guideSlot: { position: 'absolute', top: space.sm, left: space.sm, right: space.sm },
  guideCard: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    padding: space.md,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guideHide: { minHeight: size.target, minWidth: size.target, alignItems: 'flex-end', justifyContent: 'center' },
  guideHideText: { ...type.caption, color: colors.text },
  guideTitle: { ...type.body, color: colors.text, fontWeight: '700' },
  guideBody: { ...type.caption, color: colors.muted, marginTop: space.xs },

  controls: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },

  settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lenses: { flexDirection: 'row', gap: space.xs },
  lensSpacer: { width: size.target },
  lens: {
    minWidth: size.target,
    minHeight: size.target,
    borderRadius: radius.md,
    borderWidth: stroke.medium,
    borderColor: colors.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  lensOn: { backgroundColor: colors.text, borderColor: colors.text },
  lensText: { ...type.button, ...type.tabular, color: colors.text },
  lensTextOn: { color: colors.bg },

  exposure: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  exposureLabel: { ...type.caption, color: colors.muted },
  exposureAuto: { ...type.caption, color: colors.muted, textAlign: 'right' },
  exposureStep: {
    width: size.target,
    height: size.target,
    borderRadius: radius.pill,
    borderWidth: stroke.medium,
    borderColor: colors.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exposureStepText: { ...type.h2, color: colors.text },
  exposureValue: { ...type.button, ...type.tabular, color: colors.text, minWidth: space.lg, textAlign: 'center' },
  off: { opacity: opacity.disabled },
  helper: { ...type.caption, color: colors.muted },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  soundSlot: { flex: 1, alignItems: 'flex-start' },
  soundTurn: { alignSelf: 'flex-start' },
  sound: { ...type.caption, color: colors.muted },
  shutter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerSlot: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  recDot: {
    width: space.sm,
    height: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    marginRight: space.sm,
  },
  timer: { ...type.h2, ...type.tabular, color: colors.text },
  timerIdle: { color: colors.muted },

  hint: { ...type.caption, color: colors.muted, textAlign: 'center' },

  sheetBody: { ...type.body, color: colors.text, marginTop: space.sm },
  sheetActions: { gap: space.sm, marginTop: space.lg },
});
