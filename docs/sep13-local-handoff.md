# Mustafa: work through 13 September

Local branch: `codex/sep13-local`, based on `origin/main` at `573a8e4`.
Changes are uncommitted and unpushed. The local `main` ref, remote `main` and
the original Desktop checkout were not edited. Work lives in the separate
`paceball-local` checkout. No Sentry reports or source maps were uploaded.

## Delivered locally

### 8–9 September: exports and comparisons

The previously merged real-session comparison and image export remain intact.
Existing renderer, gallery, sharing, corruption and rollback tests still pass.
Real-phone checks for these features remain necessary; this run cannot supply
device evidence. Video export is not part of this scope.

### 11 September: player profiles

- `createPlayer(name, details?)`: backwards-compatible name creation; optional
  height (50–250 cm) and EU shoe size (15–60). Invalid values fail before writes.
- `updatePlayer(id, changes)`: change name/optional dimensions without changing
  identity or creation time. `null` clears a dimension; omission preserves it.
- `getPlayer(id)`, `getActivePlayer()`, `setActivePlayer(id)`.
- Existing installs select their original oldest valid player without rewriting
  any delivery. Selection persists. Missing/corrupt selections recover safely.
- Duplicate names are allowed: stable IDs distinguish people. No profile deletion
  was added, so old deliveries cannot be accidentally orphaned by this screen.
- Capture passes the selected player ID through Mark into Result. Height
  calibration reads that player. Saving uses the captured identity, not whichever
  profile happens to be first in the list. Missing explicit IDs fail visibly.
- New Players and deliveries route: create/select, rename, edit height, read that
  player's deliveries, export and confirmed deletion. FlatList virtualizes rows;
  pages contain 25 deliveries and only one expanded export panel is mounted.
- Multi-player create/switch controls are **development-only** until Basit's
  RevenueCat entitlement is available. Data APIs are complete; production Pro
  access is not implemented or claimed. Single-player history/profile editing
  remains available in release builds. Do not replace the guard with `true`.

### 12 September: Sentry

- Expo selected `@sentry/react-native ~7.11.0`. SDK plugin, custom startup entry,
  root error boundary and Metro source-map support are wired locally.
- A DSN is read from `EXPO_PUBLIC_SENTRY_DSN`. No DSN was supplied, so the current
  build sends no reports. No account or project was created on the user's behalf.
- Collection additionally requires an explicit, persisted opt-in in the new
  Privacy and crash reports screen. The app still measures offline with it off.
- Error events are rebuilt using an allow-list: event ID/time, app release,
  environment, standard error class, handled flag and code locations/debug IDs.
  Original error messages, users, names, IDs, sessions, measurements, paths,
  breadcrumbs, contexts, screenshots, view hierarchies, replays and attachments
  are excluded. Error details are intentionally less rich to protect local data.
- Replays, performance tracing, logs, auto-session reporting and client reports
  are disabled. Revoking consent blocks future events; it cannot recall an
  already transmitted request. Network addresses are still involved in sending.
- **JavaScript errors only:** native crash handling/native transport are disabled
  because native events can bypass JavaScript `beforeSend`. Full JVM/C++ crash
  diagnostics require native sanitization and separate device validation. Do not
  describe this as complete native crash coverage.
- Home/onboarding/camera wording in this branch now describes local processing
  and optional diagnostics accurately. The externally published privacy policy
  has not been edited. Use the accompanying draft with Basit before activation.

### 13 September: query performance

- Bounded cache of at most 1,024 validated session records. Every read compares
  the current MMKV string with the cache, preserving detection of outside edits,
  deleted records and corruption. Callers receive independent point objects.
- `listSessions` accepts `offset` plus `limit`; timestamp ties sort by stable ID.
  Negative/fractional/NaN paging values now reject instead of being truncated.
- `listActivePlayerSessions` never returns all players when no profile exists.
- Warm queries avoid repeated JSON parsing/validation. Storage scans and sorting
  still occur: this is not a database index or a constant-time query system.
- In the recorded Node test run (mocked MMKV/filesystem, synthetic metadata):

| Records | Cold full load | Warm history + trend (two queries) | Uncached parse/validate/sort (one query) |
| --- | --- | --- | --- |
| 200 | 2.02 ms | 0.59 ms | 0.80 ms |
| 1,000 | 7.12 ms | 2.46 ms | 3.61 ms |

