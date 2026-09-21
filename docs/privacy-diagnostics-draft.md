# Privacy wording for Basit's review — not published

Paceball processes recordings and bowling measurements on your device. We do not
operate a server for uploading or storing your recordings, player profiles or
measurement records.

Recordings, extracted frames and measurements are kept in the app's private
storage. Your device's backup settings may create copies through its backup
provider. Images you choose to save to your gallery or share are handled by your
photo library or the destination app, which may have its own cloud backup.

Optional crash reports are off by default. If you enable them, Paceball sends
limited JavaScript and native crash diagnostics to Sentry. Reports can include
the app version, event time, error or crash type, code locations, native stack
traces, device model, Android version and technical crash state. JavaScript
reports keep only explicitly reviewed static error messages; arbitrary messages
(including our own errors containing paths or IDs) are redacted. Paceball does
not add player names, bowling measurements, recordings, images or marked points,
and reports have no breadcrumbs, screenshots or view hierarchy. Sending reports
exposes your network address to the receiving service. You can turn off future
reports from Privacy and crash reports; this closes both the JavaScript and
native SDKs. Turning this off does not delete reports already received.

Camera permission records video for measurement. Gallery saving requests the
permission needed to save an exported image where the operating system requires
it. Measurement works offline without enabling crash reports.

Uninstalling removes the app's private local data. It does not remove images
saved to your gallery, copies shared elsewhere, backup copies or previously sent
diagnostic reports.

Before publication, add the actual publisher/contact details, effective date,
Sentry processing region, retention/deletion settings and contact process using
verified account settings. Audit the final APK's permissions and make the
microphone disclosure match the final audio-recording decision. Android backup
behavior remains a review item.

Implementation status (updated 21 September 2026): Sentry is integrated, but
the account configuration and release-build receipt checks are still pending.

- `@sentry/react-native ~7.11.0` is a dependency, with its config plugin in
  app.json. `index.js` is the entry point and initialises diagnostics before
  Expo Router loads; `metro.config.js` wraps Expo's config with
  `getSentryExpoConfig`; the root layout is wrapped with Sentry's `wrap`.
- `src/diagnostics/index.ts` and the Privacy and crash reports screen
  (`app/diagnostics.tsx`, linked from Settings) are Mustafa's reviewed
  templates, moved into place unchanged. Events still pass through
  `scrubDiagnosticEvent` before sending.
- Off by default. The SDK initialises only when `EXPO_PUBLIC_SENTRY_DSN` is set
  in the build AND the user has switched reports on; the consent is persisted
  and starts unset.
- No DSN is configured yet, so the current build sends nothing: the switch is
  disabled and the screen says crash reporting is not available in this build.
- Native crash and Android NDK handling are enabled only after opt-in. Turning
  consent off disables the JavaScript client and closes the native SDK.
- EAS release builds upload source maps once `SENTRY_ORG`, `SENTRY_PROJECT` and
  a build-only `SENTRY_AUTH_TOKEN` are configured. None belongs in source control.
- A native crash button exists only when the preview build receives
  `EXPO_PUBLIC_SENTRY_NATIVE_TEST_ENABLED=true`; production must omit it.

Not yet verified: a release device build with a real DSN, a JavaScript event and
a native crash received and checked in the Sentry dashboard, source-map
symbolication, and opt-out stopping further events. Those checks, and the
publisher and retention details above, are still required before publication.

Purchases are not covered by this draft. Buying or restoring goes through
Google Play and RevenueCat, which the published policy will also need to name.
