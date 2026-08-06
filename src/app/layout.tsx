import type { Metadata } from "next";
import {
  Inter_Tight,
  Source_Serif_4,
  Space_Mono,
  Tiro_Devanagari_Sanskrit,
} from "next/font/google";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";

import "./globals.css";

// Three voices, each with a strict job.
//
// Source Serif 4 is the EDITORIAL voice: headlines and narrative prose. Drawn
// for screen reading with real optical sizing, so it holds authority at
// display sizes without the delicacy of a Garamond revival.
const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

// Inter Tight is the DATA voice: tables, figures, controls, legends, nav.
// Neutral and narrow enough to keep dense result tables scannable.
const sans = Inter_Tight({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Space Mono is the SYSTEM voice: curatorial eyebrows, column headers, year
// readouts, axis ticks, citation markers. It marks machine-generated or
// meta information and is never used decoratively.
const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

// Tiro Devanagari Sanskrit: used only for the अभिलेखः wordmark. A scholarly
// Devanagari serif drawn for Sanskrit, so the visarga and matras sit right.
const tiroDevanagari = Tiro_Devanagari_Sanskrit({
  variable: "--font-tiro-devanagari",
  weight: "400",
  subsets: ["devanagari", "latin"],
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
      className={`${serif.variable} ${sans.variable} ${spaceMono.variable} ${tiroDevanagari.variable}`}
    >
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
