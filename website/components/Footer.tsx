import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          <li>
            <Link href="/privacy" className="hover:text-text">
              Privacy
            </Link>
          </li>
          <li>
            <Link href="/terms" className="hover:text-text">
              Terms
            </Link>
          </li>
          <li>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-text">
              Contact
            </a>
          </li>
        </ul>
        <p>Built for RevenueCat Shipaton 2026</p>
      </div>
    </footer>
  );
}
