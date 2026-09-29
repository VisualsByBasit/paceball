/**
 * The logo intro on a cold start: assets/intro/logo-reveal.mp4, 1080 x 1920,
 * the logo centred on the app's background. Pure, so its rules can be tested
 * without a phone.
 */

/** The video's own frame, and where the PACEBALL wordmark's foot sits in it. */
export const INTRO_VIDEO = { width: 1080, height: 1920, logoFoot: 1260 } as const;

/**
 * Where the intro is:
 * - playing: the video is on screen;
 * - badge: Pro only, the video has ended and the PRO badge shows under the logo;
 * - leaving: fading into Home;
 * - fallback: the video could not play, so the existing drawn intro runs instead;
 * - done: nothing is shown.
 */
export type IntroPhase = 'playing' | 'badge' | 'leaving' | 'fallback' | 'done';

export type IntroEvent = 'ended' | 'badgeShown' | 'left' | 'tap' | 'error' | 'cap';

/** Whether to show anything at all: once per cold start, and never with reduced motion. */
export function introStart({ played, reduced }: { played: boolean; reduced: boolean }): IntroPhase {
  return played || reduced ? 'done' : 'playing';
}

/**
 * The next phase. A tap skips whatever is showing. The cap ends it wherever it
 * is, so the app is never held behind it. A playback error hands over to the
 * drawn intro. The badge is for Pro alone, read from the entitlement when the
 * video ends.
 */
export function nextIntroPhase(phase: IntroPhase, event: IntroEvent, isPro: boolean): IntroPhase {
  if (phase === 'done') return 'done';
  if (event === 'tap' || event === 'cap') return 'done';
  switch (phase) {
    case 'playing':
      if (event === 'ended') return isPro ? 'badge' : 'leaving';
      if (event === 'error') return 'fallback';
      return phase;
    case 'badge':
      return event === 'badgeShown' ? 'leaving' : phase;
    case 'leaving':
      return event === 'left' ? 'done' : phase;
    case 'fallback':
      return event === 'left' ? 'done' : phase;
  }
}

/**
 * The video's rectangle on screen when it is contained: as large as fits,
 * centred. The rest of the screen is the same background the video's own
 * padding is, so a taller phone shows no seam and nothing is cropped.
 */
export function containedVideo(screenW: number, screenH: number): { x: number; y: number; w: number; h: number; scale: number } {
  const scale = Math.min(screenW / INTRO_VIDEO.width, screenH / INTRO_VIDEO.height);
  const w = INTRO_VIDEO.width * scale;
  const h = INTRO_VIDEO.height * scale;
  return { x: (screenW - w) / 2, y: (screenH - h) / 2, w, h, scale };
}

/** Where the PRO badge's top edge goes: just under the wordmark, `gap` below its foot. */
export function badgeTop(screenW: number, screenH: number, gap: number): number {
  const v = containedVideo(screenW, screenH);
  return v.y + INTRO_VIDEO.logoFoot * v.scale + gap;
}
