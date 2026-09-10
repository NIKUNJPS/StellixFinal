"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { critiqueStrategy } from "@/lib/llm";
import type { CritiqueResponse } from "@/lib/llm-types";

import { SlideOutPanel } from "./slide-out-panel";

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <h4 className="mb-1 text-sm font-medium text-[#F5F5F7]">{title}</h4>
      <ul className="list-inside list-disc space-y-1 text-sm text-[#9A9DA8]">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

interface CritiquePanelProps {
  /** Strategy id if already known, OR a callback that creates/resolves one on
   * demand (e.g. the Strategy Builder creates a draft on first critique request). */
  strategyId?: string | null;
  getStrategyId?: () => Promise<string | null>;
}

export function CritiquePanel({ strategyId, getStrategyId }: CritiquePanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CritiqueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runCritique() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const id = strategyId ?? (getStrategyId ? await getStrategyId() : null);
      if (!id) {
        setError("Create the strategy first, then request a critique.");
        return;
      }
      const res = await critiqueStrategy(id);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get critique");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={runCritique}
        data-testid="get-ai-critique"
        className="h-10 rounded-xl px-4 text-xs font-semibold tracking-wide text-white shadow-sm transition-all duration-200 hover:brightness-110 active:scale-[0.99]"
        style={{
          backgroundColor: "#5C568E",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          boxShadow: "0 4px 18px rgba(92, 86, 142, 0.4)",
        }}
      >
        Get AI Critique
      </Button>
      <SlideOutPanel open={open} onClose={() => setOpen(false)} title="Strategy Critique">
        {loading && <p className="text-sm text-[#9A9DA8]">Analyzing strategy...</p>}
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
        {result && (
          <div>
            {result.numeric_validation_passed === false && (
              <Badge
                variant="destructive"
                className="mb-3 border border-[#E45B5B]/30 bg-[#E45B5B]/15 text-xs text-[#E45B5B]"
                data-testid="numeric-validation-warning"
              >
                Warning: a numeric claim in this critique could not be verified against real data
              </Badge>
            )}
            <Section title="Strengths" items={result.critique.strengths} />
            <Section title="Weaknesses" items={result.critique.weaknesses} />
            <Section title="Overfitting risks" items={result.critique.overfitting_risks} />
            <Section title="Edge cases" items={result.critique.edge_cases} />
          </div>
        )}
      </SlideOutPanel>
    </>
  );
}