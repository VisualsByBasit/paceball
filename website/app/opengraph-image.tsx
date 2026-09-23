import { ImageResponse } from "next/og";

export const alt = "Paceball: a cricket speed gun that tells you when it doesn't know";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Text card for link previews. No screenshot, no numbers: only the claim. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#0A0B0D",
          backgroundImage: "radial-gradient(#1F232A 2px, transparent 2px)",
          backgroundSize: "28px 28px",
          color: "#FFFFFF",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: "#D4FF3F" }} />
          <div style={{ fontSize: 36, letterSpacing: 8, fontWeight: 700 }}>PACEBALL</div>
        </div>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1, maxWidth: 960 }}>
          A cricket speed gun that tells you when it doesn&apos;t know
        </div>
        <div style={{ fontSize: 28, color: "#8A9099" }}>
          Average speed to bounce, with its error range. Android.
        </div>
      </div>
    ),
    size,
  );
}
