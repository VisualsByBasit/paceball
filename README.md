# Paceball

Paceball is an Android cricket bowling-speed analyser built with Expo and React Native. Record a delivery side-on, mark a known distance plus the ball's release and bounce frames, and Paceball calculates the **average speed to the bounce** with an uncertainty range. Recordings, marked points and measurements are processed locally; Paceball has no account system or measurement backend.

The project is being built for the RevenueCat Shipaton and Next Gen. Its central design rule is that an honest missing result is better than a confident invented one.

## What Paceball refuses to invent

- **No speed without a defensible bounce mark.** If the ball was not visible and the bounce was guessed, the delivery can still be saved, but it has no speed and is excluded from trends, comparisons and exports.
- **No spin rate or RPM.** A normal phone recording at roughly 60 fps cannot support that measurement.
- **No tracked flight path yet.** The current guide joins the points the user actually marked. It is labelled mark-to-mark and is not presented as automatic ball tracking.
- **No release-speed claim.** The reported number is average speed from release to bounce; release speed would be higher because the ball slows in flight.
- **No false confidence from poor framing.** Paceball warns when the chosen reference fills too little of the frame. That framing error is real and is not covered by the calculated uncertainty range.

## How the measurement works

1. Choose a known reference: the 20.12 m between the stumps, a measured marker distance, the ball diameter, or the bowler's saved height.
2. Mark both ends of that reference. Their pixel separation establishes pixels per metre.
3. Mark the release and bounce frames and positions.
4. Convert the marked travel from pixels to metres, and the frame difference to seconds using the frame rate read from that recording.
5. Calculate distance divided by time and convert it to km/h or mph.

Every measured speed is accompanied by an error range. The range combines frame-timing uncertainty, reference-length uncertainty, and pixel-marking uncertainty for both the calibration and delivery marks. An uncertain but visible bounce receives a wider range; a guessed bounce receives no speed.

## Current features

- Live Android video capture with frame-by-frame marking, on the standard or ultra-wide lens where the phone has one
- Sound recorded with the video when the microphone is allowed; declining records video only and measures exactly the same way
- Stumps, markers, ball and player-height calibration
- Per-reading uncertainty and bounce-confidence handling
- Per-player local storage; profile switching is not yet exposed in the app
- Local History, Trends and delivery comparison
- Slow-motion delivery replay, muted by default on every clip, with a sound switch
- Shareable PNG result cards: watermarked for free users, clean for Pro
- A weekly free allowance and a RevenueCat-backed Pro entitlement
- Optional, consent-gated JavaScript and native crash reports through Sentry

Video export with a burned-in replay HUD is a development-only spike on the debug screen, not part of the supported export flow. Its exports are silent by default and carry sound only when it is switched on for that export.

## Requirements

- Git
- Node.js and npm
- Android Studio with an Android SDK, platform tools and a configured emulator or USB-connected Android device
- A Java version supported by the installed Android Gradle Plugin (JDK 17 is the usual Expo/React Native setup)
- Android 9 / API 28 or newer for frame-accurate extraction

Paceball includes native Android code and native React Native dependencies. **Expo Go cannot run it.** Use a development build or a locally compiled Android app.

## Clean-clone setup

```bash
git clone https://github.com/VisualsByBasit/paceball.git
cd paceball
npm ci
```

No environment variables are required to exercise the measurement flow, local storage, History, Analysis, tests or the paywall UI.

### Run locally on Android

Start an emulator or connect an Android phone with USB debugging enabled, then build and install the development app:

```bash
npx expo run:android --device
```

For later JavaScript-only runs, start Metro for the installed development client:

```bash
npx expo start --dev-client
```

The first native build downloads Android and Gradle dependencies and can take several minutes. Camera behaviour, frame extraction and export should be verified on a physical phone; an emulator cannot meaningfully reproduce the complete recording workflow.

### EAS development build

If you use Expo Application Services and are signed into an Expo account:

```bash
npx eas-cli build --profile development --platform android
npx expo start --dev-client
```

The checked-in `eas.json` also provides `preview` (APK) and `production` profiles.

## Running without a RevenueCat key

Leave `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` unset. Paceball then:

- does not configure RevenueCat or contact Google Play for purchases;
- treats the user as free;
- renders a clearly labelled mock offering so judges can inspect the paywall; and
- disables purchasing and reports that the store is not connected.

The mock offering is presentation data only. It never fabricates a successful purchase or Pro entitlement, and it never appears in a build that has a key: there the paywall shows the store's own offering, or says the plans could not be loaded.

