import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { CONTACT_EMAIL, POLICY_UPDATED, SOCIAL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms for using Paceball and its Pro subscription.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  return (
    <LegalPage title="Terms of use" updated={POLICY_UPDATED}>
      <section>
        <p>
          These terms cover your use of the Paceball app and its Pro subscription. By using the
          app, you agree to them. If you do not agree, please do not use the app.
        </p>
      </section>

      <section>
        <h2>What a reading is</h2>
        <p>
          A Paceball reading is an estimate. It is the average speed from release to bounce,
          worked out from video and from points you mark, and it is shown with an error range
          for that reading. It is not a certified measurement.
        </p>
        <p>
          Do not use Paceball readings for officiating, for selection decisions, or for anything
          where safety depends on the number.
        </p>
      </section>

      <section>
        <h2>Subscriptions</h2>
        <ul>
          <li>Pro is available as a monthly or an annual subscription.</li>
          <li>
            The annual plan includes a 7-day free trial for new subscribers. If you do not cancel
            before the trial ends, the subscription starts and you are charged.
          </li>
          <li>Subscriptions are billed through Google Play, to your Google Play account.</li>
          <li>
            Subscriptions renew automatically at the end of each period until you cancel.
          </li>
          <li>
            You can cancel at any time in Google Play, under Payments and subscriptions. After you
            cancel, Pro stays active until the end of the period you have paid for.
          </li>
          <li>Refunds follow Google Play&apos;s refund policy.</li>
          <li>Prices vary by country and are shown in the app before you subscribe.</li>
        </ul>
      </section>

      <section>
        <h2>What Pro covers</h2>
        <p>
          Pro covers the features that run on your phone, as described in the app when you
          subscribe. If Paceball later offers features that run over the network, such as online
          storage, they may be priced separately.
        </p>
      </section>

      <section>
        <h2>Your recordings, and our code</h2>
        <p>
          The videos you record and the measurements you make are yours. Paceball does not claim
          any rights over them.
        </p>
        <p>
          The app&apos;s source code is published under the MIT licence on{" "}
          <a href={SOCIAL.github}>GitHub</a>. The MIT licence covers the code only. The Paceball
          name and logo are not licensed under it, and may not be used to name or promote another
          app or service without permission.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>Only record people who know they are being filmed, and respect the rules of the ground you are at.</li>
          <li>Do not use the app to break the law or to harm anyone.</li>
          <li>
            Do not present Paceball readings as certified or official, or share a card that has
            been altered to show something the app did not measure.
          </li>
          <li>Do not try to get Pro features without a subscription.</li>
        </ul>
      </section>

      <section>
        <h2>No warranty</h2>
        <p>
          Paceball is provided as it is and as available, without warranties of any kind, express
          or implied, including fitness for a particular purpose and accuracy of readings, to the
          fullest extent the law allows.
        </p>
      </section>

      <section>
        <h2>Limitation of liability</h2>
        <p>
          To the fullest extent the law allows, Paceball and its makers are not liable for any
          indirect or consequential loss, or for any loss arising from reliance on a reading. Our
          total liability to you for any claim is limited to what you paid for Pro in the twelve
          months before the claim. Nothing in these terms limits a liability that cannot be
          limited by law, or your rights as a consumer where you live.
        </p>
      </section>

      <section>
        <h2>Changes to these terms</h2>
        <p>
          We may update these terms as the app changes. The date at the top shows when they last
          changed. If you keep using the app after a change, the updated terms apply.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Questions about these terms: {mail}.</p>
      </section>
    </LegalPage>
  );
}
