# Paceball design brief - final

26 September 2026. For Claude Code. Branch `ab/design`, from current `main`.

This brief redesigns how Paceball looks, moves and reads. It does not change how
Paceball measures, counts, sells or stores. Where this brief and the code disagree
about behaviour, the code and its tests win and you tell me. Where they disagree
about appearance, this brief wins.

---

## 0. How to work

1. Read `CLAUDE.md`, `src/ui/tokens.ts`, `src/ui/motion/*` and every screen in `app/`
   before changing anything. Restyle and restructure what exists. Do not rewrite a
   screen from scratch when a restyle gets there.
2. Work in the stages of section 5, in order. One stage per commit or small group of
   commits. Run `npm test` and `npx tsc --noEmit` before every commit. All existing
   tests stay green. Add tests for the new rules listed per stage.
3. Mustafa owns `app/compare.tsx`, `src/data/*` (players, trends, comparison) and the
   export renderer (`src/export/drawCard.ts` and friends). Changes to his files go in
   their own commits prefixed `mu:` so he can review them separately.
4. Every colour, size, radius, stroke, duration and easing comes from `tokens.ts`.
   Add missing tokens there first. No hardcoded values.
5. No em dashes anywhere, in copy or comments you add. Plain hyphens. A test already
   enforces this for app copy.
6. **Native changes need my approval first.** If anything needs a new library, a
   custom font file, a sound player not already installed, a config plugin,
   `app.json` changes, new permissions or a launcher icon swap, stop and list it
   with a JavaScript-only fallback. Default to the fallback.
7. Push the branch after each stage so I can review stage by stage. Do not merge.

---

## 1. Do not change

These are tested product truths. Restyle around them, never through them.

- **Measurement.** `src/physics/*`, the uncertainty model (v2), `measurementState`,
  frame timing, calibration methods, marker sources, shoe pacing. The displayed
  speed and range format stays what the model produces (for example `124.8` with
  `± 3.1 km/h`). Do not switch to integer rounding or interval notation.
- **A guessed bounce produces no speed.** Unusable deliveries stay unusable.
- **Free allowance.** Anchored 7-day period from the first ever analysis, 3 per
  period, shared across all players on the phone. Logic and tests unchanged. Only
  its visual presentation changes.
- **Purchases.** RevenueCat entitlement `pro`, current offering, prices and trial
  read from the store, never written by the app. Buy, restore and cancel handling
  unchanged. A keyed build never shows sample prices.
- **Pro bitrate logic, lens fallback, microphone behaviour, muted playback, silent
  exports by default, portrait lock.**
- **Diagnostics.** Sentry opt-in stays exactly as it works. The privacy screen keeps
  every claim its tests check (what can leave the phone, where, when).
- **Storage, deletion, history paging, trends and comparison data layers.**
- **Website beta flow** (Group first, then Play, same-account note). Website work in
  this brief is visual only and last.

---

## 2. Direction

**Calm precision instrument.** Black space, flat panels, white tabular numbers, lime
only for the current action, the selected mark and the completed reading. The speed
and its range are one inseparable reading. Character comes from cricket geometry
(stumps, the pitch line, the wicket lock), a deliberate frame scrubber and exact
language. Borrow one thing from the louder broadcast look: a decisive result arrival.

No gradients, no glows, no shadows, no glass, no photo avatars, no neon splash
imagery, no badges like "Most popular", no ratings, no user counts, no testimonials,
no spin, no curved or moving ball trails.

The mockup sheet is a layout reference only. Take its structure for Home, Capture,
Result, Compare, Stats and Settings. Ignore its glow effects, photo imagery and
any copy that conflicts with this brief.

---

## 3. Tokens

Keep everything in `tokens.ts`. Add:

| Token | Value | Use |
|---|---|---|
| `colors.control` | `#626A76` | Input outlines, unselected controls, chart axes (3.6:1 on bg, `line` is too faint to mark a boundary) |
| `type.heroCompact` | 64 / 72, 900 | Result number below 380 dp width |
| `type.reading` | 40 / 48, 900 | Personal best, Stats, Analysis, Compare, share card |
| `type.body` | raise 15 to 16, line height 24 | Outdoor readability. Check nothing clips |
| `type.button` | 16 / 24, 700 | Buttons |
| `size.target` | 48 | Minimum touch target everywhere |
| `size.button` | 56 | Primary button height |
| `size.record` / `size.recordInner` | 80 / 64 | Record button |
| `size.detent` | 72 | Scrubber height |
| `size.loupe` | 96 | Mark loupe |
| `size.row` | 80 | Delivery rows |
| `motion.nav` | 180 ms, `[0.2, 0, 0, 1]` | Route transitions |
| `motion.sheet` | 220 in / 180 out, same curve | Bottom sheets |
| `motion.press` | 80 in / 120 out, linear | Button press (outline/colour only, no scaling) |
| `motion.lock` | bail 180 ms, colour 120 ms | Wicket lock |
| `motion.celebrate` | 1100 ms total | Purchase emblem |

