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

Session carries uncertaintyModelVersion (1 = frame timing only,
2 = timing plus reference and pixel marking combined). Sessions using
markers calibration also carry markerSource and, when paced, paceCount.
Session also carries markConfidence for the bounce mark, absent on
records saved before it was asked for, which are read as seen.
getSession(id) returns null for a deleted session and throws for a
corrupt one.

## Non-negotiable rules

- NEVER display a metric that can't be measured. No spin rate, no RPM,
  no spin type. They cannot be derived from 60fps video.
- ALWAYS show the error range alongside the speed, computed per reading.
  Never a fixed figure. Four independent relative terms, combined in
  quadrature:

    relative² = (kTiming/frameDelta)²   the frame the marks landed on
              + refUncertainty²          the reference length itself
              + (2σ/calPixelDist)²       marking the calibration
              + (2σ/travelPixelDist)²    marking release and bounce

  σ is 3 px in the space the points are marked in; a caller working in
  video pixels scales it by the same factor it scaled the points up by.
  kTiming is 2. Reference uncertainty is per method — stumps 0.005, ball
  0.01, height 0.02 — and for markers per markerSource: measured 0.005,
  paced with a measured shoe 0.01, paced from shoe size 0.05. Markers
  with no recorded source take the widest of those three, because stored
  data cannot say which it was. Round the result up. Readings computed
  this way record uncertaintyModelVersion 2.

  The pixel terms matter more than the reference values. ±3 px across
  stumps 1000 px apart is 0.6%; the same ±3 px across a ball 12 px wide
  is 50%. Ball calibration must report itself as that wide.

- ALWAYS ask, on the bounce step, whether the ball was visible in the
  frame being marked. Three answers, defaulting to seen. 'uncertain'
  raises σ to 10 px and kTiming to 4 for that reading. 'guessed' produces
  NO speed at all — computeSpeed returns null rather than a number, and
  a null speed is never displayed, exported or counted into a trend.

  Nothing else read off that mark is shown either. The flight time, the
  frame delta and the distance travelled are withheld with the speed, and
  the travel warning is suppressed along with them, because it quotes the
  distance in its own sentence. All of them stay stored on the session:
  it is the display and the export that withhold them, not the record.
  The fps, the marked frame numbers, the scale reference and
  pixels-per-metre still show, because none of those come off the bounce.

  The delivery can still be saved, keeping the clip and the marks,
  carrying no reading. Validation rejects a guessed bounce stored with a
  number, and a seen bounce stored without one.
- Label it "avg speed to bounce", not "ball speed". Release speed is
  5–8% higher due to drag.
- Warn on implausible travel, on two independent bounds. The ruler bound
  applies only where the reference is laid along the pitch (stumps,
  markers): travel reaching 80% of calRealMetres means the marks are
  probably wrong. The physical bound applies to every method: nothing
  covers more than 18 m between release and bounce, whatever it was
  scaled against. A ball is 0.072 m and a bowler under 2 m, so travel
  past those is normal and must not warn. No lower bound — a short
  indoor throw off markers can legitimately be 3 m.
- fps is a float read per-file (59.8–60.05). Never hardcode 60.
- Minimum 3-second recordings. Shorter clips give unreliable fps.
- Live capture only. No video import.
- Paceball never uploads videos or measurements. No backend of our own,
  no accounts; measurement runs entirely on the phone. That specific
  promise is the claim, so never weaken it to "offline measurement" and
  never widen it to "nothing leaves the device". What can leave is
  named wherever the promise is made, and only with consent: crash
  reports to Sentry when opted in (no videos, names or speeds), the
  purchase through Google Play and RevenueCat when subscribing or
  restoring, and a card the user chooses to share. Android auto-backup is on, so don't
  claim videos or measurements "never leave the phone" either — the OS
  can copy app data to the user's own backup.
- Free exports carry the Paceball watermark. That is the growth loop.

## Ownership

- AB owns: app/, website/, src/ui/, src/capture/, src/physics/, src/types/,
  src/settings/, src/purchases/, modules/frame-extractor/
- MU owns: src/data/, src/export/, src/diagnostics/

Stay in your half. If a change genuinely requires touching the other
side — wiring a feature into a screen, fixing an integration bug —
that's fine, but say so explicitly and explain why.

## Website

website/ is the public site (landing, privacy policy, terms): a separate
Next.js project with its own package.json and lockfile, deployed on Vercel
with website as the root directory. The app never imports from it, nor it
from the app. Metro blocks it, the root tsconfig excludes it, .easignore
keeps it out of EAS uploads, and tests/website.test.cjs holds all of that in
place. BETA_URL and the contact address live in website/lib/site.ts.

The privacy policy there must match what the app does. When the app starts
sending something new, or asks for a new permission, update
website/app/privacy/page.tsx in the same change.

## Stack

Expo SDK 57 · expo-router · react-native-vision-camera v5 (Nitro API)
· react-native-mmkv · expo-file-system · @shopify/react-native-skia
· expo-media-library · expo-sharing · expo-video · RevenueCat
· Reanimated · local Kotlin module for frame extraction

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
· capture · mark · result · analysis · history · settings · diagnostics
· paywall · practice (throwaway) · debug (throwaway)

Paywall renders a mocked offering and purchasing is not connected;
restore is real. Nothing routes to it yet — its triggers wait on the
watermark-free export in SessionActions and on the analysis limit.

Not built: pre-flight check · compare (droppable)