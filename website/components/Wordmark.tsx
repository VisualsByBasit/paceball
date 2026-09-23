import Image from "next/image";
import { HAS_LOGO, LOGO_SRC } from "@/lib/logo";

type Props = { size?: "sm" | "lg" };

/**
 * The logo, then the name. The name is always written out beside it, so the
 * image is decorative (empty alt) and a screen reader reads "Paceball" once.
 */
export function Wordmark({ size = "sm" }: Props) {
  const large = size === "lg";
  const px = large ? 44 : 28;
  return (
    <span className="inline-flex items-center gap-2.5">
      {HAS_LOGO ? (
        <Image
          src={LOGO_SRC}
          alt=""
          width={px}
          height={px}
          priority={large}
          className="shrink-0 rounded-md object-contain"
          style={{ width: px, height: px }}
        />
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" style={{ width: px, height: px }}>
          <path d="M2 18 H9 L14 8 H22" fill="none" stroke="var(--color-line)" strokeWidth="2" />
          <circle cx="14" cy="8" r="4" fill="var(--color-accent)" />
        </svg>
      )}
      <span
        className={`font-mono font-semibold uppercase tracking-[0.2em] ${large ? "text-2xl sm:text-3xl" : "text-sm"}`}
      >
        Paceball
      </span>
    </span>
  );
}