Line heights go on every type token. Lime buttons use `bg` text, never white.
Controls over video sit on opaque `bg` plates. Disabled states show a reason in
text, not only reduced opacity. Warning and danger always come with an icon or word.

---

## 4. Shared components

Build these in `src/ui/` and use them everywhere. Each needs its listed states.

| Component | Spec |
|---|---|
| `ActionButton` | 56 high, radius 14, 24 horizontal padding. Primary lime with bg text, secondary outlined in `control`, destructive outlined in `danger`. Idle, pressed (strong outline, no scale), busy (text says what is happening), disabled with reason. |
| `ReadingBlock` | Speed + unit + range + method line as one accessibility group. Sizes hero / heroCompact / reading. States: measured, measured with caution, no speed, missing video. There is no way to render it without the range. |
| `AllowanceLine` | One line plus a reset caption, using the existing allowance copy and data. Available, last one, used up, Pro (hidden or "Pro - unlimited"). No progress ring. |
| `DeliveryRow` | 80 min height, 48 thumbnail, speed + range or the no-speed reason, date. Normal, selected, not selectable (with reason), deleting. |
| `Notice` | Icon + body + optional action. Info, caution (warn), error (danger), success. Never auto-dismisses important information. |
| `BottomSheet` | Radius 24 top, strong top rule, heading, 48 close target, scrim. No shadow. |
| `EmptyState` | h2, body, one optional CTA. Never sample data or a 0 speed. |
| `WicketLock` | Three stumps + bail, drawn in Skia or Views. See motion. |
| `TabBar` | Home / History / Settings, labelled, 64 high, only on those three screens. |

Loading states name the actual operation ("Loading deliveries..."), use static
outlined placeholders, no shimmer, no fake percentages.

---

## 5. Stages, in demo priority

Stages 1 to 4 are what the judges see first and must land by the night of 27 Sep.
Stages 5 to 7 follow. Stage 8 and the website are optional.

### Stage 1 - Result and the reveal

The signature moment. `app/result.tsx`.

Layout top to bottom:
- App bar: back, "Result". After saving, caption "Saved on this phone".
- Label "AVERAGE SPEED".
- `ReadingBlock` hero: the number, unit beside it, range line below
  (`± 3.1 km/h`), method line "Release to bounce".
- `WicketLock` centred under the reading.
- Evidence panel: the release frame, reference marks, release and bounce marks,
  the straight connector drawn with `PathDots`, label "Marked, not tracked" always
  visible, caption "Bounce marked on frame {n}".
- Existing cautions as `Notice` (short reference and similar), same conditions.
- "How this was measured": the existing working rows, restyled as a two-column
  label/value list that stacks at large text. Keep the existing rows and footnotes.
- Sticky footer: primary "Save" (then "Saved"), secondary "Share reading",
  text action "Record another".

**The reveal (decision):** the range line is on screen, in `muted`, from the very
first frame, so the number is never shown alone. `CountUpReading` counts from 0 to
the value in 1000 ms on `settleCurve` and never overshoots (existing behaviour, keep
it). When it lands: range turns `text` colour (240 ms), the wicket bail drops 4 dp
into place (180 ms), stumps and bail turn lime (120 ms), one light haptic. Screen
reader announces the full reading once, after it lands, never the counting values.
Reduced motion: everything shows final immediately. Share stays disabled until
the reading is saved.

**No-speed state** (guessed bounce or unusable): no number, no count-up, no wicket
lock. h1 "No speed measured", body "The bounce was guessed. A guess cannot produce a
reading." (or the existing unusable reason). Neutral white icon, not red. Evidence
still shows the marks that exist, no connector without a bounce. The existing
working footnotes stay. Primary "Save without speed", secondary "Record another".
Share is unavailable with "A measured reading is needed to share a speed card."

Tests: the Result tree never renders a speed without its range element mounted;
no-speed renders no numeric speed at all; screen reader label is one group with the
range; reduced motion shows final values.

### Stage 2 - Mark and the scrubber

