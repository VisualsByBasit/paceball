# Sentry release setup

Paceball's SDK code is present, but it sends nothing unless a build contains a
public DSN and the user opts in. Never commit the Sentry auth token.

## 1. Create the project

1. Sign in at <https://sentry.io/> and create a **React Native** project named
   `paceball` in the team's organization.
2. Record the organization slug, project slug and public DSN. The DSN is under
   **Project settings > Client Keys (DSN)**.
3. Under the organization's developer/auth-token settings, create an
   organization token intended for release creation and source-map upload.
   Copy it once and store it only in the build environment.
4. In Sentry's Security & Privacy settings, enable server-side data scrubbing
   and prevent storage of IP addresses. The connection still exposes an IP to
   Sentry while the request is being delivered, so the app discloses that fact.

## 2. Configure EAS

In the Expo project dashboard, open **Configuration > Environment variables**.
Set these for both the `preview` and `production` environments:

| Name | Visibility | Value |
| --- | --- | --- |
| `EXPO_PUBLIC_SENTRY_DSN` | Plain text | The public project DSN |
| `SENTRY_ORG` | Plain text | Organization slug |
| `SENTRY_PROJECT` | Plain text | Project slug |
| `SENTRY_AUTH_TOKEN` | Sensitive | Source-map/release auth token |

Set `EXPO_PUBLIC_SENTRY_NATIVE_TEST_ENABLED=true` for **preview only**. Do not
create that variable in production. `EXPO_PUBLIC_` values are embedded in the
app and must never contain secrets; the DSN is intentionally public. The auth
token is private and must never use the `EXPO_PUBLIC_` prefix.

## 3. Verify before production

1. Build the `preview` profile, which is a release APK rather than Expo Go.
2. Install it on a physical Android phone.
3. Open **Settings > Privacy and crash reports**. Confirm reporting starts off.
4. Opt in and send the JavaScript test. Confirm the event arrives in Sentry and
   its stack is symbolicated.
5. Use **Test native crash**, reopen Paceball, and confirm the fatal native event
   arrives. Inspect it for unexpected player, recording or measurement data.
6. Turn reporting off. Confirm the UI records the opt-out, restart the app, and
   verify later errors do not create new events.
7. Remove the preview-only native-test variable from any production environment,
   then make the production build and repeat the non-destructive consent checks.

Expo's Sentry guide: <https://docs.expo.dev/guides/using-sentry/>
