import type { ReactNode } from "react";
import { Figtree, Instrument_Serif, JetBrains_Mono } from "next/font/google";

import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { ConditionalMarketingNav } from "@/components/marketing/conditional-marketing-nav";

// Cold Precision display face — editorial serif, loaded only for the public site.
const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
});

// Monospace for the real code/schema artifacts (Cypher, DSL JSON, SQL).
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

// Primary sans-serif font for marketing content.
const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`marketing ${instrumentSerif.variable} ${jetbrainsMono.variable} ${figtree.variable} flex min-h-screen flex-col bg-white text-[#0A0F1E] antialiased`}
    >
      <ConditionalMarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}