import { useCallback, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createPlayer, getActivePlayer, saveSession } from '../src/data';
import { restoredGeometry } from '../src/data/geometry';
import {
  CALIBRATION_SPECS,
  MARKER_SOURCE_SPECS,
  formatMetres,
  isCalibrationMethod,
  travelWarning,
  type CalibrationSpec,
} from '../src/physics/calibration';
import {
  computeSpeed,
  MARKING_LONG_EDGE_PX,
  type SpeedResult,
} from '../src/physics/computeSpeed';
import { referenceFraming, spanBetween } from '../src/capture/framing';
import { releaseFrameUri } from '../src/capture/useFrames';
import { measurementState } from '../src/physics/measurementState';
import { useSettings } from '../src/settings';
import { ActionButton } from '../src/ui/ActionButton';
import { AppBar } from '../src/ui/AppBar';
import { DeliveryShareSheet } from '../src/ui/DeliveryShareSheet';
import { FrameMarker } from '../src/ui/FrameMarker';
import { Notice } from '../src/ui/Notice';
import { ReadingBlock } from '../src/ui/ReadingBlock';
import { SpeedGauge } from '../src/ui/SpeedGauge';
import { WicketLock } from '../src/ui/WicketLock';
import { PathDots, pointsAlong } from '../src/ui/motion/PathDots';
import { useReveal } from '../src/ui/motion/useReveal';
import { READING_LABEL, readingView, type NoReading } from '../src/ui/reading';
import { readingCautions } from '../src/ui/gauge';
import { colors, radius, size, space, stroke, type } from '../src/ui/tokens';
import { useLargeText } from '../src/ui/useLargeText';
import { errorMessage } from '../src/ui/format';
import { finiteNumber, first, positiveNumber } from '../src/ui/routeParams';
import type { CalibrationMethod, MarkConfidence, MarkerSource, Point } from '../src/types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Dots along the straight line from release to bounce on the evidence frame. */
const CONNECTOR_DOTS = 9;

