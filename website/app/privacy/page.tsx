import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { CONTACT_EMAIL, POLICY_UPDATED } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What Paceball keeps on your phone, what leaves it and when, and how to delete it.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  return (
    <LegalPage title="Privacy policy" updated={POLICY_UPDATED}>
      <section>
        <p>
          Paceball measures cricket deliveries on your phone. This policy says, in plain language,
          what the app keeps, what leaves your phone, when, and where it goes. If anything here is
          unclear, email {mail}.
        </p>
      </section>

      <section>
        <h2>What stays on your phone</h2>
        <p>
          Your videos, the sound recorded with them, the frames extracted from them, your
          measurements and your player profiles are stored by the app on your phone. The
          measurement itself runs on the phone.
        </p>
        <p>
          There is no Paceball account and no Paceball server. Paceball never uploads your
          recordings or your measurements.
        </p>
      </section>

      <section>
        <h2>What leaves your phone, and when</h2>
        <p>Three services can receive information from the app. Each is named here with when it happens.</p>
        <ul>
          <li>
            <strong>Google Play</strong>, when the app starts, for the plans and their prices and
            any purchase already on your account, and when you buy or restore a subscription.
            Google handles the payment under its own terms and privacy policy.
          </li>
          <li>
            <strong>RevenueCat</strong>, which manages subscriptions for the app. The app contacts
            RevenueCat when it starts, to check whether this phone has Pro, and when you buy or
            restore a subscription. RevenueCat receives an anonymous app user ID, purchase
            information and purchase tokens, and information about the device and the app, such
            as the model, operating system version and app version. It never receives your
            videos, sound, names or speeds.
          </li>
          <li>
            <strong>Sentry</strong>, only if you turn crash reports on. Crash reports are off by
            default. When they are on, a crash sends technical information about what went wrong,
            such as the error type, where in the code it happened, the device model, the Android
            version and the app version. Sentry also sees your network address when a report is
            sent. Reports from crashes in native code can include device state the app cannot
            filter. The app does not add your videos, sound, names, marks or speeds to crash
            reports. You can turn crash reports off at any time in the app. Reports already sent
            are not deleted by turning them off; email us if you want them removed.
          </li>
        </ul>
      </section>

      <section>
        <h2>Permissions</h2>
        <ul>
          <li>
            <strong>Camera</strong>, to record deliveries. Paceball records live from the camera
            and cannot measure without it.
          </li>
          <li>
            <strong>Microphone</strong>, optional, to keep the sound of the delivery with the
            video. If you say no, recording still works, without sound.
          </li>
          <li>
            <strong>Photos and media</strong>, only when you save a card or a video to your
            gallery.
          </li>
        </ul>
      </section>

      <section>
        <h2>Sharing</h2>
        <p>
          Nothing is shared unless you choose to share it. When you share a card or a video, it
          goes to the app you pick, and that app&apos;s own policy applies from then on. Shared
          videos are silent unless you choose to include the sound.
        </p>
      </section>

      <section>
        <h2>Backups and copies</h2>
        <p>
          Android&apos;s own backup may copy the app&apos;s data to your Google account, under your
          Google backup settings. Anything you save to your gallery or share with another app can
          also exist outside Paceball, and deleting it in Paceball does not remove those copies.
        </p>
      </section>

      <section>
        <h2>Deleting your data</h2>
        <ul>
          <li>Delete a delivery in the app to remove its video, marks and reading.</li>
          <li>Uninstall the app to remove everything it stores on your phone.</li>
          <li>
            For subscription data held by RevenueCat, email {mail} and we will ask RevenueCat to
            delete it.
          </li>
        </ul>
      </section>

      <section>
        <h2>Children</h2>
        <p>Paceball is not directed at children under 13.</p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          If what the app does with your information changes, this policy changes with it, and the
          date at the top is updated. A change that sends something new off your phone will be
          named here.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Questions or requests about privacy: {mail}.</p>
      </section>
    </LegalPage>
  );
}
