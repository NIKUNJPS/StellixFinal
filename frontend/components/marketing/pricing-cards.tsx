"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createCheckout } from "@/lib/billing";
import {
  PRICING_TIERS,
  type PricingTier,
} from "@/lib/marketing/content";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

function priceFor(tier: PricingTier, annual: boolean): string {
  if (tier.monthly === null) return "Custom";

  const value = annual ? tier.annualMonthly : tier.monthly;

  return `$${value}`;
}

export function PricingCards() {
  const [annual, setAnnual] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const router = useRouter();

  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated,
  );

  async function handleCta(tier: PricingTier) {
    if (tier.id === "enterprise") {
      router.push("/contact");
      return;
    }

    if (!isAuthenticated) {
      router.push(`/register?plan=${tier.id}`);
      return;
    }

    setBusy(tier.id);

    try {
      const { checkout_url } = await createCheckout({
        tier: tier.id,
      });

      window.location.href = checkout_url;
    } catch {
      router.push("/admin/billing");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {/* ================= BILLING SWITCH ================= */}

      <div className="flex items-center justify-center gap-4">
        <span
          className={cn(
            "text-[14px] font-medium transition-colors",
            !annual ? "text-white" : "text-white/40",
          )}
        >
          Monthly
        </span>

        <button
          type="button"
          role="switch"
          aria-checked={annual}
          onClick={() => setAnnual((value) => !value)}
          className={cn(
            "relative h-7 w-[52px] rounded-full border transition-all duration-300",
            annual
              ? "border-[#FBCF4F]/50 bg-[#FBCF4F]/20"
              : "border-white/[0.12] bg-white/[0.06]",
          )}
        >
          <span
            className={cn(
              "absolute top-[3px] h-5 w-5 rounded-full transition-all duration-300",
              annual
                ? "translate-x-[26px] bg-[#FBCF4F]"
                : "translate-x-[3px] bg-white/80",
            )}
          />
        </button>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-[14px] font-medium transition-colors",
              annual ? "text-white" : "text-white/40",
            )}
          >
            Annual
          </span>

          <span className="rounded-full border border-[#FBCF4F]/20 bg-[#FBCF4F]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#FBCF4F]">
            Save 20%
          </span>
        </div>
      </div>

      {/* ================= PRICING CARDS ================= */}

      <div className="mt-16 grid gap-6 lg:grid-cols-3 lg:items-stretch">
        {PRICING_TIERS.map((tier) => {
          const isEnterprise = tier.id === "enterprise";
          const isPro = tier.highlight;

          return (
            <div
              key={tier.id}
              className={cn(
                "group relative flex min-h-[620px] flex-col overflow-hidden transition-all duration-500",

                isEnterprise
                  ? [
                      "border border-[#FBCF4F]/45",
                      "bg-gradient-to-b from-[#FBCF4F]/[0.08] via-[#0D0D13] to-[#09090F]",
                      "shadow-[0_0_100px_rgba(251,207,79,0.08)]",
                      "lg:-translate-y-4",
                    ]
                  : isPro
                    ? [
                        "border border-[#8B7CFF]/30",
                        "bg-[#0D0D13]",
                        "lg:translate-y-2",
                      ]
                    : [
                        "border border-white/[0.1]",
                        "bg-[#0B0B11]",
                        "lg:translate-y-5",
                      ],
              )}
            >
              {/* ENTERPRISE GLOW */}

              {isEnterprise && (
                <>
                  <div className="pointer-events-none absolute left-1/2 top-0 h-[280px] w-[280px] -translate-x-1/2 rounded-full bg-[#FBCF4F]/10 blur-[100px]" />

                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FBCF4F] to-transparent" />
                </>
              )}

              {/* PRO TOP LINE */}

              {isPro && (
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8B7CFF] to-transparent" />
              )}

              {/* HEADER */}

              <div className="relative px-8 pb-7 pt-9">
                <div className="flex min-h-[30px] items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isEnterprise && (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#FBCF4F]/30 bg-[#FBCF4F]/10">
                        <Sparkles className="h-4 w-4 text-[#FBCF4F]" />
                      </div>
                    )}

                    <h3
                      className={cn(
                        "text-[26px] font-semibold tracking-[-0.04em]",
                        isEnterprise
                          ? "text-[#FBCF4F]"
                          : isPro
                            ? "text-[#A79CFF]"
                            : "text-white",
                      )}
                    >
                      {tier.name}
                    </h3>
                  </div>

                  {isEnterprise && (
                    <span className="rounded-full border border-[#FBCF4F]/30 bg-[#FBCF4F]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FBCF4F]">
                      Institutional
                    </span>
                  )}

                  {isPro && !isEnterprise && (
                    <span className="rounded-full border border-[#8B7CFF]/30 bg-[#8B7CFF]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A79CFF]">
                      Popular
                    </span>
                  )}
                </div>

                {/* Price */}

                <div className="mt-8 flex items-end gap-2">
                  <span
                    className={cn(
                      "text-[48px] font-semibold leading-none tracking-[-0.055em]",
                      isEnterprise ? "text-white" : "text-white",
                    )}
                  >
                    {priceFor(tier, annual)}
                  </span>

                  {tier.monthly !== null && (
                    <span className="mb-1 text-[14px] text-white/45">
                      /month
                    </span>
                  )}
                </div>

                <p
                  className={cn(
                    "mt-3 min-h-[20px] text-[12px]",
                    isEnterprise
                      ? "text-[#FBCF4F]/70"
                      : "text-white/40",
                  )}
                >
                  {tier.monthly === null
                    ? "Built around your organization."
                    : annual
                      ? "Billed annually."
                      : "Flexible monthly billing."}
                </p>
              </div>

              {/* Divider */}

              <div
                className={cn(
                  "mx-8 h-px",
                  isEnterprise
                    ? "bg-[#FBCF4F]/20"
                    : isPro
                      ? "bg-[#8B7CFF]/20"
                      : "bg-white/[0.08]",
                )}
              />

              {/* CONTENT */}

              <div className="relative flex flex-1 flex-col px-8 pb-8 pt-8">
                <p className="min-h-[72px] text-[15px] leading-[1.75] text-white/60">
                  {tier.blurb}
                </p>

                {/* CTA */}

                <Button
                  disabled={busy === tier.id}
                  onClick={() => handleCta(tier)}
                  className={cn(
                    "mt-8 h-12 w-full text-[14px] font-semibold transition-all duration-300",

                    isEnterprise &&
                      "bg-[#FBCF4F] text-[#09090F] hover:bg-[#FFE28A] hover:shadow-[0_0_35px_rgba(251,207,79,0.22)]",

                    isPro &&
                      "border border-[#8B7CFF]/40 bg-[#8B7CFF]/15 text-white hover:bg-[#8B7CFF]/25",

                    !isEnterprise &&
                      !isPro &&
                      "border border-white/[0.14] bg-white/[0.04] text-white hover:bg-white/[0.08]",
                  )}
                >
                  {busy === tier.id ? (
                    "Redirecting..."
                  ) : (
                    <>
                      {tier.cta}

                      {isEnterprise && (
                        <ArrowRight className="ml-2 h-4 w-4" />
                      )}
                    </>
                  )}
                </Button>

                {/* FEATURES */}

                <div className="mt-9">
                  <p
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-[0.2em]",
                      isEnterprise
                        ? "text-[#FBCF4F]/80"
                        : "text-white/35",
                    )}
                  >
                    What&apos;s included
                  </p>

                  <ul className="mt-5 space-y-4">
                    {tier.features.map((feature) => {
                      const isHeader = feature.endsWith(":");

                      if (isHeader) {
                        return (
                          <li
                            key={feature}
                            className="pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35"
                          >
                            {feature}
                          </li>
                        );
                      }

                      return (
                        <li
                          key={feature}
                          className="flex items-start gap-3"
                        >
                          <Check
                            className={cn(
                              "mt-[2px] h-4 w-4 shrink-0",
                              isEnterprise
                                ? "text-[#FBCF4F]"
                                : isPro
                                  ? "text-[#A79CFF]"
                                  : "text-white/55",
                            )}
                          />

                          <span className="text-[14px] leading-relaxed text-white/65">
                            {feature}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Enterprise bottom message */}

                {isEnterprise && (
                  <div className="mt-auto pt-10">
                    <div className="border-t border-[#FBCF4F]/15 pt-6">
                      <p className="text-[13px] leading-relaxed text-white/45">
                        For firms building research infrastructure that compounds
                        across desks, teams, and market cycles.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Enterprise callout */}

      <div className="relative mt-12 overflow-hidden border border-[#FBCF4F]/20 bg-[#FBCF4F]/[0.035] px-6 py-7 sm:px-10">
        <div className="pointer-events-none absolute left-0 top-0 h-full w-[300px] bg-[#FBCF4F]/[0.04] blur-[80px]" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#FBCF4F]">
              Enterprise Research Infrastructure
            </p>

            <p className="mt-2 text-[16px] text-white/70">
              Need governance, institutional memory, and infrastructure designed
              around your organization?
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/contact")}
            className="inline-flex shrink-0 items-center gap-2 text-[14px] font-semibold text-[#FBCF4F] transition-colors hover:text-white"
          >
            Talk to Enterprise
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}