/** The evidence frame never takes more than this share of the screen's height. */
const EVIDENCE_MAX_HEIGHT_SHARE = 0.5;

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
  const { width } = useWindowDimensions();
  // At large text the footer moves into the page and the working stacks, so
  // nothing sits over a range or a button.
  const largeText = useLargeText();

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  // Saving moves the frames out of the cache, so the evidence frame is read
  // from where the saved delivery keeps them once it has been saved.
  const [savedFramesDir, setSavedFramesDir] = useState<string | null>(null);
  const savingRef = useRef(false);
  const [sharing, setSharing] = useState(false);
  // The pinned footer's height, so the page can scroll everything clear of it.
  const [footerHeight, setFooterHeight] = useState<number>(size.button * 2 + space.xl);

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
      return { error: errorMessage(e) };
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

  // The dial and the number sweep from this one driver, together. It waits
  // for the reading, for the reading's view to be laid out and for the push
  // from Mark to finish, so none of the sweep is spent while the screen is
  // still arriving. When it lands, the wicket locks.
  const reveal = useReveal({ ready: result !== null && result.speedKmh !== null });

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
      setSavedFramesDir(saved.framesDir);
      setSaveStatus('saved');
    } catch (e) {
      setSaveStatus('error');
      setSaveError(errorMessage(e));
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
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.bar}>
          <AppBar title="Result" onBack={() => router.back()} backLabel="Back to marking" />
        </View>
        <View style={styles.fallback}>
          <Text style={styles.h1}>No reading</Text>
          <Text style={styles.fallbackBody}>
            {'error' in reading ? reading.error : 'Something went wrong.'}
          </Text>
          <ActionButton label="Back to marking" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  // Read the same way History and Analysis read the saved delivery, so the range
  // shown here is the range those screens will show. Nothing is saved yet, so the
  // points are still in the extracted frame's own space, where the marking scale
  // is 1 by definition. The frame's size stands in if it did not survive.
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

  // Everything this screen shows of the reading comes through here: a measured
  // delivery carries its range with it, and one with no reading carries no number.
  const view = readingView(state, unit);

  // Everything downstream of the bounce mark (the flight time, the frame delta
  // and the distance travelled) is only worth as much as that mark.
  const measured = state.kind === 'measured';
  // Said beside the reading, never changing it: off the dial, or a very wide range.
  const cautions =
    state.kind === 'measured' && view.kind === 'measured'
      ? readingCautions(state, unit)
      : [];
  const saved = saveStatus === 'saved';

  // How much of the frame's width the two calibration marks spanned, in the
  // space they were marked in.
  const framing =
    calA && calB && imageWidth ? referenceFraming(spanBetween(calA, calB), imageWidth) : null;

  // Measured against the ruler that was actually chosen. Warning on the pitch
  // length alone never fired for markers, ball or height.
  const warning = travelWarning(result.travelMetres, calRealMetres!, calibrationMethod!);

  // Saving moves the clip and its frames out of the cache, so going back to
  // re-mark is no longer possible once it has been saved. Back then goes home,
  // as the hardware button does.
  const goBack = () => (saved ? router.dismissAll() : router.back());

  const footer = (
    <View
      onLayout={largeText ? undefined : (e: LayoutChangeEvent) => setFooterHeight(e.nativeEvent.layout.height)}
      style={[
        styles.footer,
        largeText ? styles.footerInFlow : [styles.footerSticky, { paddingBottom: insets.bottom + space.md }],
      ]}
    >
      {saveError ? <Notice tone="error" live>{`Could not save this delivery: ${saveError}`}</Notice> : null}
      {saved ? (
        <>
          <View style={largeText ? styles.stack : styles.pair}>
            <ActionButton label="Saved" complete onPress={() => undefined} style={styles.pairItem} />
            <ActionButton
              variant="secondary"
              label="Share reading"
              onPress={() => setSharing(true)}
              disabledReason={measured ? null : 'A measured reading is needed to share a speed card.'}
              style={styles.pairItem}
            />
          </View>
          <ActionButton
            variant="text"
            label="Record another"
            onPress={() => router.dismissTo('/capture')}
          />
        </>
      ) : (
        <ActionButton
          label={saveStatus === 'error' ? 'Try again' : measured ? 'Save' : 'Save without speed'}
          onPress={onSave}
          busy={saveStatus === 'saving' ? 'Saving…' : null}
          disabledReason={
            canSave || saveStatus === 'saving'
              ? null
              : 'Some of the recording details did not reach this screen, so this delivery cannot be saved.'
          }
          accessibilityLabel={measured ? 'Save this delivery' : 'Save this delivery without a speed'}
        />
      )}
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <AppBar
          title="Result"
          onBack={goBack}
          backLabel={saved ? 'Back to home' : 'Back to marking'}
          backDisabled={saveStatus === 'saving'}
          caption={saved ? 'Saved on this phone' : null}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          // Whatever is last scrolls fully clear of the pinned footer, and a gap more.
          { paddingBottom: largeText ? insets.bottom + space.lg : footerHeight + space.lg },
        ]}
      >
        {view.kind === 'measured' ? (
          <View style={styles.reading} onLayout={reveal.onLayout}>
            {/* The reading's own sentence says this, so it is not read twice. */}
            <Text style={styles.label} accessibilityElementsHidden importantForAccessibility="no">
              {READING_LABEL}
            </Text>
            {/* The dial sweeps with the count; the number and its range stay
                beneath it, and the wicket lands with both. */}
            <SpeedGauge reading={view} unit={unit} width={width - space.lg * 2} sweep={reveal} />
            <ReadingBlock
              reading={view}
              size={width < size.compactBelow ? 'heroCompact' : 'hero'}
              reveal={reveal}
            />
            <View style={styles.wicket}>
              <WicketLock locked={reveal.done} />
            </View>
          </View>
        ) : (
          <NoSpeed
            cause={view.cause}
            // Re-marking is the way from here to a real reading. Once saved, the
            // clip has left the cache and there is nothing to go back to.
            onRemark={saved ? null : () => router.back()}
            remarkDisabled={saveStatus === 'saving'}
          />
        )}

        <View style={styles.cautions}>
          {cautions.map((line) => (
            <Notice key={line} tone="caution">{line}</Notice>
          ))}
          {/* The warning quotes the travel figure, so on a guessed bounce it would
              leak the very number the rest of the screen is withholding. */}
          {warning && measured ? <Notice tone="caution">{warning.message}</Notice> : null}
          {/* Now the marks exist, how much of the frame the reference filled is
              known. Only worth saying where the reference is laid along the pitch:
              a ball or a standing bowler is small in frame by nature. */}
          {framing && !framing.tight && spec!.rulerBoundsTravel && measured ? (
            <Notice tone="caution">
              {`Your reference filled about ${Math.round(framing.fraction * 100)}% of the frame. The scale comes from that one distance, so a reference this small in frame can read low by more than the range above allows for. Stand so both ends sit near the edges next time.`}
            </Notice>
          ) : null}
        </View>

        {imageWidth && imageHeight ? (
          <Evidence
            framesDir={savedFramesDir ?? framesDir}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            spec={spec!}
            calA={calA!}
            calB={calB!}
            release={release!}
            bounce={bounce!}
            confidence={markConfidence!}
            // The straight line is the distance the reading was taken over, so
            // without a reading there is nothing for it to stand for.
            connect={measured}
          />
        ) : null}

        <View style={styles.working}>
          <Text style={styles.h2} accessibilityRole="header">
            How this was measured
          </Text>
          <Row
            stacked={largeText}
            label="Marked frames"
            value={`${release!.frame} → ${bounce!.frame}`}
          />
          {measured ? (
            <Row stacked={largeText} label="Frame delta" value={`${result.frameDelta} frames`} />
          ) : null}
          <Row stacked={largeText} label="fps used" value={fps!.toFixed(2)} />
          {measured ? (
            <Row stacked={largeText} label="Flight time" value={`${result.seconds.toFixed(4)} s`} />
          ) : null}
          <Row
            stacked={largeText}
            label="Scale reference"
            value={`${spec!.short} · ${formatMetres(calRealMetres!)}`}
          />
          {markerSource ? (
            <Row
              stacked={largeText}
              label="Distance from"
              value={
                paceCount === null
                  ? MARKER_SOURCE_SPECS[markerSource].short
                  : `${paceCount} paces · ${MARKER_SOURCE_SPECS[markerSource].short}`
              }
            />
          ) : null}
          <Row stacked={largeText} label="Pixels per metre" value={result.pixelsPerMetre.toFixed(2)} />
          {measured ? (
            <Row stacked={largeText} label="Ball travelled" value={`${result.travelMetres.toFixed(2)} m`} />
          ) : (
            <Text style={styles.footnote}>
              {state.kind === 'not-seen'
                ? 'Frame delta, flight time and distance travelled are not shown. Each is measured from the bounce mark, and that frame was guessed, so they would be as invented as the speed. All three are still saved with the delivery.'
                : 'Frame delta, flight time and distance travelled are not shown. They come from the same marks that cannot produce a reading, so they are worth no more than the speed would be.'}
            </Text>
          )}
          <Text style={styles.footnote}>
            Scaled against {formatMetres(calRealMetres!)}: {spec!.detail.toLowerCase()} The
            ball's own travel is measured with that scale, not assumed from it.
          </Text>
        </View>

        {largeText ? footer : null}
      </ScrollView>

      {largeText ? null : footer}

      {/* Nothing to put on a share card or clip without a measured speed. The
          same sheet as Analysis: image card or video clip, and the watermark
          removed with Pro. */}
      {savedId && measured ? (
        <DeliveryShareSheet visible={sharing} onClose={() => setSharing(false)} sessionId={savedId} />
      ) : null}
    </View>
  );
}

