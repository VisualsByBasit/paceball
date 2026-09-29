"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/site";

export function NavLinks() {
  const pathname = usePathname();
  return (
    <ul className="flex items-center gap-1 sm:gap-2">
      {NAV.map(({ href, label }) => {
        const current = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              className={`inline-flex min-h-target items-center rounded-sm px-2 text-body transition-colors hover:text-text ${
                current ? "text-text" : "text-muted"
              }`}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
