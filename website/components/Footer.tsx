import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-body text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <ul className="flex flex-wrap gap-x-6">
          <li>
            <Link href="/privacy" className="inline-flex min-h-target items-center hover:text-text">
              Privacy
            </Link>
          </li>
          <li>
            <Link href="/terms" className="inline-flex min-h-target items-center hover:text-text">
              Terms
            </Link>
          </li>
          <li>
            <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex min-h-target items-center hover:text-text">
              Contact
            </a>
          </li>
        </ul>
        <p className="text-caption">Built for RevenueCat Shipaton 2026</p>
      </div>
    </footer>
  );
}