/**
 * A delivery that produced no speed. It says so plainly, in neutral colours:
 * nothing went wrong, the marks just cannot support a reading. No number, no
 * count and no wicket.
 */
function NoSpeed({
  cause,
  onRemark,
  remarkDisabled,
}: {
  cause: NoReading['cause'];
  /** Back to marking, or null once there is no going back. */
  onRemark: (() => void) | null;
  remarkDisabled: boolean;
}) {
  return (
    <View style={styles.noSpeed}>
      <View
        style={styles.noSpeedIcon}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.noSpeedBar} />
      </View>
      <Text style={styles.h1}>No speed measured</Text>
      <Text style={styles.noSpeedBody}>
        {cause === 'not-seen'
          ? 'The bounce was guessed. A guess cannot produce a reading.'
          : "The marks don't hold enough to put an error range on the speed, and a speed without its range is not a reading."}
      </Text>
      <Text style={styles.noSpeedNote}>
        You can still save the delivery to keep the clip and the marks. It will carry no
        speed, and it stays out of your trend.
      </Text>
      {onRemark ? (
        <ActionButton
          variant="text"
          label={cause === 'not-seen' ? 'Re-mark the bounce' : 'Re-mark the delivery'}
          onPress={onRemark}
          disabledReason={remarkDisabled ? 'Saving the delivery.' : null}
        />
      ) : null}
    </View>
  );
}

