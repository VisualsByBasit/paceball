type Props = { size?: "sm" | "lg" };

/** The ball as a lime dot on a trace, then the name. */
export function Wordmark({ size = "sm" }: Props) {
  const large = size === "lg";
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={large ? "h-9 w-9" : "h-6 w-6"}
      >
        <path d="M2 18 H9 L14 8 H22" fill="none" stroke="var(--color-line)" strokeWidth="2" />
        <circle cx="14" cy="8" r="4" fill="var(--color-accent)" />
      </svg>
      <span
        className={`font-mono font-semibold uppercase tracking-[0.2em] ${large ? "text-2xl sm:text-3xl" : "text-sm"}`}
      >
        Paceball
      </span>
    </span>
  );
}
