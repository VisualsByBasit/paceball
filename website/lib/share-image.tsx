import { ImageResponse } from "next/og";
import { logoDataUrl } from "./logo";

export const SHARE_IMAGE_ALT = "Paceball logo, with the line: a cricket speed gun that tells you when it doesn't know";
export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 };

/**
 * Text card for link previews, used for both Open Graph and Twitter. The logo
 * and the claim. No screenshot, no numbers.
 */
export function renderShareImage() {
  const logo = logoDataUrl();
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
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" width={96} height={96} style={{ width: 96, height: 96, borderRadius: 16 }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: 18, background: "#D4FF3F" }} />
          )}
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
    SHARE_IMAGE_SIZE,
  );
}
