/**
 * The reveal of a reading: the Result dial's needle and the number beneath it,
 * sweeping from zero to what was measured. Pure, so the rules can be tested
 * without a phone.
 *
 * One driver, `progress`, runs from 0 to 1 on the UI thread. The needle and the
 * number both read it, so they cannot drift apart by even a frame.
 */

/** What has to be true before a reveal may start. */
export type RevealGate = {
  /** There is a measured reading to reveal. */
  ready: boolean;
  /** The view it is drawn in has been laid out, so it has a size to draw at. */
  laidOut: boolean;
  /**
   * The screen has finished arriving: the push transition has ended, or the
   * wait for it has run out. Until then the UI thread is busy drawing the
   * screen in, and a clock-based sweep started now would skip its first frames.
   */
  settled: boolean;
  /** It has already started. A reveal plays once. */
  started: boolean;
};

/**
 * Whether to start the sweep now. Starting it on mount was the bug: the sweep
 * runs on the clock, so the frames the UI thread spent mounting the screen,
 * compiling the dial and running the transition were skipped, not delayed, and
 * the needle jumped most of the way before it was seen to move.
 */
export function shouldStartReveal(gate: RevealGate): boolean {
  return gate.ready && gate.laidOut && gate.settled && !gate.started;
}

/**
 * The value on screen for one frame of the sweep: its share of the reading,
 * held between zero and the reading itself even for a frame that arrives past
 * the end, so nothing ever shows more than was measured.
 */
export function sweptValue(progress: number, value: number): number {
  'worklet';
  return Math.min(Math.max(progress, 0), 1) * value;
}
