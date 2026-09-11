# September 13 correction — local review only

Base: `6048ba7` (Basit's History, Analysis and animation-practice update).
Branch: `codex/sep13-review-local`. No upstream configured; nothing pushed.
The earlier `codex/sep13-local` branch is preserved as the original review reference.
Do NOT merge that earlier branch wholesale: it contains AB screen/build changes.

## Ownership and runtime status

All existing AB files and build files are unchanged from the base, including
Home, Capture, Mark, Result, History, Analysis, setup, app layout, package.json,
package-lock.json, app.json, UI, physics, types and the Kotlin module.
No new entry point or Metro configuration is activated. Expo and Router versions,
Reanimated, Haptics and the worklets override are exactly Basit's versions.

Run `node scripts/check-review-boundary.cjs` to verify the review boundary against
the pinned base, including untracked files. This is a review-specific check;
Basit's approved integration will intentionally change the boundary afterwards.

The data API and export guard are executable. The profile component is not routed
into the app. Sentry's adapter and screen are inactive `.txt` review templates,
not imports in the application. The application on this branch does NOT send
Sentry reports. This separation is deliberate, not a claim that integration is done.

## Changes carried forward and corrected

- Active-player storage, getPlayer/updatePlayer, optional profile dimensions,
  paginated session reads, cache isolation/recovery and their regression tests.
- `src/data/PlayersScreen.tsx` contains profile management only. No delivery list,
  trend chart or per-session export UI competes with Basit's History/Analysis.
  Multi-player create/select controls remain development-only until AB adds the
  actual RevenueCat entitlement. This is not a production Pro implementation.
- `src/diagnostics/privacy.ts` is SDK-independent. It keeps only exact reviewed
  static Error messages. Own-code paths, IDs, suffixes, arbitrary third-party
  messages and unsafe nested exceptions are redacted individually. Stack frames
  or `in_app` flags are never evidence that an error is safe.
- The Sentry adapter remains opt-in, with native reporting OFF and attachments,
  breadcrumbs and transaction payloads blocked. Unit tests exercise the proposed
  adapter with mocks; they do not prove actual network delivery or native safety.
- Export checks that the resolved font has every required glyph and usable text
  metrics before saving the PNG. An unusable font fails explicitly and releases
  resources rather than reporting success with blank text. Paint disposal now
  also runs if drawing fails.

## Basit's integration checklist (not applied)

1. Decide and approve Sentry package version, native plugin/build configuration,
   Metro/source-map setup and startup location. Do not bump Expo or Router as a
   side effect. Schedule a fresh development build and release AAB. Public DSN
   belongs in local/build environment configuration; auth tokens are build-only
   secrets and must never be Expo public variables or committed files.
2. After installing the approved SDK, use `integration/diagnostics-index.ts.txt`
   as the proposed `src/diagnostics/index.ts`, then type-check against that SDK.
   Use `integration/diagnostics-screen.tsx.txt` as the proposed app route. Neither
   template is automatically copied, loaded or enabled on this review branch.
   Initialize before the router only using a startup approach AB approves.
   Wrap the root using the SDK only as part of that approved integration.
3. Add a Players route pointing to `src/data/PlayersScreen.tsx` only after the
   active-player flow is consistent. Home, Capture, Mark, Result and History must
   agree on the selected player. Capture should pin the identity for the delivery;
   later profile switching must not reassign it. Height calibration uses that
   captured player's height. History must stop using `listPlayers()[0]` when
   selected-player support is enabled.
4. Keep one delivery list in History. The list can use `listSessions({ playerId,
   offset, limit })`; getTrend must still use ALL applicable player records, not
   just the current page. Existing History `matchTrend` compares against the full
   list, so pagination requires AB to update that validation rather than compare
   all-time trend count to page length. Analysis owns replay; AB chooses where
   SessionActions/export/delete are exposed for existing deliveries.
5. Preserve Result's deliberate `createPlayer('You')` recovery. It is unchanged
   here. AB should decide how to reconcile recovery with an explicitly captured
   player that has become unavailable; do not silently reassign such a delivery
   or replace the fallback with a save-blocking throw.
6. Apply the agreed specific copy across the three existing AB screens:
   - Home fact strip: `YOUR VIDEOS STAY ON YOUR PHONE` (AB chooses fitting layout).
   - Camera explanation: `Record a delivery to measure it. Your videos stay on
     your phone; Paceball does not upload them.`
   - How it works: `Your videos stay on your phone. Measurements are processed
     locally. Optional crash reports send limited technical errors, not videos.`
   Keep the separate gallery-sharing/backup and opt-in diagnostics disclosure.
   This review branch leaves the original screen strings untouched, because no
   telemetry has been activated and those existing files belong to AB.
7. Review the privacy draft, real account region/retention settings and final APK
   permissions before enabling reporting. Confirm a deliberate test appears in
   the Sentry dashboard and verify opt-out prevents subsequent reports. Reports
   already transmitted cannot be recalled by toggling off.

## Verification and remaining acceptance

Verified locally on 11 September 2026:

- `npm ci --ignore-scripts --no-audit --no-fund`: passed using Basit's unchanged
  lockfile. Install scripts were intentionally disabled. No dependency bumps.
- `npm test`: 42/42 passed. Includes real CanvasKit PNG rendering with mocked
  filesystem/font lookup, data persistence/recovery mocks and diagnostics mocks.
- `npm run typecheck`: passed with main's declared dependency installation.
- `npx --no-install expo export --platform android --output-dir
  node_modules/.cache/sep13-review-bundle`: passed (2,000 modules; Hermes bytecode
  generated). First attempt was blocked from executing hermesc.exe by the sandbox;
  authorized retry passed without code/config changes. Output is ignored local
  build material, not an APK/AAB or device test. Unrouted profile code and inactive
  Sentry templates are not exercised by this app bundle.
- `node scripts/check-review-boundary.cjs`: passed; protected-file diff is empty.
- `git diff --check`: passed.
- Independent read-only review found a possible name leak through source-file
  basenames. Fixed by preserving only known bundle filenames; added stack/debug
  image regression tests. Follow-up review found no remaining high-priority local
  issues. Intentionally deferred integration is still required.

These checks are not a native build or native-module verification.

Font coverage limitation: the CanvasKit tests use a desktop TTF in place of the
Android font manager. They verify PNG rendering, failure cleanup and glyph checks,
NOT the actual Android font lookup. The new guard is not a confirmed fix for
Basit's unspecified font issue. His earlier export-card feedback is still needed
before claiming those requested fixes are complete.

Device acceptance remains: profile switching and correct player attribution;
no-profile save recovery; record/mark/save/force-stop/reopen; missing media and
corrupt records; History/Analysis integration; 200/1000-record scrolling; export
text and ±/· symbols in portrait/landscape; free watermark and approved Pro gating;
gallery/share; consent/revocation/dashboard verification after integration.

Native VisionCamera, Skia and Kotlin crashes are NOT covered by the JS-only
Sentry adapter. Native crash reporting remains separate, explicitly unfinished
work; do not enable it before a native privacy/consent review.

## Schedule and remaining decisions

- 11–13 September: MU local corrections and review; AB confirms screen/build
  integration and supplies the earlier export-card/font feedback.
- 14–15 September: AB integrates approved wiring; both test a fresh Android build.
- 16 September: freeze review, document residual risks, AB alone merges.

No push or main merge is authorized by this local-review handoff. Approval of
the integration decisions and actual device results are required before calling
the end-to-end feature complete.
