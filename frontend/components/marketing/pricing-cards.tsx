"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createCheckout } from "@/lib/billing";
import { PRICING_TIERS, type PricingTier } from "@/lib/marketing/content";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

function priceFor(tier: PricingTier, annual: boolean): string {
  if (tier.monthly === null) return "Contact Sales";
  const value = annual ? tier.annualMonthly : tier.monthly;
  return `$${value}`;
}

export function PricingCards() {
  const [annual, setAnnual] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  async function handleCta(tier: PricingTier) {
    if (tier.id === "enterprise") {
      router.push("/contact");
      return;
    }
    if (!isAuthenticated) {
      // Can't create a Stripe subscription for an org that doesn't exist yet.
      router.push(`/register?plan=${tier.id}`);
      return;
    }
    setBusy(tier.id);
    try {
      const { checkout_url } = await createCheckout({ tier: tier.id });
      window.location.href = checkout_url;
    } catch {
      // Stripe not configured (503) or a non-admin — send them to the in-app
      // billing page, which renders the graceful state.
      router.push("/admin/billing");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {/* Blue pill switcher (Cold Precision) */}
      <div className="flex items-center justify-center gap-3">
        <span className={cn("text-sm", !annual ? "text-foreground" : "text-muted-foreground")}>Monthly</span>
        <button
          type="button"
          role="switch"
          aria-checked={annual}
          onClick={() => setAnnual((v) => !v)}
          className={cn(
            "relative h-6 w-11 rounded-full transition-colors",
            annual ? "bg-[#0066FF]" : "bg-[#E2E8F0]",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
              annual ? "translate-x-[22px]" : "translate-x-0.5",
            )}
          />
        </button>
        <span className={cn("text-sm", annual ? "text-foreground" : "text-muted-foreground")}>
          Annual <span className="text-accent">save 20%</span>
        </span>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {PRICING_TIERS.map((tier) => (
          <div
            key={tier.id}
            className={cn(
              "relative flex flex-col overflow-hidden rounded-xl bg-white",
              // Cold Precision: the Pro card is slightly elevated with a solid
              // #0066FF header band; Starter/Enterprise are plain white + border.
              tier.highlight
                ? "border border-[#0066FF]/30 shadow-[0_12px_40px_rgba(0,0,102,0.12)] lg:scale-[1.02]"
                : "border border-[#E2E8F0]",
            )}
          >
            {tier.highlight ? (
              <div className="bg-[#0066FF] px-7 pb-5 pt-6 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl">{tier.name}</h3>
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                    Most popular
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="font-display text-4xl">{priceFor(tier, annual)}</span>
                  {tier.monthly !== null && <span className="text-sm text-white/80">/mo</span>}
                </div>
                <p className="mt-1 h-4 text-xs text-white/70">
                  {tier.monthly !== null && annual ? "billed annually" : " "}
                </p>
              </div>
            ) : (
              <div className="px-7 pb-5 pt-6">
                <h3 className="font-display text-xl text-[#0A0F1E]">{tier.name}</h3>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="font-display text-4xl text-[#0A0F1E]">{priceFor(tier, annual)}</span>
                  {tier.monthly !== null && <span className="text-sm text-muted-foreground">/mo</span>}
                </div>
                <p className="mt-1 h-4 text-xs text-muted-foreground">
                  {tier.monthly !== null && annual ? "billed annually" : " "}
                </p>
              </div>
            )}

            <div className="flex flex-1 flex-col px-7 pb-7">
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{tier.blurb}</p>

              <Button
                className="mt-6"
                variant={tier.highlight ? "default" : "outline"}
                disabled={busy === tier.id}
                onClick={() => handleCta(tier)}
              >
                {busy === tier.id ? "Redirecting…" : tier.cta}
              </Button>

              <ul className="mt-7 space-y-2.5 text-sm">
                {tier.features.map((f) => {
                  const isHeader = f.endsWith(":");
                  return (
                    <li key={f} className={cn("flex gap-2.5", isHeader && "pt-1 text-muted-foreground")}>
                      {!isHeader && <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />}
                      <span className={isHeader ? "text-xs uppercase tracking-wider" : "text-muted-foreground"}>
                        {f}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
