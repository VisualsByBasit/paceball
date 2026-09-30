/** Everything the site links to or quotes, in one place. */

/**
 * The beta is two steps. Closed testing admits members of a Google Group, so a
 * visitor joins the group first, then opts in on Google Play with the same
 * Google account. The opt-in page refuses anyone who is not in the group.
 *
 * BETA_GROUP_URL is the Google Group's join page. While it is empty, the site
 * shows a single "Request access" email instead of a link that would fail.
 * BETA_URL is the Play opt-in link, from Play Console (Testing, Closed
 * testing, Testers, "Join on the web"). Never link to it without the group
 * step beside it: see lib/beta.ts.
 */
export const BETA_GROUP_URL = "https://groups.google.com/g/paceball-testers";
export const BETA_URL = "https://play.google.com/apps/testing/com.paceball.app";

/**
 * The store listing. It opens for testers once they have opted in, and for
 * everyone once Paceball is in production.
 */
export const PLAY_LISTING_URL = "https://play.google.com/store/apps/details?id=com.paceball.app";

/**
 * The demo video, as an embed URL (for YouTube, the youtube-nocookie.com/embed/
 * form). While it is empty, the hero shows a "Demo video coming soon" frame.
 */
export const DEMO_VIDEO_EMBED_URL = "";

export const CONTACT_EMAIL = "paceballpro@gmail.com";

/**
 * Dates shown as "Last updated" on each legal page. The privacy date matches
 * PRIVACY_UPDATED in the app's src/purchases/links.ts, and a test holds them
 * together.
 */
export const PRIVACY_UPDATED = "29 September 2026";
export const TERMS_UPDATED = "25 September 2026";

export const SITE_NAME = "Paceball";
export const SITE_DESCRIPTION =
  "A cricket speed gun on your phone. Record a delivery, mark four points, and get the average speed to bounce with its error range.";

/** Absolute origin for metadata. Vercel sets VERCEL_PROJECT_PRODUCTION_URL on its own. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const SOCIAL = {
  x: "https://x.com/paceballpro",
  instagram: "https://www.instagram.com/paceballpro/",
  github: "https://github.com/VisualsByBasit/paceball",
  license: "https://github.com/VisualsByBasit/paceball/blob/main/LICENSE",
  /** An empty link shows the card without one. */
  hackernoon: "https://hackernoon.com/u/abdulbasitso019?tab=stories",
} as const;

/** The logo in the header links home, so the list starts with the judges' guide. */
export const NAV = [
  { href: "/#judges", label: "Judges" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;
