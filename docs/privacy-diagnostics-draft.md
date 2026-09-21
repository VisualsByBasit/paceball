# Privacy wording for Basit's review — not published

Paceball processes recordings and bowling measurements on your device. We do not
operate a server for uploading or storing your recordings, player profiles or
measurement records.

Recordings, extracted frames and measurements are kept in the app's private
storage. Your device's backup settings may create copies through its backup
provider. Images you choose to save to your gallery or share are handled by your
photo library or the destination app, which may have its own cloud backup.

Optional crash reports are off by default. If you enable them, Paceball sends
limited technical diagnostics to Sentry: app version, event time, error type and
code locations and explicitly reviewed static error messages. Arbitrary error
messages (including our own errors containing paths or IDs) are redacted.
These reports exclude player names, bowling measurements,
recordings, images and marked points. Sending reports exposes your network
address to the receiving service. You can turn off future reports from Privacy
and crash reports. Turning this off does not delete reports already received.

Camera permission records video for measurement. Gallery saving requests the
permission needed to save an exported image where the operating system requires
it. Measurement works offline without enabling crash reports.

Uninstalling removes the app's private local data. It does not remove images
saved to your gallery, copies shared elsewhere, backup copies or previously sent
diagnostic reports.

Before publication, add the actual publisher/contact details, effective date,
Sentry processing region, retention/deletion settings and contact process using
verified account settings. Audit the final APK's permissions. RECORD_AUDIO is
no longer declared, and is blocked in app.json so no library merges it back;
Android backup behavior remains a review item.

Implementation status (updated 16 September 2026): Sentry is integrated on
main, no longer an inactive template.

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
- JavaScript errors only. Native crash handling and the native SDK stay
  disabled and are not complete.
- `SENTRY_DISABLE_AUTO_UPLOAD` is set for every EAS build profile, so no source
  maps are uploaded. Clear it once a Sentry project and build-only auth token
  exist.

Not yet verified: a device build with a real DSN, a test event received and
checked in the Sentry dashboard, and opt-out stopping further events. Those
checks, and the publisher and retention details above, are still required
before this wording is published.

Purchases are not covered by this draft. Buying or restoring goes through
Google Play and RevenueCat, which the published policy will also need to name.
