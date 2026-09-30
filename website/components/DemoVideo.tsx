import { DEMO_VIDEO_EMBED_URL } from "@/lib/site";

/**
 * The demo video, 16:9. Until DEMO_VIDEO_EMBED_URL is set it is an honest
 * placeholder frame, never a player that does nothing.
 */
export function DemoVideo() {
  const url = DEMO_VIDEO_EMBED_URL.trim();
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border border-line bg-surface">
      {url ? (
        <iframe
          src={url}
          title="Paceball demo video"
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="h-full w-full"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-control"
          >
            <svg viewBox="0 0 24 24" className="ml-1 h-4 w-4" fill="var(--color-muted)">
              <path d="M6 4 L20 12 L6 20 Z" />
            </svg>
          </span>
          <p className="text-body text-muted">Demo video coming soon</p>
        </div>
      )}
    </div>
  );
}
