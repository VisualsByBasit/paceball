# Share-video bridge handoff (local groundwork)

Basit asked for a Media3 Transformer export of the original MP4, but asked us
not to start the native encoder until he confirms build timing. There is no
video-export button or MP4 output in this branch. The existing still-image
export is unchanged.

`planVideoExport` in `src/export/videoPlan.ts` is the pure request prepared for
that bridge. It takes a saved session, the original MP4's actual duration in
milliseconds, and the current Pro/audio choices. It returns:

- A source path to the original MP4, never the 1280-capped JPEG frames.
- A clip from one second before release to one second after bounce, clamped to
  the source duration. Frame indices use the video's measured FPS. Check the
  resulting timing on a device before shipping; frame/FPS is an approximation.
- `includeAudio: false` by default. The future UI must let the user explicitly
  turn original sound on and clearly show that choice before sharing. For the
  silent default, Media3 should remove the audio track; when on, retain the
  original audio. An in-app muted player alone does not mute an exported MP4.
- `watermark: true` for free users and false only with a current Pro entitlement.
- Video-pixel coordinates for the two calibration marks, release, and bounce;
  the recomputed speed and uncertainty range; and an explicit mark-to-mark
  label. It contains no tracked per-frame ball positions. The future HUD can
  add a distinct trajectory layer only when auto-detection supplies real data.

Guessed or unusable deliveries fail before a video plan is returned, as they do
for the still card. A video with no defensible speed/range must not pretend to
have a measured HUD. The mark-to-mark line must never be styled or labelled as
the ball's tracked path; the reading is average speed to bounce, not a live
instantaneous speed.

Integration split: Basit owns the Analysis playback/audio/share controls and
the HUD design in `app/`. Mustafa owns export preparation in `src/export/`.
`modules/frame-extractor/` is Basit's native boundary, so adding Media3 and a
native export function needs his explicit timing approval and a fresh Android
build. The first native check should prove that a trimmed, silent-by-default MP4
can be exported on a real phone without changing the still-image exporter.
