"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateHypothesis } from "@/lib/llm";
import type { HypothesisResponse } from "@/lib/llm-types";

import { SlideOutPanel } from "./slide-out-panel";

export function HypothesisPanel() {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState("SPY");
  const [userPrompt, setUserPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HypothesisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await generateHypothesis({ symbol, user_prompt: userPrompt || null });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate hypothesis");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} data-testid="open-hypothesis-panel">
        Generate Hypothesis
      </Button>
      <SlideOutPanel open={open} onClose={() => setOpen(false)} title="AI Research Hypothesis">
        <div className="mb-4 flex flex-col gap-3">
          <div>
            <Label htmlFor="hyp-symbol">Symbol</Label>
            <Input id="hyp-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} className="h-8" />
          </div>
          <div>
            <Label htmlFor="hyp-prompt">Your framing (optional)</Label>
            <textarea
              id="hyp-prompt"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="e.g. Focus on mean-reversion in high-volatility regimes"
              className="w-full rounded-md border border-input bg-transparent p-2 text-sm"
              rows={3}
              data-testid="hypothesis-user-prompt"
            />
          </div>
          <Button type="button" size="sm" onClick={run} disabled={loading} data-testid="run-hypothesis">
            {loading ? "Generating..." : "Generate"}
          </Button>
        </div>
        {error && (
          <p className="text-sm text-destructive" data-testid="hypothesis-error">
            {error}
          </p>
        )}
        {result && (
          <div className="flex flex-col gap-3" data-testid="hypothesis-result">
            <div>
              <h4 className="mb-1 text-sm font-medium">Hypothesis</h4>
              <p className="text-sm text-muted-foreground">{result.hypothesis.hypothesis_text}</p>
            </div>
            <div>
              <h4 className="mb-1 text-sm font-medium">Rationale</h4>
              <p className="text-sm text-muted-foreground">{result.hypothesis.rationale}</p>
            </div>
            {result.hypothesis.suggested_regime_focus.length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-medium">Suggested regime focus</h4>
                <div className="flex flex-wrap gap-1.5">
                  {result.hypothesis.suggested_regime_focus.map((r) => (
                    <span key={r} className="rounded-full border border-border px-2 py-0.5 text-xs">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {result.hypothesis.suggested_parameters.length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-medium">Suggested parameters</h4>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {result.hypothesis.suggested_parameters.map((p) => (
                    <li key={p.name}>
                      {p.name}: {p.value} (range {p.min}-{p.max})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Saved as a research note. Create a strategy from this manually if you want to pursue it —
              it will always start as a draft awaiting review.
            </p>
          </div>
        )}
      </SlideOutPanel>
    </>
  );
}
