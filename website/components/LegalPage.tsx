import type { ReactNode } from "react";

type Props = { title: string; updated: string; children: ReactNode };

/** Shared frame for the privacy policy and the terms: plain, readable, one column. */
export function LegalPage({ title, updated, children }: Props) {
  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-24">
      <h1 className="text-h1 sm:text-reading">{title}</h1>
      <p className="mt-2 font-mono text-caption text-muted">Last updated {updated}</p>
      <div className="mt-12 space-y-12 text-body text-text/90 [&_a]:text-text [&_a]:underline [&_a]:decoration-muted [&_a:hover]:decoration-accent [&_a]:underline-offset-4 [&_h2]:mb-4 [&_h2]:text-h2 [&_h2]:text-text [&_li]:mt-2 [&_p+p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </div>
    </article>
  );
}
