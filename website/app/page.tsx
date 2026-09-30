import Link from "next/link";
import type { ReactNode } from "react";
import { BetaSteps } from "@/components/BetaSteps";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/buttons";
import { DemoVideo } from "@/components/DemoVideo";
import { JudgeSteps } from "@/components/JudgeSteps";
import { MarkedDiagram } from "@/components/MarkedDiagram";
import { Screenshot } from "@/components/Screenshot";
import { Wordmark } from "@/components/Wordmark";
import { betaFlow } from "@/lib/beta";
import { FAQ, FEATURES, PLAN_ROWS, REFUSALS, STEPS, TEAM } from "@/lib/content";
import { CAPTURE, GALLERY, MARK, PAIRS, RESULT } from "@/lib/screens";
import { SOCIAL } from "@/lib/site";

const STEP_SCREENS = [CAPTURE, MARK, RESULT];

/** A plans table cell: tight on a phone so all three columns fit, roomier from sm up. */
const CELL = "px-2 py-4 align-top sm:p-4";

const FORMULA = [
  { name: "pixels per metre", value: "ruler pixels / ruler metres" },
  { name: "distance (m)", value: "travel pixels / pixels per metre" },
  { name: "flight (s)", value: "frames between marks / fps" },
  { name: "speed (km/h)", value: "distance / flight × 3.6" },
];

