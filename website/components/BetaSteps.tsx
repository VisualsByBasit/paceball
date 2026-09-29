import { BETA_NOTES, BETA_REQUEST_NOTES, betaFlow } from "@/lib/beta";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "./buttons";

const primary = PRIMARY_BUTTON;
const secondary = SECONDARY_BUTTON;

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
          <li key={step.href} className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-6">
            <span className="w-16 shrink-0 font-mono text-caption text-muted">Step {index + 1}</span>
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
    <ul className="mt-6 space-y-2 text-body text-muted">
      {notes.map((note) => (
        <li key={note} className="flex gap-4">
          <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-muted" />
          <span>{note}</span>
        </li>
      ))}
    </ul>
  );
}
