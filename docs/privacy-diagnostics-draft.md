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
verified account settings. Audit the final APK's permissions. The existing
RECORD_AUDIO declaration and Android backup behavior remain review items.

Implementation status: the review branch keeps Sentry initialization and its
screen as inactive integration templates. This wording describes the proposed
opt-in feature AFTER Basit integrates and verifies it, not current runtime
behaviour. Native crash reporting remains disabled and is not complete.
