import type { Metadata, Viewport } from "next";
import {
  IBM_Plex_Mono,
  Instrument_Sans,
  Newsreader,
  Tiro_Devanagari_Hindi,
} from "next/font/google";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";

import "./globals.css";

// Four voices, each with a strict job.
//
// Newsreader is the EDITORIAL voice: headlines, the big statistics, card
// titles and the About drop cap. Set light (300) at display sizes.
const newsreader = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

// Instrument Sans is the BODY voice: prose, controls, tables and legends.
const instrument = Instrument_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// IBM Plex Mono is the SYSTEM voice: badges, micro-labels, the audit log,
// year readouts and footer meta. Always small and widely letterspaced, and
// never used decoratively.
const plexMono = IBM_Plex_Mono({
  variable: "--font-mono-ui",
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
});

// Tiro Devanagari Hindi: the अभिलेखः wordmark only.
const tiroDevanagari = Tiro_Devanagari_Hindi({
  variable: "--font-tiro-devanagari",
  weight: "400",
  subsets: ["devanagari", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "अभिलेखः · Indian Political Archive",
    template: "%s · अभिलेखः",
  },
  description:
    "A public, sourced, year-by-year reference of the political history of every Indian state and union territory: chief ministers, elections, and governance events, with citations and full edit history.",
  openGraph: {
    siteName: "Abhilekh",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    // The large card, not the small square one. Every share of this site is a
    // link to a record, and the square thumbnail crops the card down to the
    // wordmark with no room for the state, year or name that makes the link
    // worth opening.
    card: "summary_large_image",
  },
};

// Next writes a `width=device-width, initial-scale=1` viewport tag on its own,
// which is why there was no export here. `viewportFit` is the one field it
// cannot infer, and without it a notched phone letterboxes the page: iOS insets
// the whole document to the safe area, leaving bands of background beside the
// masthead in landscape and under the tricolor at the top.
//
// `cover` hands the layout the full screen and the responsibility that comes
// with it. Everything that touches an edge now reads `env(safe-area-inset-*)`
// itself: the masthead (top and sides), the mobile nav panel (sides and
// bottom) and the footer (bottom, for the home indicator).
//
// No `maximumScale` or `userScalable: false`. Pinch-zoom is how a lot of people
// read an archive on a phone, and taking it away is a WCAG 1.4.4 failure.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Font variables must live on <html>: the base font-family rule in
    // globals.css is declared there and CSS variables don't resolve upward.
    <html
      lang="en"
      className={`${newsreader.variable} ${instrument.variable} ${plexMono.variable} ${tiroDevanagari.variable}`}
    >
      {/* dvh, not vh: on iOS Safari `100vh` is the LARGE viewport, the height
          the page would have if the toolbars were hidden. With the toolbars
          showing, which is how a page first loads, a `min-h-screen` body is
          taller than the screen and every short page gains a scrollbar it has
          no content for. */}
      <body className="min-h-dvh flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
