/**
 * Decorative circuit traces for the hero. One trace carries the accent: it is
 * the path from release to bounce, drawn once, ending on the ball.
 */
export function CircuitTrace({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 240"
      fill="none"
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      <g stroke="var(--color-line)" strokeWidth="2">
        <path d="M0 40 H120 L150 70 H260" />
        <path d="M40 200 H180 L210 170 H400" />
        <path d="M300 0 V60 L330 90 V240" />
      </g>
      <g fill="var(--color-line)">
        <circle cx="260" cy="70" r="4" />
        <circle cx="40" cy="200" r="4" />
        <circle cx="300" cy="0" r="4" />
      </g>
      <path
        d="M20 120 H140 L180 80 H240 L280 150"
        stroke="var(--color-accent)"
        strokeWidth="2"
        pathLength={1}
        strokeDasharray="1"
        className="animate-trace"
      />
      <circle cx="20" cy="120" r="4" fill="var(--color-accent)" />
      <circle cx="280" cy="150" r="8" fill="var(--color-accent)" />
    </svg>
  );
}
