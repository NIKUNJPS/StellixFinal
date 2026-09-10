"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CritiquePanel } from "@/components/llm/critique-panel";
import { RuleBuilder } from "@/components/strategy/rule-builder";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackLink } from "@/components/layout/back-link";
import { createStrategy, toDSL } from "@/lib/strategy";
import type { RiskConstraints, RuleGroup } from "@/lib/strategy-types";

const STEPS = ["Basic Info", "Signal Parameters", "Risk Constraints", "Review & Submit"];

export function NewStrategyView({ basePath = "/admin" }: { basePath?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);

  const [name, setName] = useState("Mean Reversion RSI");
  const [description, setDescription] = useState("Buy oversold, exit overbought.");
  const [entryRule, setEntryRule] = useState<RuleGroup>({
    operator: "AND",
    conditions: [{ indicator: "rsi_14", comparator: "<", value: 30 }],
  });
  const [exitRule, setExitRule] = useState<RuleGroup>({
    operator: "AND",
    conditions: [{ indicator: "rsi_14", comparator: ">", value: 70 }],
  });
  const [risk, setRisk] = useState<RiskConstraints>({
    max_drawdown_pct: 20,
    max_position_size_pct: 10,
    stop_loss_pct: 5,
  });

  const dslPreview = {
    entry_rules: toDSL(entryRule),
    exit_rules: toDSL(exitRule),
    risk_constraints: risk,
  };

  async function ensureDraftCreated(): Promise<string> {
    if (draftId) return draftId;
    const created = await createStrategy({
      name,
      description,
      entry_rules: toDSL(entryRule),
      exit_rules: toDSL(exitRule),
      risk_constraints: risk,
    });
    setDraftId(created.id);
    return created.id;
  }

  async function onCreate() {
    setError(null);
    setSaving(true);
    try {
      const id = await ensureDraftCreated();
      router.push(`${basePath}/strategies?created=${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create strategy");
      setSaving(false);
    }
  }

  async function onGetCritique(): Promise<string | null> {
    setError(null);
    try {
      return await ensureDraftCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create draft for critique");
      return null;
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl text-[#9A9DA8]">
      <BackLink href={`${basePath}/strategies`} label="Back to strategies" />

      <Card
        className="rounded-2xl p-2 shadow-2xl backdrop-blur-xl transition-all duration-200"
        style={{
          backgroundColor: "rgba(15, 17, 21, 0.65)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow:
            "0 24px 70px -15px rgba(0, 0, 0, 0.8), inset 0 0 0 1px rgba(255, 255, 255, 0.04)",
        }}
      >
        <CardHeader className="border-b border-white/[0.06] pb-4">
          <CardTitle className="text-xl font-bold tracking-tight text-[#F5F5F7]">
            Strategy Builder
          </CardTitle>

          <CardDescription className="text-xs text-[#9A9DA8]">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </CardDescription>

          <div className="mt-3 flex gap-2">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className="h-1 flex-1 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: i <= step ? "#5C568E" : "rgba(255, 255, 255, 0.08)",
                  boxShadow: i <= step ? "0 0 8px rgba(92, 86, 142, 0.6)" : "none",
                }}
              />
            ))}
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-6 pt-6">
          {step === 0 && (
            <div
              className="flex flex-col gap-4"
              data-testid="step-basic"
            >
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-semibold text-[#F5F5F7]">
                  Name
                </Label>

                <Input
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 rounded-xl text-sm text-[#F5F5F7] placeholder:text-[#666A76] transition-all duration-150 focus:border-white focus:outline-none focus:ring-0 focus-visible:border-white focus-visible:ring-0"
                  style={{
                    backgroundColor: "rgba(20, 22, 27, 0.45)",
                    border: name
                      ? "1px solid rgba(255, 255, 255, 0.75)"
                      : "1px solid rgba(255, 255, 255, 0.12)",
                  }}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-sm font-semibold text-[#F5F5F7]">
                  Description
                </Label>

                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-11 rounded-xl text-sm text-[#F5F5F7] placeholder:text-[#666A76] transition-all duration-150 focus:border-white focus:outline-none focus:ring-0 focus-visible:border-white focus-visible:ring-0"
                  style={{
                    backgroundColor: "rgba(20, 22, 27, 0.45)",
                    border: description
                      ? "1px solid rgba(255, 255, 255, 0.75)"
                      : "1px solid rgba(255, 255, 255, 0.12)",
                  }}
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div
              className="flex flex-col gap-4"
              data-testid="step-signals"
            >
              <RuleBuilder
                label="Entry rules"
                value={entryRule}
                onChange={setEntryRule}
                testId="entry-rules"
              />

              <RuleBuilder
                label="Exit rules"
                value={exitRule}
                onChange={setExitRule}
                testId="exit-rules"
              />
            </div>
          )}

          {step === 2 && (
            <div
              className="grid grid-cols-3 gap-4"
              data-testid="step-risk"
            >
              {(
                [
                  ["max_drawdown_pct", "Max drawdown %"],
                  ["max_position_size_pct", "Max position size %"],
                  ["stop_loss_pct", "Stop loss %"],
                ] as const
              ).map(([key, lbl]) => (
                <div
                  key={key}
                  className="flex flex-col gap-2"
                >
                  <Label className="text-xs font-semibold text-[#F5F5F7]">
                    {lbl}
                  </Label>

                  <Input
                    type="number"
                    name={key}
                    value={risk[key]}
                    onChange={(e) =>
                      setRisk({
                        ...risk,
                        [key]: Number(e.target.value),
                      })
                    }
                    className="h-11 rounded-xl font-mono text-sm text-[#F5F5F7] transition-all duration-150 focus:border-white focus:outline-none focus:ring-0 focus-visible:border-white focus-visible:ring-0"
                    style={{
                      backgroundColor: "rgba(20, 22, 27, 0.45)",
                      border: risk[key] !== undefined && risk[key] !== null
                        ? "1px solid rgba(255, 255, 255, 0.75)"
                        : "1px solid rgba(255, 255, 255, 0.12)",
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {step === 3 && (
            <div
              className="flex flex-col gap-3"
              data-testid="step-review"
            >
              <div className="text-sm font-medium text-[#F5F5F7]">
                <span className="text-[#666A76]">
                  Name:
                </span>{" "}
                {name}
              </div>

              <pre
                className="max-h-72 overflow-auto rounded-xl p-3 font-mono text-xs text-[#F5F5F7]"
                style={{
                  backgroundColor: "rgba(20, 22, 27, 0.55)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                {JSON.stringify(dslPreview, null, 2)}
              </pre>

              <div>
                <CritiquePanel
                  strategyId={draftId}
                  getStrategyId={onGetCritique}
                />
              </div>
            </div>
          )}

          {error && (
            <p
              className="rounded-xl border p-3 text-xs font-medium text-[#E45B5B]"
              style={{
                backgroundColor: "rgba(228, 91, 91, 0.1)",
                borderColor: "rgba(228, 91, 91, 0.3)",
              }}
            >
              {error}
            </p>
          )}

          <div className="flex justify-between border-t border-white/[0.06] pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setStep((s) => Math.max(0, s - 1))
              }
              disabled={step === 0}
              className="h-10 rounded-xl text-xs font-medium text-[#9A9DA8] transition-all hover:bg-white/[0.05] hover:text-[#F5F5F7] disabled:opacity-30"
              style={{
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              Back
            </Button>

            {step < STEPS.length - 1 ? (
              <Button
                type="button"
                data-testid="wizard-next"
                onClick={() =>
                  setStep((s) => s + 1)
                }
                className="h-10 rounded-xl px-5 text-xs font-semibold tracking-wide text-white shadow-sm transition-all duration-200 hover:brightness-110 active:scale-[0.99]"
                style={{
                  backgroundColor: "#5C568E",
                  border: "1px solid rgba(255, 255, 255, 0.18)",
                  boxShadow: "0 4px 18px rgba(92, 86, 142, 0.4)",
                }}
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                data-testid="wizard-create"
                onClick={onCreate}
                disabled={saving}
                className="h-10 rounded-xl px-5 text-xs font-semibold tracking-wide text-white shadow-sm transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:opacity-40"
                style={{
                  backgroundColor: "#5C568E",
                  border: "1px solid rgba(255, 255, 255, 0.18)",
                  boxShadow: "0 4px 20px rgba(92, 86, 142, 0.5)",
                }}
              >
                {saving ? "Creating…" : "Create strategy"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}