/**
 * The release frame with every mark that belongs on it, and the straight line
 * the reading was taken over. The marks were placed by hand on single frames;
 * nothing followed the ball, and the frame says so.
 *
 * The bounce is drawn on the release frame too. The camera does not move, so
 * where the ball pitched is the same spot in either frame. A reference that
 * moves between frames (a ball in the hand, a standing bowler) is only drawn
 * if it was marked on this frame, the rule Mark and Analysis follow; otherwise
 * the frame it was marked on is named beneath.
 */
function Evidence({
  framesDir,
  imageWidth,
  imageHeight,
  spec,
  calA,
  calB,
  release,
  bounce,
  confidence,
  connect,
}: {
  framesDir: string | undefined;
  imageWidth: number;
  imageHeight: number;
  spec: CalibrationSpec;
  calA: Point;
  calB: Point;
  release: Point;
  bounce: Point;
  confidence: MarkConfidence;
  connect: boolean;
}) {
  const { height: screenHeight } = useWindowDimensions();
  const [boxWidth, setBoxWidth] = useState(0);
  // Keyed on the frame number: the points are parsed afresh from the route on
  // every render, so the objects themselves change every time.
  const releaseFrame = release.frame;
  const uri = useMemo(
    () => (framesDir ? releaseFrameUri({ framesDir, release: { frame: releaseFrame } }) : null),
    [framesDir, releaseFrame]
  );
  // Remembered by uri, so the saved copy gets its own chance once it replaces
  // the cached one.
  const [failedUri, setFailedUri] = useState<string | null>(null);

  const scale =
    boxWidth > 0
      ? Math.min(boxWidth / imageWidth, (screenHeight * EVIDENCE_MAX_HEIGHT_SHARE) / imageHeight)
      : 0;
  const frame = { width: imageWidth * scale, height: imageHeight * scale };
  const at = (p: Point) => ({ x: p.x * scale, y: p.y * scale });

  const refsOnFrame = !spec.sameFrame || (calA.frame === release.frame && calB.frame === release.frame);

  const dots = useMemo(
    () =>
      connect && scale > 0
        ? pointsAlong(
            { x: release.x * scale, y: release.y * scale },
            { x: bounce.x * scale, y: bounce.y * scale },
            CONNECTOR_DOTS
          )
        : [],
    [connect, scale, release.x, release.y, bounce.x, bounce.y]
  );

  const showImage = uri !== null && failedUri !== uri && scale > 0;
  const bounceCaption = `Bounce marked on frame ${bounce.frame}`;
  const referenceCaption = refsOnFrame
    ? null
    : `${spec.short} reference marked on frame ${calA.frame}`;

  return (
    <View style={styles.evidence}>
      <View style={styles.evidenceHead}>
        <View style={styles.evidencePlate}>
          <Text style={styles.evidencePlateText}>RELEASE FRAME</Text>
        </View>
        <Text style={styles.evidenceFrame}>Frame {release.frame}</Text>
      </View>
      <View
        style={styles.evidenceBox}
        onLayout={(e: LayoutChangeEvent) => setBoxWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`The release frame with the marks you placed. Marked, not tracked. ${bounceCaption}.${referenceCaption ? ` ${referenceCaption}.` : ''}`}
      >
        {scale > 0 ? (
          <View style={[styles.frame, frame]}>
            {showImage ? (
              <Image
                source={{ uri }}
                style={frame}
                resizeMode="contain"
                fadeDuration={0}
                onError={() => setFailedUri(uri)}
              />
            ) : (
              <View style={[styles.frameMissing, frame]}>
                <Text style={styles.caption}>The release frame is not on this phone.</Text>
              </View>
            )}

            {refsOnFrame ? (
              <>
                <FrameMarker label={spec.a.short} active={false} left={at(calA).x} top={at(calA).y} />
                <FrameMarker label={spec.b.short} active={false} left={at(calB).x} top={at(calB).y} />
              </>
            ) : null}
            <PathDots points={dots} />
            <FrameMarker label="Release" active left={at(release).x} top={at(release).y} />
            <FrameMarker
              label="Bounce"
              active={confidence !== 'guessed'}
              confidence={confidence}
              left={at(bounce).x}
              top={at(bounce).y}
            />

            {/* Always on: the marks are the user's, not something the app found. */}
            <View style={styles.plate}>
              <Text style={styles.plateText}>Marked, not tracked</Text>
            </View>
          </View>
        ) : null}
      </View>
      <Text style={styles.caption}>{bounceCaption}</Text>
      {referenceCaption ? <Text style={styles.caption}>{referenceCaption}</Text> : null}
    </View>
  );
}