`app/mark.tsx` and `src/ui/CalibrationStep.tsx`.

- App bar: back, "Mark delivery", step counter "1 of 4" to "4 of 4".
- Step list with four labelled steps: Reference start, Reference end, Release,
  Bounce. Done steps show a check and are revisitable.
- Video canvas fills the upper area, contained, never cropped. Active mark is a
  lime crosshair, confirmed reference marks are white, release and bounce are
  labelled. Add the 96 dp loupe offset above the finger while dragging, sampling
  the real frame pixels.
- Instruction line under the canvas, exact copy: "Mark the first reference point",
  "Mark the second reference point", "Find release. Mark the ball.", "Find bounce.
  Mark the ball." Helper for release: "Choose the first frame where the ball has
  left the hand." For bounce: "Choose the first frame where the ball touches the
  ground."
- Frame control: "Previous frame" button (48), `DetentStrip` 72 high, "Next frame"
  button (48). Caption "Frame {i} of {n} · {fps} fps" in tabular numbers. Keep the
  existing hold-to-repeat behaviour. While a frame is decoding show "Loading
  frame..." and block marking.
- Bounce confidence stays exactly as the app has it now (seen / uncertain / guessed
  on the bounce). Restyle it as a three-way segmented control, each 48 high.
  Uncertain marks draw as a hollow diamond, guessed as a crossed hollow symbol with
  the word "Guessed".
- Calibration step: restyle the existing reference picker (pitch, markers, ball,
  height) as full-width choice rows with the selected row outlined in lime. Keep
  every field, source and computed value it has now.
- Primary CTA changes per step: "Confirm reference start", "Confirm reference end",
  "Confirm release", "Show reading". A guessed bounce changes it to "Save without
  speed".

Haptics: selection tick per frame crossed (existing), light impact on each confirm,
warning on an invalid action (bounce before release).

### Stage 3 - Capture

`app/capture.tsx`. Behaviour unchanged (lens logic, exposure clamp, bitrate, mic
prompt timing, 3-second recording from first frame, cancellations).

- App bar: back, "Capture", quality chip on the right: free "Standard", Pro
  "Pro quality" only when the higher bitrate is actually in use.
- Preview contained, preferred 3:4. Framing guide: white corner brackets plus a
  thin baseline with two outlined stump icons and the plate label "Fit both stumps,
  release and bounce". It is a guide, never a detection result.
- Lens: segmented "1x" / "0.6x" chips, 48 each. Keep the existing dark-hold
  transition, restyle it: fade to bg, "Switching lens...", fade in when frames
  arrive. 0.6x hidden when the phone has no ultra-wide (existing rule).
- Exposure row: label "Exposure", the existing control restyled with minus and plus
  48 targets, helper "Brighter video can mean more blur. Use more light when you
  can."
- Action row: mic status left, 80 dp record button centre (circle to rounded square
  when recording, 160 ms), timer right in tabular numbers. Last line:
  `AllowanceLine`.
- Mic prompt sheet on first visit: "Record sound too?" / "Sound is optional.
  Measurement works without it. Replays and exports start muted." / "Allow
  microphone" / "Continue without sound". Keep the existing once-only logic.

### Stage 4 - Paywall and purchase celebration

`app/paywall.tsx`, one component for every context. Prices, trial and eligibility
come from the offering exactly as now.

Order: context headline, value list, two plan rows (annual preselected), CTA,
renewal line, contextual dismiss, Restore purchases, Terms, Privacy. The dismiss
action is also reachable at the top. No countdown, no savings percentage, no badge,
no social proof. Price at least 14 pt, shown once per plan.

Value list (only list what the build actually ships): "Unlimited analyses",
"Watermark-free exports", "Higher recording quality", "Compare deliveries", and
"Your stats" only once Stage 6 Stats has shipped.

Plan rows:
- Annual: when the store reports a trial, "7 days free, then {annual price}/year".
  Otherwise "{annual price}/year".
- Monthly: "{monthly price}/month". Monthly has no trial. Never write "7 days free"
  on it.

CTA follows the selected plan: annual with a trial "Start my 7 days free", annual
without "Start Pro yearly", monthly "Start Pro monthly". Renewal line with a trial:
"No charge today. Renews automatically after the trial unless you cancel in Google
Play." Without: "Renews automatically. Cancel anytime in Google Play."

