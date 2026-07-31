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
    default: "Stellix Labs — The Institutional Memory Layer for Quant Research",
    template: "%s · Stellix Labs",
  },
  description:
    "The only quant research platform that records why every strategy failed, in which market regime, and compounds that memory so your team never rediscovers the same dead end twice.",
  icons: {
    icon: "/logo-mark.png",
    apple: "/logo-mark.png",
  },
  openGraph: {
    type: "website",
    siteName: "Stellix Labs",
    title: "Your failed strategies are your most valuable research. Stellix Labs remembers them.",
    description:
      "Regime-conditioned. Failure-aware. Compounding over time. The institutional memory layer for quantitative research.",
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
