# Paceball

Paceball measures how fast a cricket ball was bowled, from a video recorded on an Android phone.
You mark a known distance and the ball at release and at bounce; it returns the average speed with its own error range.

## Screenshots

_Screenshots to come: Home, Capture, Mark, Result and the share card._

## Requirements

- **Node.js 24** and npm (Codemagic builds on Node 24 too; see `codemagic.yaml`)
- **An Android phone**, Android 9 (API 28) or newer, with USB debugging on. The camera, frame extraction and export need real hardware; an emulator cannot reproduce the recording workflow.
- **An Expo account**, for EAS builds (`npx eas-cli login`)
- For local builds only: Android Studio with the Android SDK, and JDK 17

Paceball has native code (a local Kotlin module and native libraries), so **Expo Go cannot run it**. It runs in a development build.

## Install and run

```bash
git clone https://github.com/VisualsByBasit/paceball.git
cd paceball
npm ci
```

Make a development build once, and install it on the phone. Either in the cloud:

```bash
npx eas-cli build --profile development --platform android
```

or on this machine, with the phone connected:

```bash
npx expo run:android --device
```

Then, for every JavaScript change, start Metro for the installed development client:

```bash
npx expo start --dev-client
```

## Tests

```bash
npm test
npx tsc --noEmit
```

The suite covers the measurement and uncertainty model, storage and recovery, purchases and the weekly allowance, the privacy filter, exports, comparison, camera fallbacks and the screens' contracts. It grows with the app, so no count is written here. A good run ends with no failures, and the typecheck prints nothing.

## Building

`eas.json` has three profiles: `development` (development client), `preview` (installable APK) and `production` (Play Store AAB).

- **EAS cloud:** `npx eas-cli build --profile production --platform android`
- **Codemagic:** `codemagic.yaml` runs the same build on a Codemagic machine with `eas build --local`, so it uses no EAS build quota. It reads its secrets from a Codemagic environment group named `expo`, and saves `paceball.aab` as the artifact.

## Environment variables

Set these in the EAS environment or the Codemagic group, never in the repository. Only the names are listed here.

| Name | What it does |
|---|---|
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | RevenueCat's public Android SDK key. Turns on the real paywall, purchases and restores. |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry's public DSN. Makes optional crash reports available; nothing is sent until the user opts in. |
| `SENTRY_AUTH_TOKEN` | Build time only. Lets preview and production builds upload source maps to Sentry. |
| `SENTRY_ORG` | Build time only. The Sentry organisation the source maps go to. |
| `SENTRY_PROJECT` | Build time only. The Sentry project the source maps go to. |
| `EXPO_TOKEN` | An Expo access token, so a CI machine such as Codemagic can run EAS without logging in. |

**The app runs without any of them.** With no RevenueCat key it never contacts RevenueCat or Google Play, treats everyone as free, and shows a sample paywall labelled as a sample, with purchasing switched off. It never pretends a purchase happened. With no Sentry DSN, crash reporting says it is not available in this build and nothing is sent. Measuring, History, Analysis, the share card and the tests all work with no keys at all.

### Crash reports

JavaScript and native crash reports are supported. Both are off by default, and nothing is sent unless the build carries a DSN and the user turns them on in the app.

- JavaScript reports pass through the allow-list in `src/diagnostics/privacy.ts`: reviewed static error messages only, no names, paths, breadcrumbs, screenshots or view hierarchy.
- Native reports come from Sentry's native SDK and may contain limited technical device and crash state that the app cannot filter. The in-app privacy screen says so.
- Development builds do not upload source maps (`SENTRY_DISABLE_AUTO_UPLOAD` in `eas.json`). `docs/sentry-setup.md` walks through the rest.

## Project structure

```text
app/                     Screens (Expo Router): home, setup, capture, mark, result,
                         analysis, history, compare, stats, settings, privacy, paywall
src/physics/             Calibration, speed and the uncertainty model
src/capture/             Recording and frame-extraction helpers
src/data/                On-phone storage (MMKV), validation, players and comparisons
src/export/              The share card, and the video clip's plan and share actions
src/purchases/           RevenueCat, the Pro entitlement and the weekly allowance
src/diagnostics/         Opt-in Sentry setup and its privacy filter
src/ui/                  Design tokens and shared components
src/settings/, src/types/ Preferences and shared types
modules/frame-extractor/ Local Kotlin module: video metadata, frames, Media3 export
assets/                  Launcher icon
website/                 The public site (separate Next.js project, never imported)
tests/                   Node test suite
docs/                    Design brief, handoffs and the device test plan
```

## Honesty rules

These are held by tests, not only by intention.

- **No seen bounce, no speed.** Every bounce mark says whether the ball was seen, uncertain or guessed. A guessed bounce gives no speed at all, and nothing measured from it is shown, exported or counted into a trend. The delivery can still be saved without a reading.
- **No speed without its range.** Every reading carries an error range worked out for that delivery from frame timing, the reference length and how precisely each mark could be placed. The app has no way to show a speed alone.
- **Average speed, release to bounce.** That is what is measured, and it is always labelled that way. Release speed is higher, because the ball slows in the air.
- **Nothing that cannot be measured.** No spin, no RPM, no tracked flight path: the line on screen joins the two marks the user placed and says "Marked, not tracked".
- **A warning when the marks look wrong,** and when the reference was small in frame, which is an error the range cannot cover.

## Privacy

Paceball never uploads videos or measurements, has no account, and runs the measurement on the phone. Android's own backup may copy app data to the user's backup, and anything the user saves or shares can remain outside the app.

What can leave the phone, and when:

- **RevenueCat and Google Play, on every launch** of a build with a RevenueCat key: whether this phone has Pro, and the plans, their prices and any existing purchase. This check is not optional.
- **Google Play and RevenueCat, when subscribing or restoring:** the purchase, an anonymous ID and device details.
- **Sentry, only after opting in:** crash reports, as above.
- **Whatever the user chooses to share,** such as a result card.

Deliveries can be shared as an image card or as a short video clip with the reading burned in. Free exports carry a translucent "PACEBALL FREE" band across the picture, clear of the marks and the reading; Pro's are clean.

Permissions: the camera; the microphone, optional, to keep the sound of the delivery (it measures the same without); and adding an image to the gallery when saving one. Reading the gallery is blocked in the manifest. Replays are muted by default on every clip, and exports are silent by default.

The in-app privacy screen and <https://paceballpro.vercel.app/privacy> say the same thing, and tests hold both to it.

## Licence

MIT. See [LICENSE](LICENSE).
