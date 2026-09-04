# Paceball

Cricket bowling speed analyser. Records a delivery on the phone camera,
you mark four points, it returns ball speed. Android, Expo, React Native.

Shipping to Google Play by 20 September 2026 for RevenueCat Shipaton.

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

## Non-negotiable rules

- NEVER display a metric that can't be measured. No spin rate, no RPM,
  no spin type. They cannot be derived from 60fps video.
- ALWAYS show the error range alongside the speed. ±4 km/h at 60fps.
- Label it "avg speed to bounce", not "ball speed". Release speed is
  5–8% higher due to drag.
- fps is a float read per-file (59.8–60.05). Never hardcode 60.
- Minimum 3-second recordings. Shorter clips give unreliable fps.
- Live capture only. No video import.
- Everything on-device. No backend, no accounts, no upload.

## Ownership — do not cross

- AB owns: app/, src/ui/, src/capture/, src/physics/, src/types/,
  modules/frame-extractor/
- MU owns: src/data/, src/export/
- Never edit files outside your half.

## Stack

Expo SDK 57 · expo-router · react-native-vision-camera v5 (Nitro API)
· react-native-mmkv · RevenueCat · Reanimated · local Kotlin module for
frame extraction

Use `npx expo install`, never plain `npm install`, for native packages.
FFmpeg is dead — frame extraction uses MediaMetadataRetriever.

## Design

Tokens in src/ui/tokens.ts. Never hardcode colours or spacing.
Near-black #0A0B0D, one accent: electric lime #D4FF3F, used only for
meaning — the ball, measured data, primary actions. Never decorative.
Numbers are the hero. Flat, no shadows, no gradients.

## Screens

00 Get Started · 01–02 Setup · 03 Pre-flight check · 04 Capture ·
05 Mark · 06 Result · 07 Analysis · 08 History · 09 Export ·
10 Paywall · 11 Compare (droppable) · 12 Settings