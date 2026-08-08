import type { Metadata } from "next";
import {
  IBM_Plex_Mono,
  Instrument_Sans,
  Newsreader,
  Tiro_Devanagari_Hindi,
} from "next/font/google";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";

import "./globals.css";
import { AutoLetters } from "@/components/ui/AutoLetters";

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
    card: "summary",
  },
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
      <body className="min-h-screen flex flex-col">
        <Header />
        <AutoLetters />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
