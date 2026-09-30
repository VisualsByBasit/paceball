/**
 * The app's screenshots, as resized WebP copies of docs/screenshots/*.png in
 * public/screenshots/. Phone screens are 720 x 1561; the share card is 720 x 900.
 */
export type Screen = {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
};

const phone = (name: string, alt: string, caption: string): Screen => ({
  src: `/screenshots/${name}.webp`,
  alt,
  caption,
  width: 720,
  height: 1561,
});

export const HOME = phone("home", "Home, with the personal best of 80.3 km/h, plus or minus 8, on a speedometer", "Home: the personal best");
export const CAPTURE = phone("capture", "Capture, with the framing guide and the Delay, Sound and Length chips", "Capture: live, 3 s minimum");
export const MARK_CALIBRATION = phone("mark-calibration", "Choosing the ruler: both sets of stumps, two markers, or the ball", "Pick the ruler");
export const MARK = phone("mark", "Marking the first marker, frame by frame, at 60.03 fps read from the file", "Mark four points");
export const RESULT = phone("result-1", "Result: average speed 80.3 km/h, plus or minus 8, release to bounce", "The speed and its range");
export const RESULT_DETAIL = phone("result-2", "How this was measured: frames 253 to 277, 24 frames at 60.03 fps, 0.3998 s", "How this was measured");
export const SHARE_CARD: Screen = {
  src: "/screenshots/share-card.webp",
  alt: "The Pro share card: the release frame with its marks, 80.3 km/h plus or minus 8, and the date",
  caption: "Share card (Pro)",
  width: 720,
  height: 900,
};
export const STATS = phone("stats-1", "Stats: deliveries, the personal best and speed over time", "Stats");
export const STATS_MORE = phone("stats-2", "Stats: deliveries per day, bounce confidence, and measured against no speed", "Stats: bounce confidence");
export const HISTORY = phone("history", "History on Pro, with every delivery's range on the trend chart", "History (Pro)");
export const HISTORY_FREE = phone("history-free", "History on the free plan, with the list and the best, and the trend locked", "History (Free)");
export const PAYWALL = phone("paywall", "The paywall, with the annual and monthly plans at the store's own prices", "Paywall: the store's prices");

/** The gallery, in the order the README shows them. */
export const GALLERY: Screen[] = [
  HOME,
  CAPTURE,
  MARK_CALIBRATION,
  MARK,
  RESULT,
  RESULT_DETAIL,
  SHARE_CARD,
  STATS,
  STATS_MORE,
  HISTORY,
  PAYWALL,
];

/** Free and Pro side by side. Only pairs whose free screenshot exists. */
export const PAIRS: { free: Screen; pro: Screen; freeCaption: string; proCaption: string }[] = [
  {
    free: HISTORY_FREE,
    pro: HISTORY,
    freeCaption: "Free: the list and the best, the trend locked",
    proCaption: "Pro: every reading's range on the trend",
  },
];
