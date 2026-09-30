import Image from "next/image";
import { HAS_LOGO, LOGO_SRC } from "@/lib/logo";

type Props = { size?: "sm" | "lg" };

/** The traced wordmark, copied from the app's assets/brand/wordmark.png. */
export const WORDMARK_SRC = "/wordmark.png";
const WORDMARK_RATIO = 1326 / 156;

/**
 * The logo, then the name as the logo's own traced wordmark, never a system
 * font. The logo is decorative (empty alt); the wordmark carries "Paceball",
 * so a screen reader reads the name once. The small header size drops the
 * wordmark on the narrowest phones, where the header link's own label names it.
 */
export function Wordmark({ size = "sm" }: Props) {
  const large = size === "lg";
  const px = large ? 48 : 28;
  const wordHeight = large ? 40 : 16;
  return (
    <span className={`inline-flex items-center ${large ? "gap-4" : "gap-2"}`}>
      {HAS_LOGO ? (
        <Image
          src={LOGO_SRC}
          alt=""
          width={px}
          height={px}
          preload={large}
          className="shrink-0 rounded-sm object-contain"
          style={{ width: px, height: px }}
        />
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" style={{ width: px, height: px }}>
          <path d="M2 18 H9 L14 8 H22" fill="none" stroke="var(--color-line)" strokeWidth="2" />
          <circle cx="14" cy="8" r="4" fill="var(--color-accent)" />
        </svg>
      )}
      <Image
        src={WORDMARK_SRC}
        alt="Paceball"
        width={Math.round(wordHeight * WORDMARK_RATIO)}
        height={wordHeight}
        preload={large}
        unoptimized
        className={large ? "h-7 w-auto sm:h-10" : "hidden h-4 w-auto min-[400px]:block"}
      />
    </span>
  );
}
