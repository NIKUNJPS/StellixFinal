import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Inter } from "next/font/google";

import { Providers } from "@/app/providers";
import "@/app/globals.css";

// Inter for body/UI (locked stack), Fraunces as the semi-serif display face for
// major headlines — the institutional-gravitas tell that separates this from a
// generic all-sans SaaS site. Self-hosted via next/font (no layout shift, good
// Lighthouse). Exposed as CSS vars; Fraunces is applied only via `.font-display`.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Stellix Labs — Research that remembers why it failed",
    template: "%s · Stellix Labs",
  },
  description:
    "Stellix Labs records a permanent autopsy for every quant strategy that breaks — the market regime, the trigger, the features responsible — and compounds it into a research memory your whole desk can query.",
  icons: {
    icon: "/logo-mark.png",
    apple: "/logo-mark.png",
  },
  openGraph: {
    type: "website",
    siteName: "Stellix Labs",
    title: "Research that remembers why it failed — Stellix Labs",
    description:
      "The institutional memory layer for quantitative research. Regime-conditioned, failure-aware, and compounding with every strategy you test.",
    images: ["/logo.png"],
  },
  twitter: { card: "summary_large_image", images: ["/logo.png"] },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
