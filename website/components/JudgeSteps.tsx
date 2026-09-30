import type { ReactNode } from "react";
import { betaFlow } from "@/lib/beta";
import { CONTACT_EMAIL, PLAY_LISTING_URL } from "@/lib/site";

/**
 * The same ten steps as docs/JUDGES.md. The group and the Play opt-in come from
 * betaFlow(), so the opt-in link only ever follows the group step, and without
 * a group both become the email request.
 */
export function JudgeSteps() {
  const flow = betaFlow();
  const join: ReactNode[] =
    flow.kind === "steps"
      ? [
          <>
            <strong>Join the tester Google Group.</strong> Open <Out href={flow.steps[0].href}>the Paceball testers group</Out>{" "}
            and join it with your Google account.
          </>,
          <>
            <strong>Opt in to testing.</strong> Open the <Out href={flow.steps[1].href}>Google Play testing page</Out>,
            signed in with the same Google account you used for the group, and tap &quot;Become a tester&quot;.
          </>,
        ]
      : [
          <>
            <strong>Ask to join:</strong> <a href={flow.request.href}>{flow.request.label}</a>, from the Google account you
            use for Google Play. We add that account to closed testing.
          </>,
        ];

  const steps: ReactNode[] = [
    <>
      <strong>You need an Android phone and a Google account.</strong> Paceball needs Android 9 or newer: it steps
      through the video frame by frame, and Android only allows that from Android 9.
    </>,
    ...join,
    <>
      <strong>Install Paceball</strong> from <Out href={PLAY_LISTING_URL}>Google Play</Out>. The listing can take a few
      minutes to show up after you opt in.
    </>,
    <>
      <strong>Try it free.</strong> Every phone gets 3 analyses per 7 days, with no payment and no account.
    </>,
    <>
      <strong>Try Pro.</strong> Open the paywall (Settings &gt; Pro, or any locked feature) and pick the annual plan
      with the 7-day free trial. Google asks for a payment method, but nothing is charged if you cancel within 7 days:
      Play Store &gt; profile icon &gt; Payments &amp; subscriptions &gt; Subscriptions &gt; Paceball &gt; Cancel.
      &quot;Restore purchases&quot; is at the bottom of the paywall, and in Settings &gt; Pro.
    </>,
    <>
      <strong>A 2-minute test without a pitch.</strong> Put two markers (shoes or tape) a known distance apart on the
      floor, for example 3&nbsp;m. Record someone rolling or throwing a ball past them, choose &quot;Two markers&quot; as the
      ruler and enter the distance, then tap the markers, the release and the bounce. You get the speed with its ±
      range.
    </>,
    <>
      <strong>What to look at:</strong> the speed and its ± range, &quot;Marked, not tracked&quot;, the share card (Free
      vs Pro), the video clip export, Stats and History.
    </>,
    <>
      <strong>Known limitation.</strong> Right after a video clip is exported, the in-app player can report a shorter
      length (about 1 s). Open it again from History a few minutes later and it shows the full length. The saved file
      is complete.
    </>,
    <>
      <strong>Problems or questions:</strong> <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
    </>,
  ];

  return (
    <ol className="grid gap-px overflow-hidden rounded-xl border border-line bg-line">
      {steps.map((step, index) => (
        <li key={index} className="flex gap-4 bg-bg p-6 sm:gap-6">
          <span className="w-8 shrink-0 font-mono text-caption text-muted tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </span>
          <p className="text-body text-muted [&_a]:text-text [&_a]:underline [&_a]:decoration-muted [&_a]:underline-offset-4 [&_a:hover]:decoration-accent [&_strong]:text-text">
            {step}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Out({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
