import fs from "node:fs";
import path from "node:path";

/**
 * The logo, public/logo.png: square, 512 by 512, green on black. Checked at
 * build time. If it is missing, the header, the favicon and the share images
 * fall back to the generated mark (public/icon-fallback.svg) instead of a
 * broken image.
 */
export const LOGO_SRC = "/logo.png";
export const LOGO_SIZE = 512;
export const LOGO_FILE = path.join(process.cwd(), "public", "logo.png");
export const HAS_LOGO = fs.existsSync(LOGO_FILE);
export const FALLBACK_ICON_SRC = "/icon-fallback.svg";

/** The logo as a data URL, for images rendered at build time. Null if missing. */
export function logoDataUrl(): string | null {
  if (!HAS_LOGO) return null;
  return `data:image/png;base64,${fs.readFileSync(LOGO_FILE).toString("base64")}`;
}
