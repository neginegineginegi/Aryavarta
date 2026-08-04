import type { Metadata } from "next";
import { EB_Garamond } from "next/font/google";

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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Abhilekh · India Politics Archive",
    template: "%s · Abhilekh",
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
    <html lang="en">
      <body className={`${garamond.variable} min-h-screen flex flex-col`}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
