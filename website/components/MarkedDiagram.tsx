/**
 * The evidence, drawn the way the app draws it: the ruler's two ends, the
 * release and the bounce, and the straight connector between them, labelled
 * "Marked, not tracked". Lime is the ball and the measured points only.
 */
export function MarkedDiagram({ className = "" }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-labelledby="marked-diagram-title"
      viewBox="0 0 480 240"
      fill="none"
      className={className}
    >
      <title id="marked-diagram-title">
        A frame with four marks: the ruler from A to B along the ground, the release point in the air, and the bounce
        point, joined by a straight line labelled Marked, not tracked.
      </title>

      {/* The ground, and the ruler along it */}
      <path d="M0 196 H480" stroke="var(--color-line)" strokeWidth="2" />
      <path d="M48 180 H432" stroke="var(--color-control)" strokeWidth="2" strokeDasharray="4 6" />
      <Cross x={48} y={180} label="A" />
      <Cross x={432} y={180} label="B" />
      <text x="240" y="224" textAnchor="middle" fill="var(--color-muted)" fontSize="16" fontFamily="var(--font-mono)">
        ruler: a known length
      </text>

      {/* Release to bounce: marked, not tracked */}
      <path
        d="M84 72 L330 168"
        stroke="var(--color-accent)"
        strokeWidth="2"
        pathLength={1}
        strokeDasharray="1"
        className="animate-trace"
      />
      <circle cx="84" cy="72" r="12" stroke="var(--color-accent)" strokeWidth="2" />
      <circle cx="84" cy="72" r="4" fill="var(--color-accent)" />
      <circle cx="330" cy="168" r="12" stroke="var(--color-accent)" strokeWidth="2" />
      <circle cx="330" cy="168" r="6" fill="var(--color-accent)" />
      <text x="84" y="48" textAnchor="middle" fill="var(--color-text)" fontSize="16" fontWeight="700">
        Release
      </text>
      <text x="330" y="144" textAnchor="middle" fill="var(--color-text)" fontSize="16" fontWeight="700">
        Bounce
      </text>

      <rect x="264" y="12" width="200" height="36" rx="8" fill="var(--color-surface)" stroke="var(--color-line)" />
      <text x="364" y="36" textAnchor="middle" fill="var(--color-text)" fontSize="16">
        Marked, not tracked
      </text>
    </svg>
  );
}

function Cross({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g stroke="var(--color-text)" strokeWidth="2">
      <circle cx={x} cy={y} r="12" />
      <path d={`M${x - 12} ${y} H${x + 12} M${x} ${y - 12} V${y + 12}`} />
      <text x={x} y={y - 20} textAnchor="middle" fill="var(--color-text)" stroke="none" fontSize="16" fontWeight="700">
        {label}
      </text>
    </g>
  );
}
