import { BETA_NOTES, BETA_REQUEST_NOTES, betaFlow } from "@/lib/beta";

const primary =
  "inline-flex items-center rounded-full bg-accent px-6 py-3 font-semibold text-bg transition-opacity hover:opacity-90";
const secondary =
  "inline-flex items-center rounded-full border border-muted px-6 py-3 font-semibold transition-colors hover:border-text";

/**
 * How to get the beta. The Play opt-in link only ever appears as step 2, after
 * the group step, because Google Play refuses anyone not in the group.
 */
export function BetaSteps() {
  const flow = betaFlow();

  if (flow.kind === "request") {
    return (
      <div className="max-w-2xl">
        <a href={flow.request.href} className={primary}>
          {flow.request.label}
        </a>
        <Notes notes={BETA_REQUEST_NOTES} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <ol className="space-y-4">
        {flow.steps.map((step, index) => (
          <li key={step.href} className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
            <span className="w-14 shrink-0 font-mono text-sm text-muted">Step {index + 1}</span>
            <a
              href={step.href}
              target="_blank"
              rel="noopener noreferrer"
              className={index === 0 ? primary : secondary}
            >
              {step.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ol>
      <Notes notes={BETA_NOTES} />
    </div>
  );
}

function Notes({ notes }: { notes: readonly string[] }) {
  return (
    <ul className="mt-6 space-y-2 text-muted">
      {notes.map((note) => (
        <li key={note} className="flex gap-3">
          <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
          <span>{note}</span>
        </li>
      ))}
    </ul>
  );
}
