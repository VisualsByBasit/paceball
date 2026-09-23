import { BETA_GROUP_URL, BETA_URL, CONTACT_EMAIL } from "./site";

export type BetaStep = { label: string; href: string };

/**
 * What the beta block offers. With a group link, both steps in order: the
 * group first, because the Play opt-in page refuses anyone not in it. Without
 * one, a single email request, so no visitor is sent to a page that will say
 * "you don't have access".
 */
export type BetaFlow =
  | { kind: "steps"; steps: [BetaStep, BetaStep] }
  | { kind: "request"; request: BetaStep };

export const BETA_REQUEST_SUBJECT = "Paceball beta";

export function betaFlow(
  groupUrl: string = BETA_GROUP_URL,
  playUrl: string = BETA_URL,
  email: string = CONTACT_EMAIL,
): BetaFlow {
  if (!groupUrl.trim()) {
    return {
      kind: "request",
      request: {
        label: "Request access",
        href: `mailto:${email}?subject=${encodeURIComponent(BETA_REQUEST_SUBJECT)}`,
      },
    };
  }
  return {
    kind: "steps",
    steps: [
      { label: "Join the tester group", href: groupUrl },
      { label: "Become a tester and install from Google Play", href: playUrl },
    ],
  };
}

/** Said beside the steps, in plain words. */
export const BETA_NOTES = [
  "Android only.",
  "Use the same Google account you use for Google Play on your phone. Google Play only lets that account in if it is the one that joined the group.",
  "After you join the group, it can take a few minutes before step 2 works.",
] as const;

/** Said beside the email request, while there is no group to join. */
export const BETA_REQUEST_NOTES = [
  "Android only.",
  "Send the request from, or include, the Google account you use for Google Play on your phone. That is the account we add, and Google Play only lets that account in.",
] as const;