/** The worked example, read off the screenshots: 8.92 m in 24 frames at 60.03 fps. */
const EXAMPLE = [
  { label: "Marked frames", value: "253 → 277" },
  { label: "Frame delta", value: "24 frames" },
  { label: "fps, from the file", value: "60.03" },
  { label: "Flight time", value: "0.3998 s" },
  { label: "Distance", value: "8.92 m" },
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
      <Section id="beta" eyebrow="Join the beta" title={betaFlow().kind === "steps" ? "Two steps to the beta" : "Ask to join the beta"}>
        <BetaSteps />
      </Section>

      <Section id="how-it-works" eyebrow="How it works" title="Record. Mark. Read.">
        <ol className="grid gap-12 md:grid-cols-3 md:gap-6">
          {STEPS.map((step, index) => (
            <li key={step.verb} className="reveal flex flex-col">
              <p className="font-mono text-caption text-muted">
                0{index + 1} <span className="text-text">{step.verb}</span>
              </p>
              <h3 className="mt-2 text-h2">{step.title}</h3>
              <p className="mt-2 text-body text-muted">{step.body}</p>
              <Screenshot
                screen={STEP_SCREENS[index]}
                caption=""
               
                className="mx-auto mt-6 w-3/5 max-w-[280px] md:mt-auto md:w-full md:pt-6"
              />
            </li>
          ))}
        </ol>
      </Section>

      <Section id="measurement" eyebrow="The honest measurement" title="A number, and how far to trust it">
        <div className="grid gap-12 md:grid-cols-2 md:gap-6">
          <div className="reveal min-w-0">
            <p className="text-body text-muted">
              The scale comes from a ruler you can see in the clip, never an assumed pitch length. The ball is released
              about 2 m past the crease and pitches well short of the far stumps, so assuming the full 20.12 m would
              nearly double every reading.
            </p>
            <MarkedDiagram className="mt-6 w-full" />
            <dl className="mt-6 space-y-2 rounded-xl border border-line bg-surface p-6 font-mono text-caption leading-6">
              {FORMULA.map((line) => (
                <div key={line.name}>
                  <dt className="inline text-muted">{line.name} = </dt>
                  <dd className="inline text-text">{line.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="reveal min-w-0">
            <Readout />
            <dl className="mt-6 divide-y divide-line border-y border-line">
              {EXAMPLE.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-body text-muted">{row.label}</dt>
                  <dd className="font-mono text-body tabular-nums">{row.value}</dd>
                </div>
              ))}
            </dl>
            <h3 className="mt-12 text-h2">Where the range comes from</h3>
            <p className="mt-2 text-body text-muted">
              Four independent errors, combined for each reading: which frame each mark landed on, how well the
              ruler&apos;s length is known, and how precisely each pair of points could be tapped. Here the markers
              were paced out from shoe size and the flight took 24 frames, so the range is ± 8 km/h. Both sets of
              stumps, well framed, give a far tighter one. The same 3 px of tapping error is 0.6% across stumps 1000 px
              apart, and 50% across a ball 12 px wide. The range says so.
            </p>
          </div>
        </div>

        <ul className="mt-12 grid gap-6 sm:grid-cols-2">
          {REFUSALS.map((item) => (
            <li key={item.title} className="reveal border-l-2 border-control pl-6">
              <h3 className="text-h2">{item.title}</h3>
              <p className="mt-2 text-body text-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="features" eyebrow="Features" title="Built like an instrument">
        <ul className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="bg-bg p-6">
              <h3 className="text-button">{feature.title}</h3>
              <p className="mt-2 text-body text-muted">{feature.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="screens" eyebrow="Screens" title="The whole app, one delivery">
        <div
          role="region"
          aria-label="Screenshots, scroll sideways for more"
          tabIndex={0}
          className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:overflow-visible lg:px-0 lg:pb-0"
        >
          <ul className="flex snap-x snap-mandatory gap-4 lg:grid lg:grid-cols-4 lg:gap-6">
            {GALLERY.map((screen) => (
              <li key={screen.src} className="w-3/5 max-w-[240px] shrink-0 snap-start sm:w-2/5 lg:w-auto lg:max-w-none">
                <Screenshot screen={screen} />
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section id="pricing" eyebrow="Free and Pro" title="Measure for free. Go further with Pro.">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full border-collapse text-left text-caption sm:text-body">
            <caption className="sr-only">What the free plan and Pro include</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={`${CELL} text-label uppercase text-muted`}>
                  Feature
                </th>
                <th scope="col" className={`${CELL} text-label uppercase`}>
                  Free
                </th>
                <th scope="col" className={`${CELL} text-label uppercase`}>
                  Pro
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {PLAN_ROWS.map((row) => (
                <tr key={row.feature}>
                  <th scope="row" className={`${CELL} font-normal text-muted`}>
                    {row.feature}
                  </th>
                  <td className={CELL}>{row.free}</td>
                  <td className={CELL}>{row.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 max-w-2xl text-body text-muted">
          Pro is monthly or annual, and the annual plan starts with a 7-day free trial for new subscribers. Prices are
          shown in Google Play, in your own currency. Cancel any time in Google Play.
        </p>

        {PAIRS.map((pair) => (
          <div key={pair.pro.src} className="mx-auto mt-12 grid max-w-lg grid-cols-2 gap-4 sm:gap-6">
            <Screenshot screen={pair.free} caption={pair.freeCaption} />
            <Screenshot screen={pair.pro} caption={pair.proCaption} />
          </div>
        ))}
      </Section>

      <Section id="judges" eyebrow="For judges" title="How to try Paceball">
        <p className="mb-6 max-w-2xl text-body text-muted">
          Paceball is in closed testing on Google Play, so it takes a couple of extra taps to install. About five
          minutes, start to finish.
        </p>
        <JudgeSteps />
      </Section>

      <Section id="faq" eyebrow="FAQ" title="Questions">
        <div className="divide-y divide-line border-y border-line">
          {FAQ.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex min-h-target cursor-pointer list-none items-center justify-between gap-4 py-4 text-h2 [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden="true"
                  className="shrink-0 font-mono text-h2 font-normal text-muted transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-6 text-body text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section id="team" eyebrow="Team" title="Who builds it">
        <ul className="grid gap-4 sm:grid-cols-2">
          {TEAM.map((person) => (
            <li key={person.name} className="flex items-center gap-4 rounded-xl border border-line p-6">
              <span
                aria-hidden="true"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-control text-button"
              >
                {person.initial}
              </span>
              <span>
                <span className="block text-button">{person.name}</span>
                <span className="block text-caption text-muted">{person.role}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-body text-muted">Built for RevenueCat Shipaton 2026.</p>

        <h3 className="mt-12 text-h2">Follow the build</h3>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CHANNELS.map((channel) => (
            <li key={channel.name}>
              <Channel {...channel} />
            </li>
          ))}
        </ul>
        <p className="mt-12 max-w-2xl text-body text-muted">
          Paceball never uploads your videos or measurements. Purchases go through Google Play and RevenueCat, and
          crash reports go to Sentry only if you turn them on.{" "}
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
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-24">
        <div className="grid items-center gap-12 md:grid-cols-[3fr_2fr]">
          <div>
            <div className="animate-rise">
              <Wordmark size="lg" />
            </div>
            <h1
              className="animate-rise mt-8 text-h1 text-balance sm:text-reading"
              style={{ animationDelay: "80ms" }}
            >
              A cricket speed gun that tells you when it doesn&apos;t know
            </h1>
            <p
              className="animate-rise mt-4 max-w-xl text-h2 font-normal text-muted"
              style={{ animationDelay: "160ms" }}
            >
              Film a delivery on your Android phone, mark release and bounce, and get the average speed with an honest ±
              range, worked out for that one reading.
            </p>
            <div
              className="animate-rise mt-8 flex flex-wrap items-center gap-4"
              style={{ animationDelay: "240ms" }}
            >
              <a href="#beta" className={PRIMARY_BUTTON}>
                Join the beta
              </a>
              <a href="#judges" className={SECONDARY_BUTTON}>
                For judges
              </a>
            </div>
            <p className="animate-rise mt-4 text-caption text-muted" style={{ animationDelay: "240ms" }}>
              Android 9 or newer · Closed beta on Google Play
            </p>
          </div>
          <Screenshot
            screen={RESULT}
            caption=""
           
            eager
            className="animate-rise mx-auto w-3/5 max-w-[280px] md:w-full"
          />
        </div>
        <div className="animate-rise mx-auto mt-12 max-w-3xl sm:mt-24" style={{ animationDelay: "320ms" }}>
          <DemoVideo />
        </div>
      </div>
    </section>
  );
}

/** The example's reading, as the app shows it: the number, its range, and what it is. */
function Readout() {
  const low = 72.3;
  const high = 88.3;
  const min = 60;
  const max = 100;
  const at = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <figure className="rounded-xl border border-line bg-surface p-6">
      <p className="text-label uppercase text-muted">Average speed</p>
      <p className="mt-2 font-mono text-reading text-accent tabular-nums">
        80.3 <span className="text-h2 font-normal text-muted">km/h</span>
      </p>
      <p className="font-mono text-h2 font-normal tabular-nums">± 8 km/h</p>
      <p className="text-caption text-muted">Release to bounce</p>
      <div aria-hidden="true" className="relative mt-6 h-6">
        <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent/40" style={{ left: at(low), width: `calc(${at(high)} - ${at(low)})` }} />
        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" style={{ left: at(80.3) }} />
      </div>
      <div aria-hidden="true" className="flex justify-between font-mono text-caption text-muted tabular-nums">
        <span>{min}</span>
        <span>{max} km/h</span>
      </div>
      <figcaption className="sr-only">
        Average speed, release to bounce: 80.3 kilometres per hour, plus or minus 8. The range runs from 72.3 to 88.3.
      </figcaption>
    </figure>
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
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4 border-b border-line last:border-b-0">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-24">
        <p className="text-label uppercase text-muted">{eyebrow}</p>
        <h2 id={`${id}-title`} className="mt-2 mb-12 text-h1">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

function Channel({ name, detail, href }: { name: string; detail: string; href: string }) {
  const body = (
    <>
      <span className="text-button">{name}</span>
      <span className="mt-1 block text-caption text-muted">{href ? detail : "Coming soon"}</span>
    </>
  );
  if (!href) {
    return <div className="h-full rounded-xl border border-line p-6">{body}</div>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block h-full min-h-target rounded-xl border border-line p-6 transition-colors hover:border-control"
    >
      {body}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
