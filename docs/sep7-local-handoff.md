# Mustafa's local work through 7 September

Base: GitHub main `10c355f`, fetched 5 September 2026. Local branch:
`codex/sep7-local`. The implementation was initially kept local; the user has
since authorized committing and pushing this branch for Basit's review.
No merge into main, release build or app publication is part of this handoff.

## Implemented

- `getComparison` reads both saved sessions and returns B minus A. Speed identifies
  the faster delivery; distance and angle are descriptive. Angle is omitted if
  either value is null. Missing/corrupt sessions produce errors rather than mocks.
- `renderExport` produces a real 1080 x 1200 PNG with Skia. It loads the saved
  release frame, maps session points to the fitted image, and displays recorded
  speed, uncertainty, travel distance and calibration. The straight line is
  labelled as the connection between marks, not a tracked flight path.
- Free UI exports always carry PACEBALL branding. The renderer supports a clean
  variant for later entitlement integration. `videoPath` remains null as required
  by Update 02's image-first scope.
- Saved results now expose preview, gallery-save and system-share controls.
  The existing development-only debug session list exposes the same controls and
  confirmed deletion. This is not a replacement History or Compare screen.
- Gallery saving requests write-only access; broad photo/audio/video read
  permissions are blocked in Android configuration. Permission denial and
  unavailable sharing have explicit messages. PNGs live in the app cache; gallery
  copies and shared images remain independent of deleted deliveries.
- Fixed saved calibration scale to match the upscaled points; export geometry
  preserves orientation and letterboxes rather than cropping the image.
- Fixed concurrent saves overwriting an index snapshot. Wait for frame extraction
  before advancing to Result, prevent duplicate save taps, and handle Android Back
  during/after saving so it does not reopen deleted cache media.
- Clamp exposure requests to device capabilities, disable recording until camera
  startup, remove VIDEO INFO logging, and replace the unsupported fixed +/-4 claim
  with per-reading uncertainty wording. Hardware application of exposure still
  needs a phone check.
- Added Skia 2.6.2, Media Library 57.0.4 and Sharing 57.0.18. Aligned Expo to
  57.0.20 and Router to 57.0.19 using Expo's installer. Lockfile is included.

Most implementation is in `src/data` and `src/export`. Small changes in Basit's
screens/capture code wire the requested feature into the runnable local app and
correct the previously reviewed integration issues; review those together.

## Verification and limits

- `npm test`: 30 tests pass. Includes comparisons, nullable angles, storage
  recovery, concurrent saves, date filtering, file rollback, gallery-denial and
  sharing-failure paths, portrait/landscape transforms and exposure bounds.
- Both watermark variants are rendered as genuine PNGs using Skia CanvasKit.
  The production export function also runs against real Skia with simulated
  filesystem/gallery bridges. PNG signatures and dimensions are checked.
- `npm run typecheck`: passed.
- `npx expo-doctor`: all 21 checks passed after SDK patch alignment.
- Android Expo production bundle: passed. This is JavaScript/Hermes compilation,
  not an APK or Kotlin/C++ build.
- Android prebuild completed; manifest inspection confirms media read permissions
  are removed and older-Android write permission is present. Skia Android static
  libraries are present locally.
- The rendered landscape and portrait test cards were visually inspected. They
  use synthetic frames, not footage proving cricket-measurement accuracy.
- `npm audit --omit=dev` reports 14 moderate dependency-chain entries rooted in
  decode-uri-component and uuid. Sharing adds another affected path to the
  existing Expo configuration dependency. No high/critical entries were reported.
  Do not use the suggested breaking Expo/Router downgrades as an automatic fix.

The tests cannot establish camera operation, native Android rendering, gallery
prompts, hardware restart persistence or measurement accuracy. ADB/Android SDK is
not configured here and there is no connected test device. Those are the remaining
release gate, not a claim covered by the passing tests.

## Try it on an Android phone

This working copy is separate from the Desktop checkout. Run commands here:

```powershell
cd 'C:\Users\musta\OneDrive\Documents\ChatGPT\shipaton hackaton\paceball-local'
npm test
npm run typecheck
```

The rendering tests use a local system TTF. Windows Arial, Linux DejaVu Sans and
macOS Arial are detected; set `PACEBALL_TEST_FONT` to another TTF when needed.
Set `PACEBALL_TEST_ARTIFACTS` to an output folder to keep synthetic PNG previews.

New native libraries require rebuilding the development app; the previous APK
will not acquire them through Metro. On a machine with the current React Native
Android toolchain and an authorized connected phone, use `npx expo run:android`.
No build was queued on EAS by this task.

Device acceptance checklist:

- [ ] Film real bowling side-on; complete calibration, release and bounce marking.
- [ ] Save and create an image. Check the overlay against the actual marked pixels.
- [ ] Save the PNG to gallery and open it there; test denial and retry where the OS requests permission.
- [ ] Open and cancel the share sheet; then share to a chosen destination manually.
- [ ] Force-stop Paceball (do not clear app data), reopen, and inspect the saved
  record and media via the development debug list. Re-export successfully.
- [ ] Repeat with portrait and landscape recordings.
- [ ] Cancel deletion and verify the record remains. Confirm deletion on a test
  delivery and verify its video/frames disappear. Check previously saved gallery
  PNG remains, as the warning promises.
- [ ] Rapid Save taps create only one delivery. Back after saving returns home.
- [ ] Check a second phone's exposure range and actual applied exposure.

## Tester logistics still need people and Console evidence

The repository contains EAS build profiles, but no verified tester roster or
opt-in evidence was supplied. `closed-testing-tracker.csv` is a blank worksheet,
not evidence of invitations. Obtain tester email addresses, Console opt-in status,
the actual testing start date and installable build from Basit. Do not mark this
complete from an APK install alone. No invitations or messages have been sent.

Video export, full History/Compare screens, profile switching and RevenueCat
entitlement wiring remain later work under the agreed plan.

## API references checked

- https://shopify.github.io/react-native-skia/docs/images/
- https://shopify.github.io/react-native-skia/docs/getting-started/headless/
- https://docs.expo.dev/guides/sdk-libraries-migration/media-library/
- https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo/CHANGELOG.md
- https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-router/CHANGELOG.md
