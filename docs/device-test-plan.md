# Paceball device test plan

Every check here needs a real phone. The automated suite (`npm test`) covers
the maths, the storage, the purchase logic and the copy; it cannot hold a
camera, hear a microphone, draw on a screen or talk to Google Play.

Work through it in order on one phone, then repeat the Capture, Audio and
Measurement sections on a second phone from a different maker. Write down the
phone, the Android version and the build for every run.

## Builds

- **Development:** the dev client from `npx expo run:android` or the EAS
  `development` profile, connected to Metro. It has the debug screen (Home,
  "Debug · saved sessions") and the Pro override.
- **Preview:** the EAS `preview` profile, a release APK installed by hand. No
  debug screen. Purchases cannot complete, because Google Play only sells to a
  build it installed.
- **Play:** the production build installed from the closed-testing track on
  Google Play, signed in with a tester account. The only build where buying,
  restoring and trials work.

A check marked with more than one build should pass on each.

## What you need

- A cricket pitch with both sets of stumps, or two markers a measured distance
  apart (a tape measure).
- A bowler, or someone throwing a ball.
- A second app that can hold the microphone: a voice recorder or a call.
- For the lens distortion check, a tape measure at least 10 m long.

## Capture

1. **Portrait lock.** (Development, Preview) Turn the phone to landscape on
   Home, Setup (all three screens), Capture, Mark, Result, Analysis, History,
   Compare, Settings, the privacy screen and the paywall. Every screen stays
   upright in portrait and nothing is cut off.
2. **Framing guide.** (Preview) Open Capture. The FRAMING card and the lime
   guide bar sit at the top. Start recording: the guide dims but stays. Tap
   Hide: it goes for the rest of the visit.
3. **Reference too small.** (Preview) Record a delivery with the stumps
   filling well under 60% of the frame width, mark it against Both sets of
   stumps, and open the result. A caution under the reading says the
   reference filled about N% of the frame and can read low. Repeat against
   The ball: no such caution appears.
4. **Lens swap.** (Preview) On a phone with an ultra-wide camera, Capture
   shows 1x and 0.6x. Tap 0.6x: the preview fades out, "Switching lens" shows
   while it is dark, and the preview fades back in wider. Tap 1x: the same
   back. The record button cannot be pressed while it switches. On a phone
   without an ultra-wide, no lens picker shows at all.
5. **Leaving during a lens swap.** (Development) Tap 0.6x and press Back
   straight away. Nothing errors and Home is shown.
6. **Exposure.** (Preview) In Settings set the exposure bias to −4, record,
   then set it to 0 and record the same scene. The −4 clip is visibly darker
   and the ball smears less. On a phone that cannot reach −4 the clip is as
   dark as it goes, with no error.
7. **Three-second minimum.** (Preview) Start recording. The shutter shows a
   countdown from 3 and cannot stop the recording until it reaches zero. Once
   stopped, Mark shows at least 3 seconds of frames (the frame time under the
   scrubber reaches 3.000 s or more).
8. **Camera permission refused for good.** (Preview) Uninstall and reinstall,
   deny the camera twice (or choose "Don't allow" with "don't ask again").
   Capture says Android will not ask again and the button reads "Open
   settings". It opens Paceball's system settings; allow the camera, go back,
   and the camera preview appears.
9. **Leaving while the clip is read.** (Development) Record, stop, and press
   Back while "Reading the clip" shows. Mark never opens on its own
   afterwards.
10. **Abandoned clips are deleted.** (Development) Note Paceball's storage in
    Android Settings, Apps, Paceball, Storage. Record and retake five times
    without saving. Storage and cache return to roughly where they started,
    not tens of megabytes higher per retake. Then record, mark and save one
    delivery: it still opens in Analysis with every frame.

## Audio

11. **Microphone offered once.** (Preview) On a fresh install, allow the
    camera. Capture shows "Record sound too?" with Video only and Allow
    microphone. Leave and come back: it does not show again, whichever was
    chosen.
12. **Allow.** (Preview) Choose Allow microphone and allow it in the system
    dialog. Record: the saved clip has sound when played in Analysis with
    sound switched on. Settings, Microphone says it is on.
13. **Deny, then record video only.** (Preview) On a fresh install choose
    Video only, or deny in the system dialog. Recording works and the clip is
    silent. Settings, Microphone says it is off and speeds are measured the
    same way. Nothing asks again.
14. **Microphone held by another app.** (Preview) Start a voice recording in
    another app, or be on a call, then record a delivery in Paceball. The
    recording still happens, and a note says it was recorded without sound
    because the microphone was in use. The clip reaches Mark.
