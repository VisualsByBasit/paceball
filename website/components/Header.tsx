import Link from "next/link";
import { NavLinks } from "./NavLinks";
import { Wordmark } from "./Wordmark";

export function Header() {
  return (
    <header className="border-b border-line">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2 sm:px-6"
      >
        <Link href="/" aria-label="Paceball home" className="inline-flex min-h-target items-center rounded-sm">
          <Wordmark />
        </Link>
        <NavLinks />
      </nav>
    </header>
  );
}