/** A label and its value side by side, or one above the other at large text. */
function Row({ label, value, stacked }: { label: string; value: string; stacked: boolean }) {
  return (
    <View style={stacked ? styles.rowStacked : styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { paddingHorizontal: space.md },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xl },

  h1: { ...type.h1, color: colors.text, textAlign: 'center' },
  h2: { ...type.h2, color: colors.text, marginBottom: space.sm },

  reading: { alignItems: 'center', paddingTop: space.lg, paddingBottom: space.xl },
  label: { ...type.label, color: colors.muted, marginBottom: space.sm },
  wicket: { marginTop: space.lg },

  noSpeed: { alignItems: 'center', paddingTop: space.lg, paddingBottom: space.xl },
  // Neutral: a delivery without a speed is not an error.
  noSpeedIcon: {
    width: size.target,
    height: size.target,
    borderRadius: radius.pill,
    borderWidth: stroke.medium,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  noSpeedBar: { width: space.lg, height: stroke.medium, backgroundColor: colors.text },
  noSpeedBody: { ...type.body, color: colors.text, textAlign: 'center', marginTop: space.sm },
  noSpeedNote: {
    ...type.body,
    color: colors.muted,
    textAlign: 'center',
    marginTop: space.sm,
    marginBottom: space.sm,
  },

  cautions: { gap: space.sm, marginBottom: space.lg },

  // A finished card: the frame set in a rounded, ruled panel under its own label plate.
  evidence: {
    marginBottom: space.xl,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  evidenceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  evidencePlate: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.control,
    backgroundColor: colors.bg,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  evidencePlateText: { ...type.label, color: colors.text },
  evidenceFrame: { ...type.caption, ...type.tabular, color: colors.muted },
  evidenceBox: { alignItems: 'center' },
  frame: {
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.control,
    backgroundColor: colors.bg,
  },
  frameMissing: { alignItems: 'center', justifyContent: 'center', padding: space.md },
  // Opaque, so it reads over any frame.
  plate: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  plateText: { ...type.caption, color: colors.text },
  caption: { ...type.caption, color: colors.muted, marginTop: space.sm, textAlign: 'center' },

  working: { marginBottom: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    borderBottomWidth: stroke.hairline,
    borderColor: colors.line,
    gap: space.md,
  },
  rowStacked: {
    paddingVertical: space.sm,
    borderBottomWidth: stroke.hairline,
    borderColor: colors.line,
  },
  rowLabel: { ...type.body, color: colors.muted, flexShrink: 1 },
  rowValue: { ...type.body, ...type.mono, color: colors.text },
  footnote: { ...type.caption, color: colors.muted, marginTop: space.md },

  footer: { gap: space.sm },
  // Pinned over the bottom of the page; the page pads itself by its measured height.
  footerSticky: {
    ...StyleSheet.absoluteFill,
    top: undefined,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: stroke.hairline,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  footerInFlow: { paddingTop: space.md },
  pair: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  stack: { gap: space.sm },
  pairItem: { flex: 1 },

  fallback: { flex: 1, justifyContent: 'center', paddingHorizontal: space.lg, gap: space.md },
  fallbackBody: { ...type.body, color: colors.muted, textAlign: 'center' },
});
