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
    <div className="mx-auto w-full max-w-3xl text-[#d3dbdd]">
      <BackLink href={`${basePath}/strategies`} label="Back to strategies" />

      <Card className="border-[#075056]/40 bg-[#16232b] shadow-xl shadow-black/20">
        <CardHeader>
          <CardTitle className="text-[#fdf6e3]">
            Strategy Builder
          </CardTitle>

          <CardDescription className="text-[#d3dbdd]/60">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </CardDescription>

          <div className="mt-3 flex gap-2">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full ${
                  i <= step
                    ? "bg-[#f2d17d]"
                    : "bg-[#d3dbdd]/15"
                }`}
              />
            ))}
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {step === 0 && (
            <div
              className="flex flex-col gap-4"
              data-testid="step-basic"
            >
              <div className="flex flex-col gap-1.5">
                <Label className="text-[#d3dbdd]">
                  Name
                </Label>

                <Input
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border-[#d3dbdd]/20 bg-[#d3dbdd] text-[#16232b] placeholder:text-[#16232b]/50 focus-visible:ring-[#075056]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-[#d3dbdd]">
                  Description
                </Label>

                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="border-[#d3dbdd]/20 bg-[#d3dbdd] text-[#16232b] placeholder:text-[#16232b]/50 focus-visible:ring-[#075056]"
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
                  className="flex flex-col gap-1.5"
                >
                  <Label className="text-[#d3dbdd]">
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
                    className="border-[#d3dbdd]/20 bg-[#d3dbdd] text-[#16232b] focus-visible:ring-[#075056]"
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
              <div className="text-sm text-[#d3dbdd]">
                <span className="text-[#d3dbdd]/50">
                  Name:
                </span>{" "}
                {name}
              </div>

              <pre className="max-h-72 overflow-auto rounded-md border border-[#075056]/30 bg-[#16232b] p-3 text-xs text-[#d3dbdd]">
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
            <p className="rounded-md border border-[#fe5b05]/40 bg-[#fe5b05]/10 px-3 py-2 text-sm text-[#fe5b05]">
              {error}
            </p>
          )}

          <div className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setStep((s) => Math.max(0, s - 1))
              }
              disabled={step === 0}
              className="border-[#d3dbdd]/20 bg-transparent text-[#d3dbdd] hover:bg-[#d3dbdd]/10 hover:text-[#d3dbdd]"
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
                className="bg-[#075056] text-[#d3dbdd] hover:bg-[#075056]/85"
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                data-testid="wizard-create"
                onClick={onCreate}
                disabled={saving}
                className="bg-[#fe5b05] text-white hover:bg-[#fe5b05]/85"
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