| Context | Headline (trial available) | Dismiss |
|---|---|---|
| Onboarding | "7 days free. Every delivery, without limits." | "Continue with 3 analyses a week" |
| Weekly limit | "Keep bowling with 7 days free" | "Wait for my next 3 analyses" |
| Export | "Share without the watermark. 7 days free." | "Continue with the watermark" |
| Compare | "Compare your deliveries. 7 days free." | "Continue without comparison" |
| Stats | "See your stats. 7 days free." | "Continue with personal best only" |

Without a trial, drop "7 days free" from the headline ("Keep bowling with Pro" and
so on). The weekly-limit context adds the existing reset-day line in the body.
Keep the existing contexts, routing and once-only onboarding logic. States keep
their current behaviour, restyled: loading plans (CTA disabled, dismiss available),
offline, no offering, purchase in progress ("Opening Google Play...", duplicates
blocked), cancelled (return silently), failed, pending, restore results.

**Purchase celebration** (new route, shown once only after the store confirms the
`pro` entitlement, never on tap, never on restore): full-screen bg, no chrome. A 96
dp emblem: three white stumps fade in (0-180 ms), a lime ball rolls along one
straight baseline and stops beside them (180-650 ms, settleCurve), the bail settles
(650-850 ms) with a success haptic, copy fades in (850-1100 ms). h1 "You're on Pro",
body "More deliveries. The same honest readings." Button returns to what started
the purchase: "Let's bowl", "Continue export", "Compare deliveries" or "See my
stats". The button works immediately, no forced watch. Silent. If a sound player
is already installed, list the option for me, do not add one. Restore shows a
"Pro restored" Notice instead. Reduced motion shows the finished emblem.

### Stage 5 - Setup, Home, Analysis, History

- **Setup** (`app/setup/*`): three steps with "Step n of 3". Player: h1 "Who's
  bowling?", fields as now, helper "Measure heel to toe. These can be used as
  reference lengths later." Placement: h1 "Film side-on. Keep it steady.", a flat
  diagram (pitch line, two stumps, phone perpendicular, no ball trail), the three
  tips. How it works: h1 "Four marks. An honest estimate.", four numbered rows,
  then "Average speed from release to bounce, not release speed." and "No visible
  bounce means no speed." CTA "Let's bowl". Keep the existing onboarding paywall
  trigger.
- **Home** (current landing screen): wordmark left, 48 avatar (first letter of the
  player name, lime outline) right. h1 "Ready, {name}?". Primary "Record a
  delivery", then `AllowanceLine`. Personal best card: h2 "Personal best",
  `ReadingBlock` at `reading` size, caption "Highest estimate", opens that delivery.
  "Recent deliveries" with "See all", last three `DeliveryRow`s. `TabBar`. Empty:
  "Your first reading starts here." / "Film a delivery and mark what you can see."
- **Analysis**: restyle to match Result. Replay with speed chips 0.25x / 0.5x / 1x,
  the existing muted-by-default sound switch, static marks (no PathDots replay),
  `ReadingBlock` at `reading` size, working list, Share and Delete as they work now.
- **History**: title, player row, "Compare" action. `DeliveryRow` list grouped by
  date. Delete confirm: "Delete this delivery?" / "Its video, marks and reading will
  be removed from this phone." / "Keep delivery" / "Delete delivery". Compare mode
  as it works now, restyled: "Choose two measured deliveries", footer "Choose 2
  deliveries" / "Choose 1 more delivery" / "Compare 2 deliveries".

### Stage 6 - Compare and Stats

- **Compare** (`mu:` commit): verdict card first, then two equal columns
  "Delivery A" / "Delivery B" with thumbnail, `ReadingBlock` at `reading` size,
  date. Below, both ranges as horizontal bars on one shared scale. Verdict copy on
  the existing logic: clear gap "Delivery A has the higher estimated speed" with
  "These ranges do not overlap."; overlap or touch "Too close to call" with "The
  estimated ranges overlap or touch." Never "clearly faster". Stacks at large text.
- **Stats** (new screen, Pro, opened from the Home avatar): bento grid, two columns.
  Personal best tile spans both columns and is free. Pro tiles: "Measured
  deliveries" (count), "Average estimate" (mean speed with mean range, caption
  "Across measured deliveries"), "Speed over time" full width (points with vertical
  range bars from the existing trends layer, no smoothed line). Free users see the
  tile names with a lock and one CTA "See Pro stats" to the stats paywall. No mock
  numbers. Reuse existing data functions; if a new query is needed, add it in a
  `mu:` commit with tests.

### Stage 7 - Settings, privacy, share card

