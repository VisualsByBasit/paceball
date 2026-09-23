import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { FALLBACK_ICON_SRC, HAS_LOGO, LOGO_SIZE, LOGO_SRC } from "@/lib/logo";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME}: cricket bowling speed, with its error range`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // The logo when it is there; the generated mark only if it is missing.
  icons: HAS_LOGO
    ? {
        icon: [{ url: LOGO_SRC, type: "image/png", sizes: `${LOGO_SIZE}x${LOGO_SIZE}` }],
        apple: [{ url: LOGO_SRC, type: "image/png", sizes: `${LOGO_SIZE}x${LOGO_SIZE}` }],
      }
    : { icon: [{ url: FALLBACK_ICON_SRC, type: "image/svg+xml" }] },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "A cricket speed gun that tells you when it doesn't know",
    description: SITE_DESCRIPTION,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    site: "@paceballpro",
    title: "A cricket speed gun that tells you when it doesn't know",
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0B0D",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#main"
          className="sr-only rounded-md bg-accent px-3 py-2 font-medium text-bg focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10"
        >
          Skip to content
        </a>
        <Header />
        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