15. **Failure mid-clip asks to record again.** (Development) Start recording
    with sound, then while it is recording start a call or a voice recorder
    that takes the microphone. If the recording fails, the message says it
    failed partway through, was not kept, and to record the delivery again,
    and that the next recording is video only. No new recording starts on
    its own and Mark does not open. Record again by hand: it records without
    sound. (If the phone lets both apps share the microphone, note that the
    failure could not be provoked.)
16. **Playback muted on every clip.** (Preview) Open a delivery with sound in
    Analysis and press Play: silent, the switch reads "Sound off". Switch it
    on: sound plays. Go back and open another delivery: it starts muted
    again. Reopen the first: muted again.
17. **Export silent by default.** (Development) On the debug screen, export a
    marked clip with the switch on "Sound off". Share it to a player: no
    audio track.
18. **Export with sound.** (Development) Switch "Sound on" and export again.
    The shared file has the delivery's sound. The switch is back off for the
    next export.

## Measurement

19. **Sound does not move the frame rate.** (Preview) Record the same scene
    twice, once with the microphone allowed and once with it off (turn it off
    in the system settings). Mark both against the same reference. Result,
    Show the working, "fps used" agrees to within 0.05 between the two.
20. **Landscape recording.** (Preview) Hold the phone in landscape and record
    a delivery (the screen itself stays portrait). Mark shows the frames the
    right way up. Mark it, save it, and check the reading against a portrait
    recording of a similar delivery from the same place. In Analysis the
    marks sit on the same pixels they were placed on.
21. **Known distance.** (Preview) Lay a tape along the pitch, record someone
    rolling a ball 10.00 m along it at a steady walk, and calibrate against
    the tape (Two markers, Tape or rule). The distance the ball travelled in
    Show the working reads 10.00 m within the error range's share.
22. **Guessed bounce gives no number anywhere.** (Preview) Mark a delivery and
    answer "No" to "Could you see the ball in the bounce frame?". Result says
    the bounce was not seen and shows no speed, no range, no flight time, no
    frame delta and no distance, and no travel warning. Save it. In History
    its row says "No speed · bounce not seen" with no distance; it is not the
    personal best and not in the trend. In Analysis the speed, error, travel
    and frame delta read "–" while fps still shows; there is no Share button.
    In compare selection it cannot be picked.
23. **Uncertain bounce.** (Preview) Mark the same delivery twice, answering
    "Yes" and then "Roughly". The speed is the same; the range is wider for
    Roughly.
24. **Ultra-wide distortion.** (Preview) With the 0.6x lens, record the tape
    from check 21 with its ends near the edges of the frame, and mark 2 m
    stretches at the centre and at each edge against the full tape as the
    reference. If an edge stretch reads more than about 1% shorter than the
    centre one, the phone does not correct the lens and the audit's M-4
    needs acting on. Repeat on 1x for comparison.
25. **Low-light frame rate.** (Preview) Record indoors or at dusk. Result,
    "fps used" stays within 59.8 to 60.05. A lower figure means the camera
    dropped frames, and the audit's M-5 needs evidence from that clip.

## Mark and Analysis

26. **Hold to repeat on Mark.** (Preview) Tap + once: one frame. Hold +: one
    frame, a short pause, then steady stepping until released. The same for −.
    Holding into either end stops there.
27. **Hold to repeat on Analysis.** (Preview) The same as check 26 on Analysis.
28. **Cancelled touch, then press.** (Preview) On both screens, put a finger on
    + and slide it off the button before lifting (a cancelled touch). Then tap
    + normally: it steps one frame. With TalkBack on, double-tap + : it steps
    one frame.
29. **Record again.** (Preview) There is no reliable way to make frame
    extraction fail on purpose. Whenever a clip does reach the "Could not read
    the frames" screen during testing, tap Record again: Capture shows, and
    pressing Back from it returns to Home rather than to a second Capture.

## History

30. **Delete.** (Preview) Press and hold a delivery, confirm Delete. It leaves
    the list, the trend and the personal best update, and its video and
    frames are gone. Cancel instead: it stays.
31. **Compare selection.** (Play, with Pro) Tap Compare, pick two measured
    deliveries: the older is A. The bar counts "2 of 2 picked" and Compare
    opens. A third tap does not pick a third. Back leaves select mode first.
32. **Not-seen cannot be picked.** (Play, with Pro) In select mode, a delivery
    with a guessed bounce is dimmed, says why, and cannot be picked.

## Pro and the free plan

33. **Free limit counts down.** (Play, free account) Save three deliveries in
    one week. Capture and Settings count 3, 2, 1 of 3 left. After the third,
    the line names the weekday they come back, the shutter says "Tap to see
    Pro." and opens the paywall instead of recording.
