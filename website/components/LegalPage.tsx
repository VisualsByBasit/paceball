import type { ReactNode } from "react";

type Props = { title: string; updated: string; children: ReactNode };

/** Shared frame for the privacy policy and the terms: plain, readable, one column. */
export function LegalPage({ title, updated, children }: Props) {
  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 font-mono text-sm text-muted">Last updated {updated}</p>
      <div className="mt-10 space-y-10 leading-relaxed text-text/90 [&_a]:text-text [&_a]:underline [&_a]:decoration-muted [&_a:hover]:decoration-accent [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-text [&_li]:mt-2 [&_p+p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </article>
  );
}
