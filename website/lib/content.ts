/** The landing page's words, in one place. Plain hyphens only, never em dashes. */

export const STEPS = [
  {
    verb: "Record",
    title: "Film the delivery side-on",
    body: "Hold the phone still, square of the pitch, with the ruler and the whole flight in frame. Live capture only, at least 3 seconds, so the frame rate can be read from the file.",
  },
  {
    verb: "Mark",
    title: "Tap four points",
    body: "Two ends of a known distance set the scale: both sets of stumps, two markers you measured, or the ball. Then step frame by frame to the release and the bounce.",
  },
  {
    verb: "Read",
    title: "Get the speed with its range",
    body: "The average speed from release to bounce, with a ± range worked out for that one reading. Save it, share it as a card or a clip, and watch the trend.",
  },
] as const;

export const REFUSALS = [
  {
    title: "No seen bounce, no speed",
    body: "Every bounce mark says whether the ball was seen, uncertain or guessed. Uncertain widens the range. A guessed bounce gives no speed at all, and nothing measured from it is shown or counted.",
  },
  {
    title: "Implausible readings are flagged",
    body: "A reading over 180 km/h, or with a range wider than ± 25 km/h, is tagged \"Check this reading\" and never counts as a best.",
  },
  {
    title: "No spin rate",
    body: "Video at 60 fps cannot resolve how fast a ball spins, so there is no RPM and no spin type. Not even an estimate.",
  },
  {
    title: "Marked, not tracked",
    body: "The line on the frame joins the points you tapped. It is never presented as a tracked path through the air.",
  },
] as const;

export const FEATURES = [
  {
    title: "Any ruler",
    body: "Stumps at 20.12 m, two markers you measure or pace out, or the ball itself. The range knows which you used.",
  },
  {
    title: "fps from the file",
    body: "Every clip's frame rate is read from its own video track, like 60.03. Never assumed to be 60.",
  },
  {
    title: "Frame by frame",
    body: "Exact frames, decoded on the phone, so each mark lands on the frame the ball was really in.",
  },
  {
    title: "A range for every reading",
    body: "Frame timing, the ruler's length and your marking, combined for that delivery. Never a fixed figure.",
  },
  {
    title: "Share card and video clip",
    body: "A 1080 x 1350 card or a short clip with the reading burned in, marks and all.",
  },
  {
    title: "History and Stats",
    body: "Your best, every delivery, speed over time with each range, and how often the bounce was seen.",
  },
  {
    title: "Compare",
    body: "Two deliveries side by side, both ranges on one scale, and whether they overlap.",
  },
  {
    title: "Stays on your phone",
    body: "No account and no server of our own. Paceball never uploads your videos or measurements.",
  },
] as const;

/** Free vs Pro, as the app gates them (src/purchases/gates.ts). */
export const PLAN_ROWS: { feature: string; free: string; pro: string }[] = [
  { feature: "Speed with its ± range", free: "Yes", pro: "Yes" },
  { feature: "Rulers: stumps, markers, the ball", free: "Yes", pro: "Yes" },
  { feature: "Analyses", free: "3 per 7 days", pro: "Unlimited" },
  { feature: "History and personal best", free: "Yes", pro: "Yes" },
  { feature: "Share card and video clip", free: "With the Paceball band", pro: "Clean" },
  { feature: "Stats and the History trend", free: "Personal best only", pro: "Yes" },
  { feature: "Compare two deliveries", free: "No", pro: "Yes" },
  { feature: "Recording quality", free: "Standard", pro: "Higher, on supported phones" },
];

export const FAQ = [
  {
    q: "How accurate is it?",
    a: "As accurate as the range says. Every reading carries its own ± range, from which frame each mark landed on, how well the ruler's length is known, and how precisely the points could be tapped. A steady phone, side-on, with both sets of stumps in frame gives a tight range. A paced ruler or a short flight gives a wide one, and the app shows that rather than hiding it.",
  },
  {
    q: "Is it the same as a radar gun?",
    a: "No. A radar reads the ball as it leaves the hand. Paceball gives the average speed from release to bounce, which is lower, because the ball slows in the air. Release speed is typically 5 to 8% higher.",
  },
  {
    q: "Which phones does it work on?",
    a: "Android 9 or newer, recording at 60 fps. There is no iOS version yet.",
  },
  {
    q: "Why show a ± range at all?",
    a: "Because a single number would claim more than a phone video can know. At 60 fps a fast delivery crosses only a couple of dozen frames, so one frame either way moves the answer. The range tells you how much a reading can be trusted, and whether a difference between two deliveries is real.",
  },
  {
    q: "What happens to my videos?",
    a: "Paceball never uploads your videos or measurements. There is no account and no server of our own; the measurement runs on the phone. On launch, it checks with RevenueCat whether this phone has Pro and asks Google Play for the plans and prices. Purchases go through Google Play and RevenueCat, crash reports go to Sentry only if you turn them on, and a card leaves only when you share it. Android's own backup may copy app data to your Google backup.",
  },
  {
    q: "How do I join the beta?",
    a: "Join the tester Google Group, then open the Google Play testing link with the same Google account and tap \"Become a tester\". The steps are at the top of this page.",
  },
  {
    q: "How do I cancel the free trial?",
    a: "In the Play Store: profile icon > Payments & subscriptions > Subscriptions > Paceball > Cancel. Cancel within the 7 days and nothing is charged.",
  },
] as const;

export const TEAM = [
  { name: "Abdulbasit", role: "Founder, design and product", initial: "A" },
  { name: "Mustafa Asim", role: "Partner, lead developer", initial: "M" },
] as const;