- **Settings**: groups Measurement (units, calibration defaults, exposure default),
  Recording (microphone), Pro (status, "See Pro options" or "Manage subscription",
  "Restore purchases"), About (Privacy and crash reports, Licence, version). 56 dp
  rows. Behaviour unchanged.
- **Privacy and crash reports**: restyle only. Keep every current claim and the
  Sentry opt-in toggle exactly. Heading "Your deliveries stay on this phone" only
  if it does not contradict the tested "no screen claims nothing leaves the phone"
  rule; the "What can leave this phone" section must stay beside it.
- **Share card** (`mu:` commit, `drawCard`): 1080 x 1350. Top: small "Paceball",
  speed at `reading` size, range, "Average speed, release to bounce", player name.
  Middle: release frame with reference marks, release and bounce labels, straight
  connector, "Marked, not tracked". Bottom: date and "Estimated from marked distance
  and frame timing." Free watermark becomes a full-width opaque strip "PACEBALL ·
  FREE" placed between the speed and its range, so cropping it out cuts the reading.
  Pro removes the strip and closes the gap, nothing else changes. Keep all existing
  export tests passing, update the ones that assert the old watermark position.

### Stage 8 - optional, ask me first

- **Video share with HUD**: the Media3 export exists behind the debug route. If
  promoting it to the share sheet needs no native change, propose the plan (sheet
  with "Image card" / "Video clip", clip trimmed 0.5 s before release to 0.75 s
  after bounce, HUD with the full reading from the first frame, same watermark
  strip, "Include original sound" off by default). Do not build it without my go.
- **Website**: visual alignment only with the app's new tokens. No flow changes.
- **Launcher icon**: needs a new build. Only list it.

---

## 6. Motion and haptics

No measured number ever overshoots. Only hand-driven things use springs.
Reduced motion removes travel, counting and pulses; states appear immediately.

| What | Trigger | Timing |
|---|---|---|
| Route | push / pop | 180 ms, [0.2,0,0,1], 16 dp + opacity |
| Sheet | open / close | 220 / 180 ms, same curve, 24 dp + opacity |
| Button | press | outline/colour 80 in / 120 out, no scale |
| Lens switch | tap | 120 ms fade out, wait for frames, 180 ms fade in |
| Record button | start / stop | 160 ms circle to rounded square, follows real recorder state |
| CountUpReading | saved reading mounts, laid out, transition ended | 1000 ms, settleCurve, never overshoots, needle and number on one driver |
| Range emphasis | count lands | muted to text, 240 ms |
| Wicket lock | count lands | bail 4 dp in 180 ms, lime in 120 ms, once |
| PathDots | Result evidence mounts | 70 ms stagger, endpoint pulse 560 ms, once, never loops |
| DetentStrip | finger | existing springs, unchanged |
| Purchase emblem | confirmed purchase | 1100 ms as in Stage 4, no springs |
| Notice | appears | 120 ms opacity, no shake |
| Delete row | after delete commits | 160 ms collapse |

| Event | Haptic |
|---|---|
| Frame crossed / stepped | selection tick (existing) |
| Mark confirmed | light impact |
| Record start / stop | light impact after the real state change |
| Invalid action | warning, once |
| Wicket lock | light impact |
| Purchase confirmed | success, once |
| Delete confirmed | light impact |

No sounds anywhere in this stage of work. Playback and exports stay muted by default.

---

## 7. Accessibility

- 48 dp minimum targets, 8 dp between adjacent controls where it fits.
- A reading is one group: "Average speed, release to bounce: 124.8 kilometres per
  hour, plus or minus 3.1." Announced once after the reveal.
- Result order for screen readers: heading, reading, cautions, evidence summary,
  working, actions. Compare: verdict before the numbers.
- Charts have a text list alternative (date, speed, range) linking to deliveries.
- At 200% text: bento becomes one column, compare stacks, plan rows grow, sticky
  footers go in-flow. Nothing hides a range, a price or a dismiss action.
- No flashing, no looping pulses. Test on the real phone outdoors.

---

## 8. Acceptance

- `npm test` and `tsc` green after every stage. All 245 existing tests still pass.
- No speed is rendered anywhere without its range. No-speed states render no number.
- No count-up value ever exceeds the measured value.
- Monthly never shows a trial. Prices come only from the offering, once per plan.
- Physics, allowance, purchases, diagnostics, storage and website flow untouched.
- Every visual value comes from tokens. No em dashes.
- Mustafa's files changed only in `mu:` commits.
- A short list of anything that needs a native change or new dependency, with the
  fallback used.