These are desktop diagnostics, not Android timings. The benchmark runs 20 warm
query pairs, asserts zero warm session JSON parses, and checks counts/recovery.
Timing thresholds are intentionally not CI assertions; hosts differ. The
uncached comparator models the old parsing work, not a full old-app benchmark.

## Validation

Automated tests cover restart selection, corrupt-player fallback, profile
validation, failed player-index writes, cross-player pagination, cache mutation
isolation, changed/corrupt bytes, 200/1,000 records, Sentry opt-in/revocation and
event/attachment filtering, plus the original storage and export tests.

- 39 tests pass; TypeScript passes; Expo Doctor 21/21 checks pass.
- Android Hermes bundle (4.8 MB) and source map (12 MB) generation passed, as did
  Android prebuild with the Sentry plugin. A JavaScript bundle is not a native
  APK build. Source maps remain local under ignored `dist/`.
- No Android SDK/ADB device is configured here. UI interaction, physical restart,
  native gallery prompts, camera operation and Sentry dashboard delivery are not
  verified by the simulated native tests.
- Audit reports 15 moderate dependency findings, zero high/critical; no forced dependency upgrades
  were applied. Expo selected the SDK version, and the existing worklets override
  was preserved.

## Steps to try it

Run in `C:\Users\musta\OneDrive\Documents\ChatGPT\shipaton hackaton\paceball-local`:

```powershell
npm test
npm run typecheck
npx expo-doctor
```

Rebuild the development app on an Android-equipped computer because a native SDK
was added. For local builds without Sentry upload credentials, set
`$env:SENTRY_DISABLE_AUTO_UPLOAD = 'true'` in that terminal, then run
`npx expo run:android`. This avoids a build-time source-map upload; it does not
enable or disable runtime diagnostic collection. It was not executed here.

To activate Sentry later, supply the public project DSN in an ignored `.env.local`:

```dotenv
EXPO_PUBLIC_SENTRY_DSN=https://YOUR_PUBLIC_KEY@YOUR_INGEST_HOST/YOUR_PROJECT_ID
```

Use the actual value from Sentry Project Settings > Client Keys, not this example.
Configure `SENTRY_ORG`, `SENTRY_PROJECT`, and a private `SENTRY_AUTH_TOKEN` in the
build environment for source-map uploads. Never prefix that token with
`EXPO_PUBLIC_` or commit it. Clear `SENTRY_DISABLE_AUTO_UPLOAD` only when the
team intentionally wants an authenticated upload. Verify a development test
report in Sentry after opting in; an SDK flush result alone does not prove
dashboard receipt. Check symbolicated stack locations and privacy fields.

## Device acceptance and remaining coordination

1. Create A and B in a development build, with different heights. Select B,
   restart the app and confirm home, calibration and saved delivery all use B.
2. Record/save as A and B. Switch profiles; no deliveries may leak between lists.
   Load more than 25 records; scroll and expand export controls. Edit a name and
   height; previous measurements must remain unchanged.
3. Re-export portrait/landscape sessions and test gallery denial/share cancellation.
   Force-stop/reopen, export again, then delete a disposable test delivery.
4. With a real DSN, confirm no event before opt-in; enable and send the explicit
   development report; verify its stack and sanitized content in Sentry. Disable
   reporting and verify no further events. Test offline behavior on the phone.
5. Measure History scrolling with 200+ sessions on a representative Android phone.
6. Basit connects Pro entitlement checks to the development multi-player controls
   before production. Source-map upload and native crash coverage are separate
   review items, not silently completed tasks.
7. Tester counts through 13 September need Play Console access/evidence. No count
   was checked, invitation sent or recurring monitor created in this run.

## Integration ownership

The data changes stay in MU's area. Necessary local edits in AB's `app/` files
connect selected-player identity through capture/mark/save, expose the new routes
and initialize diagnostics. New routes are a working handoff for AB to refine.
Physics, frame extraction, camera parameters, Session schema and existing saved
measurements were not changed. No release, Git push or main merge was performed.

## References

- https://docs.expo.dev/guides/using-sentry/
- Installed SDK options: `node_modules/@sentry/react-native/dist/js/options.d.ts`
- Native auto-init is disabled in the SDK's Android manifest; runtime native
  initialization is also explicitly disabled by this integration.
