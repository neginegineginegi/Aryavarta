import type { Metadata } from "next";
import { EB_Garamond, Space_Mono, Tiro_Devanagari_Sanskrit } from "next/font/google";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";

import "./globals.css";

// EB Garamond: the open-source relative of Sabon (both are Garamond
// revivals) — set site-wide for a book-like reading experience.
// To use licensed Sabon instead: place the purchased .woff2 files under
// src/fonts/ and swap this for next/font/local — ask Claude to wire it.
const garamond = EB_Garamond({
  variable: "--font-garamond",
  subsets: ["latin"],
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
      className={`${garamond.variable} ${spaceMono.variable} ${tiroDevanagari.variable}`}
    >
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
