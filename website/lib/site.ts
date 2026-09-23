/**
 * Everything the site links to or quotes, in one place.
 *
 * BETA_URL is the Google Play closed testing opt-in link. Fill it with the
 * link from Play Console (Testing, Closed testing, Testers, "Join on the web").
 */
export const BETA_URL = "https://play.google.com/apps/testing/com.paceball.app";

export const CONTACT_EMAIL = "paceballpro@gmail.com";

/** Date shown as "Last updated" on the privacy policy and the terms. */
export const POLICY_UPDATED = "23 September 2026";

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
  /** Left empty until the first HackerNoon story is live. The card shows without a link until then. */
  hackernoon: "",
} as const;

export const NAV = [
  { href: "/", label: "Home" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;
