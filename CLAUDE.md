# Paceball

Cricket bowling speed analyser. Records a delivery on the phone camera,
you mark four points, it returns ball speed. Android, Expo, React Native.

Built for RevenueCat Shipaton 2026. Production submission ~22 September,
gated by Google Play's 14-day closed testing requirement.

## How the measurement works

The scale reference is the RULER, not the distance travelled.

1. Mark two ends of a KNOWN real-world distance → pixelsPerMetre.
   Four references, picked before marking: stumps (20.12 m, the
   default), markers (a distance the user measures), ball (0.072 m),
   bowler height (from the player profile). Never assume 20.12 —
   calRealMetres comes from the chosen method.
2. Mark release and bounce → pixel distance the ball travelled
3. pixel distance / pixelsPerMetre → real metres (~11 m, NOT 20.12)
4. frames between marks / fps → seconds
5. metres / seconds × 3.6 → km/h

The ball is released ~2 m past the crease and pitches 6–8 m short of
the far stumps. Assuming the full pitch length would nearly double
every reading.

Points are marked in the extracted JPEG's pixel space, which is capped
at 1280 on the long edge. They are scaled up to video dimensions before
saving, and pixelsPerMetre must be scaled by the same factor.

## Non-negotiable rules

- NEVER display a metric that can't be measured. No spin rate, no RPM,
  no spin type. They cannot be derived from 60fps video.
- ALWAYS show the error range alongside the speed, computed per reading
  from the frame delta. Never a fixed figure — the uncertainty depends
  on distance and frame rate.
- Label it "avg speed to bounce", not "ball speed". Release speed is
  5–8% higher due to drag.
- Warn when travel distance approaches the calibration distance. That
  means the marks are probably wrong.
- fps is a float read per-file (59.8–60.05). Never hardcode 60.
- Minimum 3-second recordings. Shorter clips give unreliable fps.
- Live capture only. No video import.
- Everything on-device. No backend, no accounts, no upload.
- Free exports carry the Paceball watermark. That is the growth loop.

## Ownership

- AB owns: app/, src/ui/, src/capture/, src/physics/, src/types/,
  modules/frame-extractor/
- MU owns: src/data/, src/export/

Stay in your half. If a change genuinely requires touching the other
side — wiring a feature into a screen, fixing an integration bug —
that's fine, but say so explicitly and explain why.

## Stack

Expo SDK 57 · expo-router · react-native-vision-camera v5 (Nitro API)
· react-native-mmkv · expo-file-system · @shopify/react-native-skia
· expo-media-library · expo-sharing · RevenueCat · Reanimated
· local Kotlin module for frame extraction

Use `npx expo install`, never plain `npm install`, for native packages.

There is a worklets override in package.json resolving a conflict
between Reanimated and expo-modules-core. Do not remove it.

FFmpeg is dead — retired January 2025. Frame extraction uses
MediaMetadataRetriever.getFramesAtIndex(), API 28+.

120fps is not available. CameraX does not expose it to third-party
apps. Do not promise it anywhere.

## Design

Tokens in src/ui/tokens.ts. Never hardcode colours, spacing, radii,
opacities or stroke widths.

Near-black #0A0B0D, one accent: electric lime #D4FF3F, used only for
meaning — the ball, measured data, primary actions. Never decorative.

type.mono for measured data only. type.tabular for numbers that change
in place, like timers and frame counters.

Numbers are the hero. Flat — no shadows, no gradients on surfaces, no
glassmorphism.

## Screens

Built: index (home) · setup/player · setup/how-it-works · setup/camera
· capture · mark · result · debug (throwaway)

Not built: analysis · history · export screen · paywall · settings
· pre-flight check · compare (droppable)