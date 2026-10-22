import type { ReactNode } from "react";

import { siteFontClasses } from "@/app/fonts";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";

/**
 * Public site shell — light "paper & ink" theme (see `.light-site` in
 * globals.css). The authenticated dashboard keeps the dark theme.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`light-site light-site-root ${siteFontClasses} flex min-h-screen flex-col font-ui antialiased`}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <MarketingNav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
