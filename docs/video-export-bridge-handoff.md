# Share-video Media3 spike handoff

Basit approved a Media3 Transformer spike after the pure export plan landed.
This branch now implements the spike locally; it does not replace or modify the
existing PNG export path.

## What the spike does

- Reads the original private MP4 and trims it from one second before release to
  one second after bounce, clamped to the real source duration.
- Uses Media3 Transformer for decode, effects, MediaCodec encode and MP4 muxing.
  It never rebuilds a video from the capped JPEG marking frames.
- Burns a CanvasOverlay into each output frame: the two calibration points,
  release, bounce, the two mark-to-mark lines, average speed, the recomputed
  uncertainty range, and a label saying the path is not tracked.
- Counts the displayed speed from zero at release to the measured average at
  bounce. This is presentation only and is still labelled average speed.
- Removes audio by default. It keeps the original audio track only after the
  tester explicitly enables it.
- Reads the current entitlement when export starts. Free output has a Paceball
  watermark; Pro output is clean. No entitlement is stored in a Session.
- Rejects guessed and unusable measurements before native export.
- Writes only to Paceball's private cache, supports progress and cancellation,
  deletes partial output on failure/cancel, and leaves the source recording
  untouched.

## Coordinate contract

The four marks are made on display-oriented JPEG frames capped at 1280 on the
long edge, then `result.tsx` scales the points into full-resolution video pixels
before saving. The saved space remains display-oriented, so it can still be
swapped relative to the MP4's encoded width and height when rotation metadata
is present. The plan therefore carries both views:

- `source`: the original MP4 width, height and rotation from native metadata.
- `overlay.width` / `overlay.height`: the saved session's full-resolution,
  display-oriented dimensions.

Native code maps the saved points to the actual Media3 canvas. It accepts a
canvas in source orientation or display orientation and reports the mapping
mode in the result. A mismatched aspect ratio fails instead of drawing in the
wrong place. Keeping both sizes also makes older or malformed geometry fail
explicitly rather than silently drawing in the wrong location.

## Device checkpoint

Open **Debug · saved sessions**, choose a saved measured delivery, and use the
**Media3 video spike** controls. Record these results before this can be merged
or shipped:

1. Landscape video: all four points land on the same pixels as Mark/Analysis.
2. Portrait video: all four points land correctly after rotation.
3. Free: `PACEBALL` is visibly burned into the shared MP4.
4. Pro: the watermark is absent while the measurement HUD remains.
5. Audio off: the shared file has no audio track.
6. Audio on: original audio is retained.
7. Cancel: partial output disappears and another export can start.
8. Measure input/output sizes and real encode time on the target phone,
   including one higher-bitrate Pro recording.
9. Re-run capture, mark, result, still export, purchase and restore on the fresh
   production build because Media3 changes the native dependency graph.

As of this local checkpoint, the JavaScript suite and typecheck pass, but native
compilation and these phone checks are not complete on this PC: no Android SDK
or `adb` is installed. Do not present the spike as device-verified until the
matrix above has real results.

## Explicit ownership exception

The review-boundary script reports this branch because the spike necessarily
touches Basit's native boundary and its existing throwaway debug screen. Basit
explicitly approved the Media3 spike and required a real-phone checkpoint, so
the following files are intentional review items, not accidental ownership
drift:

- `modules/frame-extractor/android/build.gradle`
- `modules/frame-extractor/android/src/main/java/expo/modules/frameextractor/FrameExtractorModule.kt`
- `modules/frame-extractor/android/src/main/java/expo/modules/frameextractor/VideoExporter.kt`
- `modules/frame-extractor/src/FrameExtractorModule.ts`
- `app/debug.tsx`

No production feature screen was wired. The debug change only exposes the
native checkpoint controls under `__DEV__`; Basit should review these files and
must not merge until the native build and phone matrix pass.
