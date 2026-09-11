"use client";

/**
 * ConditionalMarketingNav — renders the sticky MarketingNav on all marketing
 * pages EXCEPT the home page ("/"), where the hero card provides its own
 * internal navigation.
 */

import { usePathname } from "next/navigation";
import { MarketingNav } from "@/components/marketing/marketing-nav";

export function ConditionalMarketingNav() {
  const pathname = usePathname();
  // Hide the external sticky nav on the landing page — the hero card has its own.
  if (pathname === "/") return null;
  return <MarketingNav />;
}
