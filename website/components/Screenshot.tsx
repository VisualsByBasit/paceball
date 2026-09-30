import Image from "next/image";
import type { Screen } from "@/lib/screens";

type Props = {
  screen: Screen;
  caption?: string;
  eager?: boolean;
  className?: string;
};

/** One screenshot in a flat frame: a hairline edge, the large radius, no shadow. */
export function Screenshot({ screen, caption = screen.caption, eager = false, className = "" }: Props) {
  return (
    <figure className={className}>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <Image
          src={screen.src}
          alt={screen.alt}
          width={screen.width}
          height={screen.height}
          // Already resized and compressed WebP: served as it is, never re-encoded.
          unoptimized
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : undefined}
          className="block h-auto w-full"
        />
      </div>
      {caption ? <figcaption className="mt-2 text-center text-caption text-muted">{caption}</figcaption> : null}
    </figure>
  );
}
