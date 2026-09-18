/** The timer functions the controller schedules with. Injected so tests can drive time. */
export type HoldTimers = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
};

export type HoldRepeatOptions = {
  /** Pause after the first step before repeating starts. */
  delay: number;
  /** Time between repeated steps once it has started. */
  interval: number;
  /** `first` is the step the press itself made; every repeat tick passes false. */
  onStep: (first: boolean) => void;
  timers?: HoldTimers;
};

export type HoldRepeat = {
  /** Finger down: one step now, then repeats after the delay until stopped. */
  pressIn: () => void;
  /**
   * A press that arrived without a touch, as a screen reader's activate does.
   * After a real touch it does nothing, because pressIn already stepped.
   */
  press: () => void;
  /** Release, cancel, blur, unmount: nothing fires after this. */
  stop: () => void;
  readonly holding: boolean;
};

const GLOBAL_TIMERS: HoldTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/**
 * A button that steps once on touch and, held, keeps stepping at a steady rate
 * after a short pause, the way a held key repeats.
 */
export function createHoldRepeat({
  delay,
  interval,
  onStep,
  timers = GLOBAL_TIMERS,
}: HoldRepeatOptions): HoldRepeat {
  let wait: unknown = null;
  let repeat: unknown = null;
  // Set by a touch and consumed by the press that follows it, so the touch is
  // not counted twice. A press with no touch before it steps on its own.
  let touched = false;

  const stop = () => {
    if (wait !== null) timers.clearTimeout(wait);
    if (repeat !== null) timers.clearInterval(repeat);
    wait = null;
    repeat = null;
  };

  return {
    pressIn() {
      stop();
      touched = true;
      onStep(true);
      wait = timers.setTimeout(() => {
        wait = null;
        repeat = timers.setInterval(() => onStep(false), interval);
      }, delay);
    },
    press() {
      if (touched) touched = false;
      else onStep(true);
    },
    stop() {
      stop();
    },
    get holding() {
      return wait !== null || repeat !== null;
    },
  };
}
