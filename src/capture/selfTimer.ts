/**
 * The self-timer on Capture: a countdown before recording starts, for a bowler
 * filming themselves. It only delays the press. Recording itself, the 3-second
 * minimum, the lens, exposure, bitrate and timing are exactly as without it.
 */

/** Off, then 3, 5 and 10 seconds, in the order the chip steps through them. */
export const SELF_TIMER_OPTIONS = [0, 3, 5, 10] as const;
export type SelfTimer = (typeof SELF_TIMER_OPTIONS)[number];

export function isSelfTimer(value: unknown): value is SelfTimer {
  return (SELF_TIMER_OPTIONS as readonly unknown[]).includes(value);
}

/** The next option along, wrapping from 10 s back to off. */
export function nextSelfTimer(current: SelfTimer): SelfTimer {
  const i = SELF_TIMER_OPTIONS.indexOf(current);
  return SELF_TIMER_OPTIONS[(i + 1) % SELF_TIMER_OPTIONS.length];
}

/** The value the Delay chip writes under its label. */
export function selfTimerLabel(seconds: SelfTimer): string {
  return seconds === 0 ? 'Off' : `${seconds} s`;
}

/** As a screen reader says it. */
export function selfTimerSpoken(seconds: SelfTimer): string {
  return seconds === 0 ? 'Start delay off' : `Start delay ${seconds} seconds`;
}

/** The clock a countdown runs on: the real one on the phone, a fake in tests. */
export type CountdownClock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export const realClock: CountdownClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Counts down whole seconds: `onTick(n)` with n seconds left, from `seconds`
 * down to 1, one each second, then `onDone()` once. Each beat is scheduled
 * from the start time rather than from the beat before, so a late beat does
 * not push the rest later. `cancel()` stops it; nothing fires after.
 */
export function startCountdown(
  seconds: number,
  { onTick, onDone }: { onTick: (left: number) => void; onDone: () => void },
  clock: CountdownClock = realClock
): { cancel: () => void } {
  const start = clock.now();
  let cancelled = false;
  let handle: unknown = null;

  const beat = (k: number) => {
    if (cancelled) return;
    if (k >= seconds) {
      cancelled = true;
      onDone();
      return;
    }
    onTick(seconds - k);
    handle = clock.setTimeout(() => beat(k + 1), Math.max(0, start + (k + 1) * 1000 - clock.now()));
  };
  beat(0);

  return {
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      if (handle !== null) clock.clearTimeout(handle);
    },
  };
}
