"use client";

import { useReducedMotion } from "framer-motion";

import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

import { HeroSection } from "@/components/marketing/hero-section";
import { TurningPoint } from "@/components/marketing/TurningPoint";
import { Platform } from "@/components/marketing/platform";
import { Problem } from "@/components/marketing/problem";
import { Pillars } from "@/components/marketing/pillars";
import { Loop } from "@/components/marketing/loop";
import { Audience } from "@/components/marketing/audience";
import { CTA } from "@/components/marketing/cta";

export default function LandingPage() {
  const reduced = useReducedMotion();

  return (
    <>
      {/* NAVBAR */}
      <MarketingNav />

      {/* HERO */}
      <HeroSection />

      {/* PROBLEM */}
      <Problem />

      {/* TURNING POINT */}
      <TurningPoint />

      {/* THREE PILLARS */}
      <Pillars />

      {/* PLATFORM */}
      <Platform />

      {/* INTELLIGENCE LOOP */}
      <Loop />

      {/* WHO IT'S FOR */}
      <Audience />

      {/* CTA */}
      <CTA />

      {/* FOOTER */}
      <MarketingFooter />
    </>
  );
}