For a build connected to the real store, provide RevenueCat's **public Android SDK key** through the build environment:

```text
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=...
```

Real purchase testing also requires the matching Google Play application, products, offering and `pro` entitlement to be configured in RevenueCat. Do not commit private service credentials.

## Optional Sentry diagnostics

JavaScript and native crash reports are supported. Both are off by default, and nothing is sent unless the build carries a public DSN and the user opts in inside the app:

```text
EXPO_PUBLIC_SENTRY_DSN=...
```

- JavaScript reports pass through the privacy scrubber in `src/diagnostics/privacy.ts`, which builds a new event from an allow-list: reviewed static error messages only, no names, paths, breadcrumbs, screenshots or view hierarchy.
- Native reports come from Sentry's native SDK and may contain limited technical device and crash state that the app cannot filter. The in-app privacy screen says so.
- Development builds do not upload source maps (`SENTRY_DISABLE_AUTO_UPLOAD` in `eas.json`). Preview and production builds upload them when the private build credentials (`SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`) are set in the EAS environment. None belongs in the repository.

`docs/sentry-setup.md` walks through setting up the project and checking a preview build end to end.

## Tests

The automated suite covers storage recovery, measurement uncertainty, privacy filtering, purchases and allowances, exports, comparison, camera fallbacks and UI contracts.

```bash
npm test
npm run typecheck
```

The test total changes as coverage grows, so this README intentionally does not pin a count. A successful run ends with zero failed tests, and typecheck completes without emitting files.

## Website

`website/` is the public site, live at <https://paceballpro.vercel.app>: the landing page, the privacy policy and the terms. It is a separate Next.js project with its own `package.json`, deployed on Vercel with `website` as the root directory. The app never imports from it, and Metro, the root typecheck and the EAS upload all leave it out.

```bash
cd website
npm ci
npm run lint
npm run build
```

## Repository layout

```text
app/                     Expo Router screens and user flows
src/capture/             Frame extraction orchestration and capture helpers
src/data/                MMKV persistence, validation, profiles and queries
src/diagnostics/         Consent-gated Sentry setup and privacy scrubber
src/export/              Result-card rendering and export preparation
src/physics/             Calibration, speed and uncertainty model
src/purchases/           RevenueCat adapter, entitlement and allowance rules
src/settings/            Local app preferences
src/types/               Shared domain contracts
src/ui/                  Design tokens and reusable interface components
modules/frame-extractor/ Local Expo/Kotlin module for video metadata and frames
website/                 Public site: landing page, privacy policy and terms
tests/                   Node test suite
docs/                    Engineering handoffs, the audit and the device test plan
scripts/                 Review tooling
```

The `docs/` directory records engineering handoffs, review boundaries and implementation decisions as evidence of how the project was built in public.

## Privacy

Paceball never uploads videos or measurements and does not require an account. Recordings, the sound recorded with them, extracted frames, player profiles and readings live in app storage, and the measurement runs on the phone. Android's own backup may copy app data to the user's backup, and anything a user explicitly saves or shares can remain outside the app.

What can leave the phone, and when:

- **RevenueCat and Google Play, on every launch** of a build with a RevenueCat key: the app asks RevenueCat whether this phone has Pro, and Google Play for the plans, their prices and any existing purchase. This check is not optional, and it is named as such.
- **Google Play and RevenueCat, when subscribing or restoring:** the purchase, an anonymous app user ID and device details such as the Android and app version.
- **Sentry, only after opting in:** crash reports, as described above.
- **Whatever the user chooses to share,** such as a result card.

None of these is given videos, sound, player names, marked points or speeds by Paceball.

Permissions: the camera, to record; the microphone, optional, to keep the sound of the delivery (recording works without it); and permission to add an image to the gallery when saving one, where Android asks. Reading the gallery is blocked in the manifest.

The in-app privacy screen (Settings, Privacy and crash reports) and the website's privacy policy, <https://paceballpro.vercel.app/privacy>, say the same thing, and tests hold both to it.

Deleting a delivery removes its private video, extracted frames and stored record. Uninstalling removes app-private data, subject to Android backup and copies the user previously saved or shared.

## Current limitations

- Android only
- Live capture only; video import is deliberately unavailable
- Approximately 60 fps capture through third-party Android camera APIs; 120 fps is not promised
- Manual calibration, release and bounce marking
- Average speed to bounce, not radar-certified release speed
- No automatic trajectory, spin measurement or cloud synchronisation
- Native features require a development or production build and physical-device verification

## License

Paceball is released under the [MIT License](LICENSE). The license file is at the repository root so it is visible from the project landing page.
