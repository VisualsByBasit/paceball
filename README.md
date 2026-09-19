# Paceball

Paceball is an Android cricket bowling-speed analyser built with Expo and React Native. Record a delivery side-on, mark a known distance plus the ball's release and bounce frames, and Paceball calculates the **average speed to the bounce** with an uncertainty range. Recordings, marked points and measurements are processed locally; Paceball has no account system or measurement backend.

The project is being built for the RevenueCat Shipaton and Next Gen. Its central design rule is that an honest missing result is better than a confident invented one.

## What Paceball refuses to invent

- **No speed without a defensible bounce mark.** If the ball was not visible and the bounce was guessed, the delivery can still be saved, but it has no speed and is excluded from trends, comparisons and exports.
- **No spin rate or RPM.** A normal phone recording at roughly 60 fps cannot support that measurement.
- **No tracked flight path yet.** The current guide joins the points the user actually marked. It is labelled mark-to-mark and is not presented as automatic ball tracking.
- **No release-speed claim.** The reported number is average speed from release to bounce; release speed would be higher because the ball slows in flight.

## How the measurement works

1. Choose a known reference: the 20.12 m between the stumps, a measured marker distance, the ball diameter, or the bowler's saved height.
2. Mark both ends of that reference. Their pixel separation establishes pixels per metre.
3. Mark the release and bounce frames and positions.
4. Convert the marked travel from pixels to metres, and the frame difference to seconds using the frame rate read from that recording.
5. Calculate distance divided by time and convert it to km/h or mph.

Every measured speed is accompanied by an error range. The range combines frame-timing uncertainty, reference-length uncertainty, and pixel-marking uncertainty for both the calibration and delivery marks. An uncertain but visible bounce receives a wider range; a guessed bounce receives no speed.

## Current features

- Live Android video capture with frame-by-frame marking
- Stumps, markers, ball and player-height calibration
- Per-reading uncertainty and bounce-confidence handling
- Multiple local player profiles
- Local History, Trends and delivery comparison
- Slow-motion delivery analysis
- Shareable PNG result cards with a watermark for free users
- Weekly free-use allowance and a RevenueCat-backed Pro entitlement
- Optional, consent-gated and privacy-scrubbed JavaScript crash reports

Video export with a burned-in replay HUD is experimental work and is not part of the current supported export flow.

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

The mock offering is presentation data only. It never fabricates a successful purchase or Pro entitlement.

For a build connected to the real store, provide RevenueCat's **public Android SDK key** through the build environment:

```text
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=...
```

Real purchase testing also requires the matching Google Play application, products, offering and `pro` entitlement to be configured in RevenueCat. Do not commit private service credentials.

## Optional Sentry diagnostics

Crash reporting is off unless both a public DSN is configured and the user opts in inside the app:

```text
EXPO_PUBLIC_SENTRY_DSN=...
```

The current integration sends scrubbed JavaScript errors only. Native crash handling, screenshots, view hierarchy, breadcrumbs, performance traces and replay are disabled. Source-map upload is disabled in `eas.json` until a Sentry project and private build credentials are configured outside the repository.

## Tests

The automated suite covers storage recovery, measurement uncertainty, privacy filtering, purchases and allowances, exports, comparison, camera fallbacks and UI contracts.

```bash
npm test
npm run typecheck
```

The test total changes as coverage grows, so this README intentionally does not pin a count. A successful run ends with zero failed tests, and typecheck completes without emitting files.

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
tests/                   Node test suite
docs/                    Engineering handoffs and supporting project notes
```

## Privacy

Paceball never uploads videos or measurements and does not require an account. Recordings, extracted frames, player profiles and readings live in app storage. Android's own backup may copy app data to the user's backup, and media a user explicitly saves or shares can remain outside the app.

When configured, RevenueCat receives the anonymous purchase information needed to resolve Pro status. Sentry receives a limited, scrubbed JavaScript error only after the user opts in. Neither integration is given videos, player names, marked points or speeds by Paceball.

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
