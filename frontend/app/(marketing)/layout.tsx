import type { ReactNode } from "react";
import { Instrument_Serif, JetBrains_Mono } from "next/font/google";

import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";

// Cold Precision display face — editorial serif, loaded only for the public site.
// Instrument Serif ships a single 400 weight; headlines rely on size, not weight.
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

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    // `.marketing` scopes the Cold Precision CSS variables (globals.css) — the
    // dashboard outside this wrapper keeps the navy/cyan theme untouched.
    <div
      className={`marketing ${instrumentSerif.variable} ${jetbrainsMono.variable} flex min-h-screen flex-col bg-white text-[#0A0F1E] antialiased`}
    >
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
