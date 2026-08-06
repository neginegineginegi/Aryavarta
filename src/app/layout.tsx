import type { Metadata } from "next";
import { Inter_Tight, Space_Mono, Tiro_Devanagari_Sanskrit } from "next/font/google";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";

import "./globals.css";

// Inter Tight: a grotesque with a slightly narrow set width, used site-wide.
// Headlines run at light weights and large sizes; body text at 400. Loading
// the full weight range keeps the 200-weight display headings crisp.
const sans = Inter_Tight({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600"],
});

// Space Mono carries the technical-manual register: section labels, table
// headers, nav, and numeric readouts. Body prose stays in Garamond.
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
      className={`${sans.variable} ${spaceMono.variable} ${tiroDevanagari.variable}`}
    >
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
