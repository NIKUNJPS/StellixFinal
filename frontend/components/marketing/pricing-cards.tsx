"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";

import { buttonClass } from "@/components/marketing/site";
import { createCheckout } from "@/lib/billing";
import { PRICING_TIERS, type PricingTier } from "@/lib/marketing/content";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

function priceFor(tier: PricingTier, annual: boolean): string {
  if (tier.monthly === null) return "Custom";
  return `$${annual ? tier.annualMonthly : tier.monthly}`;
}

export function PricingCards() {
  const [annual, setAnnual] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

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
      const { checkout_url } = await createCheckout({ tier: tier.id });
      window.location.href = checkout_url;
    } catch {
      router.push("/admin/billing");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-full border border-line bg-paper-raised p-1" role="radiogroup" aria-label="Billing period">
          {[
            { label: "Monthly", value: false },
            { label: "Annual", value: true },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              role="radio"
              aria-checked={annual === opt.value}
              onClick={() => setAnnual(opt.value)}
              className={cn(
                "flex items-center gap-2 rounded-full px-5 py-2 text-[14px] font-semibold transition-colors",
                annual === opt.value ? "bg-ink text-white" : "text-ink-2 hover:text-ink",
              )}
            >
              {opt.label}
              {opt.value && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-code text-[10.5px]",
                    annual ? "bg-signal text-ink" : "bg-signal-tint text-signal-text",
                  )}
                >
                  −20%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-12 grid gap-5 lg:grid-cols-3 lg:items-stretch">
        {PRICING_TIERS.map((tier) => {
          const pro = tier.highlight;
          return (
            <div
              key={tier.id}
              className={cn(
                "relative flex flex-col rounded-3xl border p-7 sm:p-8",
                pro
                  ? "border-ink bg-ink-night text-white shadow-[0_40px_80px_-40px_rgba(75,63,209,0.6)]"
                  : "border-line bg-paper-raised",
              )}
            >
              {pro && (
                <span className="absolute -top-3 left-8 rounded-full bg-signal px-3 py-1 font-code text-[11px] font-semibold text-ink">
                  Most popular
                </span>
              )}
              <h3 className={cn("text-[20px] font-semibold", pro ? "text-white" : "text-ink")}>{tier.name}</h3>
              <p className={cn("mt-2 min-h-[48px] text-[14.5px] leading-relaxed", pro ? "text-white/75" : "text-ink-2")}>{tier.blurb}</p>

              <div className="mt-7 flex items-end gap-2">
                <span className={cn("font-editorial text-[56px] leading-none", pro ? "text-white" : "text-ink")}>{priceFor(tier, annual)}</span>
                {tier.monthly !== null && (
                  <span className={cn("pb-2 text-[14px]", pro ? "text-white/70" : "text-ink-3")}>/ month</span>
                )}
              </div>
              <p className={cn("mt-2 h-5 text-[13px]", pro ? "text-white/65" : "text-ink-3")}>
                {tier.monthly === null ? "Annual contract, tailored deployment" : annual ? "Billed annually" : "Billed monthly, cancel anytime"}
              </p>

              <button
                type="button"
                disabled={busy === tier.id}
                onClick={() => handleCta(tier)}
                className={cn(buttonClass(pro ? "light" : tier.id === "enterprise" ? "secondary" : "primary", "lg"), "mt-7 w-full")}
              >
                {busy === tier.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Redirecting…
                  </>
                ) : (
                  <>
                    {tier.cta}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>

              <ul className={cn("mt-8 space-y-3 border-t pt-7", pro ? "border-white/10" : "border-line")}>
                {tier.features.map((f) => {
                  const header = f.endsWith(":");
                  return (
                    <li key={f} className={cn("flex items-start gap-3 text-[14.5px]", pro ? "text-white/90" : "text-ink")}>
                      {header ? (
                        <span className={cn("font-semibold", pro ? "text-white" : "text-ink")}>{f}</span>
                      ) : (
                        <>
                          <span
                            className={cn(
                              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                              pro ? "bg-white/10 text-brand-bright" : "bg-brand-tint text-brand",
                            )}
                          >
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                          {f}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