34. **Pro quality.** (Play, with Pro) Record once at the default (the first
    recording on a fresh install), then record again. The second shows "PRO
    QUALITY" above the shutter, and its file is larger than the first for a
    clip of the same length (check sizes on the debug screen of a development
    build with the Pro override, or in the phone's file manager).
35. **Clean export on Result.** (Play, with Pro) Save a delivery and create a
    share image on Result: no PACEBALL wordmark at the bottom. On a free
    account the wordmark is there.
36. **Clean export on Analysis.** (Play) Open Share on a measured delivery.
    Free: "Export without the watermark" opens the paywall, and the share
    sheet closes first so the paywall is visible at once. Pro: "Create image
    without the watermark" makes a card with no wordmark.
37. **Compare.** (Play) Free: Compare in History opens the paywall. Pro: it
    enters select mode. Opening Compare straight after launch, before the
    store has answered, shows a spinner rather than the paywall.
38. **Onboarding paywall once.** (Play) Fresh install, finish setup: the
    paywall appears once. Skip it: Capture opens. Close and reopen the app,
    record, go back and forth: it never appears again on its own. With Pro
    already on the account it never appears.

## Purchases

All on the Play build with a licence-tester account.

39. **Buy.** Buy the annual plan. The trial is shown as "Start my 7 days
    free" with the store's own price under it. After Google Play confirms,
    the paywall shows Done at once, Settings says Pro is active with its
    renewal date, and the limit and watermark are gone.
40. **Backing out.** Open the purchase sheet and press Back. The paywall
    says the purchase was cancelled and nothing was charged.
41. **Restore.** Clear the app's data (or reinstall), open Settings, Restore
    purchases. It reports Pro active on this phone with the date. On an
    account with no purchase it says Google Play found none.
42. **Cancel.** Cancel the subscription in Google Play. Settings says Pro ends
    on the period's last day, and Pro stays until then.
43. **Expire.** Let the tester subscription lapse (tester renewals are
    minutes long). Without restarting, Pro turns off: the limit and watermark
    return.
44. **Re-buy without a second trial.** Buy the annual plan again on the same
    account. The paywall does not offer "7 days free" and the button reads
    "Start my annual plan".
45. **Offline at launch.** Turn on airplane mode, launch the app, open the
    paywall: it says the plans could not be loaded, with no prices at all.
    Turn the network back on, leave the paywall and open it again: the plans
    load and can be bought.
46. **Links.** On the paywall, Terms and Privacy open
    paceballpro.vercel.app/terms and /privacy. In Settings, Privacy and crash
    reports, "Read the full privacy policy" opens the same policy. Manage
    subscription opens Google Play's subscriptions page.

## Sentry

47. **No start-up warning.** (Development) Launch the dev build with no DSN or
    without consent. Metro's log no longer shows "App Start Span could not
    be finished".
48. **Preview end to end.** (Preview) Follow `docs/sentry-setup.md` section 3
    step by step: reporting starts off; opt in and send the JavaScript test
    and check it arrives symbolicated; run the native crash test, reopen,
    and check the native event; turn reporting off, restart, and check no
    further events arrive. Inspect both events for player names, paths,
    speeds or marks: there must be none.

## Video export

49. **Plays, and is trimmed.** (Development) On the debug screen, export a
    marked clip. It plays in a video player and runs from about one second
    before release to one second after the bounce.
50. **Overlay placement.** (Development) Export a portrait recording and a
    landscape one. On both, the two calibration points, release and bounce
    sit on the same spots as on Mark, the speed and range show top left, and
    "MARK-TO-MARK · NOT TRACKED" sits bottom left. Repeat with the phone held
    in landscape the other way round (rotation 180): if the overlay is
    mirrored, record it against the spike before it ships.
51. **Watermark.** (Development) With the Pro override on Pro, the export has
    no PACEBALL wordmark; on Pro off, it does.
52. **Cancel.** (Development) Start an export and cancel: the partial file is
    gone and another export can start.

## Release build checks

53. **Debug screen is closed.** (Preview) Open `paceball://debug` from a
    browser or `adb shell am start -d paceball://debug`. The app opens on Home,
    not the debug screen.
54. **TalkBack.** (Preview) With TalkBack on, move through Capture, Mark,
    Result and History. Every button is announced as a button, Mark's active
    point chip as selected, and Result's reading as one phrase with "plus or
    minus" and the range.
55. **Touch targets.** (Preview) Tap the edges of Mark's point chips and
    bounce answers, Analysis's speed chips and sound switch, Capture's lens
    chips and History's range chips. Each responds to a tap just above or
    below the drawn chip, and never selects its neighbour.
