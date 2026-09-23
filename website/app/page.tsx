import Link from "next/link";
import type { ReactNode } from "react";
import { CircuitTrace } from "@/components/CircuitTrace";
import { Wordmark } from "@/components/Wordmark";
import { BETA_URL, SOCIAL } from "@/lib/site";

const STEPS = [
  {
    title: "Record side-on",
    body: "Stand square of the pitch, hold the phone still and film the delivery live. Clips run at least three seconds so the frame rate can be read reliably.",
  },
  {
    title: "Mark the stumps or another known length",
    body: "Tap both ends of something whose length is known. Stumps are 20.12 m apart. Markers you measured, the ball, or the bowler's height work too. This sets the scale.",
  },
  {
    title: "Mark release and bounce",
    body: "Step through the frames and tap where the ball leaves the hand and where it pitches. The frame numbers give the time between them.",
  },
  {
    title: "Get the speed with its error range",
    body: "Distance over time gives the average speed to bounce, shown with a range worked out for that reading from the frame timing, the reference length and your marking.",
  },
];

const REFUSALS = [
  {
    title: "No speed when the bounce was not seen",
    body: "If the ball was not visible where you marked the bounce, you can still save the delivery, but it carries no number. A guess is not a reading.",
  },
  {
    title: "No spin rate",
    body: "Video at 60 fps cannot resolve how fast a ball spins, so there is no RPM and no spin type. Not even an estimate.",
  },
  {
    title: "No tracked flight path",
    body: "The line drawn on the frame joins the points you marked. It is not a tracked path through the air, and it is never presented as one.",
  },
  {
    title: "No release-speed claim",
    body: "The number is the average speed from release to bounce. The ball slows through the air, so it left the hand a little faster than that.",
  },
];

const FREE = [
  "Every measurement, with its error range",
  "3 analyses a week",
  "Share card with the Paceball watermark",
];

const PRO = [
  "Unlimited analyses",
  "Export without the watermark",
  "Compare any two deliveries",
  "Higher recording quality on supported phones",
];

const CHANNELS: { name: string; detail: string; href: string }[] = [
  { name: "X", detail: "@paceballpro", href: SOCIAL.x },
  { name: "Instagram", detail: "@paceballpro", href: SOCIAL.instagram },
  { name: "HackerNoon", detail: "Build write-ups", href: SOCIAL.hackernoon },
  { name: "GitHub", detail: "The source, MIT licensed", href: SOCIAL.github },
];

export default function Home() {
  return (
    <>
      <Hero />
      <Section id="how-it-works" eyebrow="How it works" title="Four marks, one reading">
        <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li key={step.title} className="bg-bg p-6">
              <span className="font-mono text-sm text-muted">0{index + 1}</span>
              <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="refuses" eyebrow="What it refuses to do" title="It only shows what it can measure">
        <ul className="grid gap-6 sm:grid-cols-2">
          {REFUSALS.map((item) => (
            <li key={item.title} className="border-l-2 border-line pl-5">
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="pricing" eyebrow="Free and Pro" title="Measure for free. Go further with Pro.">
        <div className="grid gap-4 md:grid-cols-2">
          <Plan name="Free" items={FREE} />
          <Plan name="Pro" items={PRO} highlighted>
            <p className="mt-6 border-t border-line pt-5 text-muted">
              <span className="text-text">$3.99 a month</span> or{" "}
              <span className="text-text">$24.99 a year</span>, with a 7-day free trial for new
              subscribers on the annual plan. Prices vary by country and are shown in the app.
            </p>
          </Plan>
        </div>
      </Section>

      <Section id="build" eyebrow="Built in public" title="Follow the build">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CHANNELS.map((channel) => (
            <li key={channel.name}>
              <Channel {...channel} />
            </li>
          ))}
        </ul>
        <p className="mt-10 max-w-2xl text-muted">
          Paceball never uploads your videos or measurements. Purchases go through Google Play and
          RevenueCat, and crash reports go to Sentry only if you turn them on.{" "}
          <Link href="/privacy" className="text-text underline decoration-muted underline-offset-4 hover:decoration-accent">
            Read the privacy policy
          </Link>
          .
        </p>
      </Section>
    </>
  );
}

function Hero() {
  return (
    <section className="dot-matrix relative overflow-hidden border-b border-line">
      <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 md:grid-cols-[3fr_2fr]">
        <div>
          <div className="animate-rise">
            <Wordmark size="lg" />
          </div>
          <h1
            className="animate-rise mt-8 text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl"
            style={{ animationDelay: "80ms" }}
          >
            A cricket speed gun that tells you when it doesn&apos;t know
          </h1>
          <p
            className="animate-rise mt-5 max-w-xl text-lg text-muted"
            style={{ animationDelay: "160ms" }}
          >
            Film a delivery on your phone, mark four points, and get the average speed to bounce
            with the error range for that reading.
          </p>
          <div
            className="animate-rise mt-8 flex flex-wrap items-center gap-4"
            style={{ animationDelay: "240ms" }}
          >
            <a
              href={BETA_URL}
              className="inline-flex items-center rounded-full bg-accent px-6 py-3 font-semibold text-bg transition-opacity hover:opacity-90"
            >
              Join the beta
            </a>
            <span className="text-sm text-muted">Android, through Google Play</span>
          </div>
        </div>
        <CircuitTrace className="hidden w-full md:block" />
      </div>
    </section>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="border-b border-line last:border-b-0">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">{eyebrow}</p>
        <h2 id={`${id}-title`} className="mt-3 mb-10 text-3xl font-semibold tracking-tight">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

function Plan({
  name,
  items,
  highlighted = false,
  children,
}: {
  name: string;
  items: string[];
  highlighted?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`rounded-2xl border p-6 ${highlighted ? "border-muted" : "border-line"}`}>
      <h3 className="font-mono text-sm uppercase tracking-[0.2em]">{name}</h3>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}

function Channel({ name, detail, href }: { name: string; detail: string; href: string }) {
  const body = (
    <>
      <span className="font-semibold">{name}</span>
      <span className="mt-1 block text-sm text-muted">{href ? detail : "Coming soon"}</span>
    </>
  );
  if (!href) {
    return <div className="h-full rounded-2xl border border-line p-5">{body}</div>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block h-full rounded-2xl border border-line p-5 transition-colors hover:border-muted"
    >
      {body}
    </a>
  );
}
