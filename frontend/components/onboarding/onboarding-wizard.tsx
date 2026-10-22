"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  BrainCircuit,
  Check,
  Dna,
  Loader2,
  Network,
  Sparkles,
  Waves,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fireConfetti } from "@/components/onboarding/confetti";
import { enqueueIngest, getJobStatus } from "@/lib/data";
import { completeOnboarding } from "@/lib/onboarding";
import { getCurrentRegime, triggerRegimeDetection } from "@/lib/regime";
import type { RegimeObject } from "@/lib/regime-types";
import { createStrategy, triggerBacktest } from "@/lib/strategy";
import { searchSymbols, nameFor } from "@/lib/symbols";
import { cn } from "@/lib/utils";

const TERMINAL = new Set(["done", "failed"]);
const PERIODS = [
  { value: "1y", label: "1 year" },
  { value: "2y", label: "2 years" },
  { value: "5y", label: "5 years" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

const REGIME_ALGOS = ["HMM", "PELT change-point", "GMM", "GARCH", "Ensemble vote"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function periodDates(period: Period): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - (period === "5y" ? 5 : period === "2y" ? 2 : 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

export function OnboardingWizard({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Step 2 — data
  const [symbol, setSymbol] = useState("");
  const [query, setQuery] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [period, setPeriod] = useState<Period>("2y");
  const [fetching, setFetching] = useState(false);
  const [barsIngested, setBarsIngested] = useState<number | null>(null);

  // Step 3 — regime
  const [detecting, setDetecting] = useState(false);
  const [algoIndex, setAlgoIndex] = useState(0);
  const [regime, setRegime] = useState<RegimeObject | null>(null);

  // Step 4 — strategy
  const [creating, setCreating] = useState(false);

  const suggestions = searchSymbols(query, 6);

  async function onFetchData() {
    if (!symbol.trim()) {
      setError("Choose a symbol first.");
      return;
    }
    setFetching(true);
    setError(null);
    try {
      const { start, end } = periodDates(period);
      const enq = await enqueueIngest({
        symbol: symbol.trim().toUpperCase(),
        start_date: start,
        end_date: end,
        interval: "1d",
        provider: "yfinance",
      });
      let status = await getJobStatus(enq.job_id);
      let tries = 0;
      while (!TERMINAL.has(status.status) && tries < 60) {
        await sleep(2000);
        status = await getJobStatus(enq.job_id);
        tries += 1;
      }
      if (status.status !== "done") {
        throw new Error(status.error || "Data fetch did not complete. Try another symbol.");
      }
      setBarsIngested(status.rows_ingested);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch data");
    } finally {
      setFetching(false);
    }
  }

  // Auto-run regime detection when step 3 opens.
  const detectStarted = useRef(false);
  useEffect(() => {
    if (step !== 3 || detectStarted.current) return;
    detectStarted.current = true;
    void runDetection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function runDetection() {
    setDetecting(true);
    setError(null);
    setAlgoIndex(0);
    // Honest progressive UI: the checklist is a busy indicator while the REAL
    // ensemble runs in the worker; the regime shown below is the real result, not
    // a fabricated one. (No per-algorithm progress event exists to subscribe to.)
    const ticker = setInterval(() => setAlgoIndex((i) => Math.min(i + 1, 4)), 1300);
    try {
      await triggerRegimeDetection(symbol.trim().toUpperCase());
      let r: RegimeObject | null = null;
      let tries = 0;
      while (!r && tries < 40) {
        await sleep(2000);
        r = await getCurrentRegime(symbol.trim().toUpperCase());
        tries += 1;
      }
      if (!r) throw new Error("Regime detection is taking longer than expected.");
      setAlgoIndex(REGIME_ALGOS.length);
      setRegime(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regime detection failed");
    } finally {
      clearInterval(ticker);
      setDetecting(false);
    }
  }

  async function onCreateStrategy() {
    setCreating(true);
    setError(null);
    try {
      const sym = symbol.trim().toUpperCase();
      const { id } = await createStrategy({
        name: `${sym} SMA 20/50 Crossover`,
        description:
          "Golden-cross momentum: enter when the 20-period SMA crosses above the 50-period SMA; exit on the reverse cross.",
        parameters: { fast: 20, slow: 50 },
        entry_rules: {
          operator: "AND",
          conditions: [{ indicator: "sma_20", comparator: "crosses_above", value_ref: "sma_50" }],
        },
        exit_rules: {
          operator: "AND",
          conditions: [{ indicator: "sma_20", comparator: "crosses_below", value_ref: "sma_50" }],
        },
        risk_constraints: { max_drawdown_pct: 15, max_position_size_pct: 10, stop_loss_pct: 5 },
      });
      await triggerBacktest(id, sym);
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create strategy");
    } finally {
      setCreating(false);
    }
  }

  // Step 5 — mark complete + celebrate once.
  useEffect(() => {
    if (step !== 5) return;
    void completeOnboarding().catch(() => {});
    fireConfetti();
  }, [step]);

  function finish() {
    onClose();
    router.push("/dashboard");
  }

  const entrance = reduced
    ? {}
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35 } };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-background/85 backdrop-blur-sm sm:items-center sm:p-4">
      <motion.div
        key={step}
        {...entrance}
        className="relative flex h-full w-full flex-col overflow-y-auto border-border bg-card p-6 shadow-xl sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl sm:border sm:p-8"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss onboarding"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                s <= step ? "bg-stellix-highlight" : "bg-secondary",
              )}
            />
          ))}
        </div>

        {error && (
          <p className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {step === 1 && <StepWelcome onNext={() => setStep(2)} />}
        {step === 2 && (
          <StepData
            symbol={symbol}
            setSymbol={setSymbol}
            query={query}
            setQuery={setQuery}
            showSuggest={showSuggest}
            setShowSuggest={setShowSuggest}
            suggestions={suggestions}
            period={period}
            setPeriod={setPeriod}
            fetching={fetching}
            onFetch={onFetchData}
          />
        )}
        {step === 3 && (
          <StepRegime
            symbol={symbol}
            algoIndex={algoIndex}
            detecting={detecting}
            regime={regime}
            onRetry={() => {
              detectStarted.current = false;
              setRegime(null);
              setStep(3);
              detectStarted.current = true;
              void runDetection();
            }}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <StepStrategy symbol={symbol} creating={creating} onCreate={onCreateStrategy} />
        )}
        {step === 5 && <StepDone onFinish={finish} onClose={onClose} />}
      </motion.div>
    </div>
  );
}

/* --------------------------------- Steps --------------------------------- */

function StepWelcome({ onNext }: { onNext: () => void }) {
  const pillars = [
    { icon: Waves, title: "Regime Awareness", body: "Know which market you're in before you trade." },
    { icon: Network, title: "Institutional Memory", body: "Every failure and insight, preserved and searchable." },
    { icon: Dna, title: "Evolution Engine", body: "Strategies that adapt as regimes shift." },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-stellix-highlight">Welcome to Stellix Labs</span>
        <h2 className="text-2xl font-semibold">Let&apos;s set up your first strategy in 4 steps.</h2>
        <p className="text-muted-foreground">
          Fetch market data, detect the current regime, and run a backtest — all in a couple of
          minutes, on real data.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {pillars.map((p) => (
          <div key={p.title} className="rounded-lg border border-border bg-background/40 p-4">
            <p.icon className="h-6 w-6 text-stellix-highlight" />
            <p className="mt-3 font-medium">{p.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
          </div>
        ))}
      </div>
      <Button onClick={onNext} size="lg" className="sm:w-fit">
        Get started
      </Button>
    </div>
  );
}

function StepData(props: {
  symbol: string;
  setSymbol: (v: string) => void;
  query: string;
  setQuery: (v: string) => void;
  showSuggest: boolean;
  setShowSuggest: (v: boolean) => void;
  suggestions: { symbol: string; name: string }[];
  period: Period;
  setPeriod: (p: Period) => void;
  fetching: boolean;
  onFetch: () => void;
}) {
  const {
    symbol, setSymbol, query, setQuery, showSuggest, setShowSuggest,
    suggestions, period, setPeriod, fetching, onFetch,
  } = props;
  const selectedName = symbol ? nameFor(symbol) : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold">Fetch your first data</h2>
        <p className="text-sm text-muted-foreground">Pick a symbol and how much history to pull.</p>
      </div>

      <div className="relative flex flex-col gap-1.5">
        <Label>Symbol</Label>
        <Input
          placeholder="Search e.g. AAPL or Apple"
          value={query || symbol}
          onChange={(e) => {
            const v = e.target.value.toUpperCase();
            setQuery(v);
            setSymbol(v);
            setShowSuggest(true);
          }}
          onFocus={() => setShowSuggest(true)}
          disabled={fetching}
        />
        {selectedName && !showSuggest && (
          <span className="text-xs text-muted-foreground">{selectedName}</span>
        )}
        {showSuggest && suggestions.length > 0 && (
          <div className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
            {suggestions.map((s) => (
              <button
                key={s.symbol}
                type="button"
                onClick={() => {
                  setSymbol(s.symbol);
                  setQuery("");
                  setShowSuggest(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                <span className="font-medium">{s.symbol}</span>
                <span className="truncate pl-3 text-muted-foreground">{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>History</Label>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              disabled={fetching}
              className={cn(
                "flex-1 rounded-md border px-3 py-2 text-sm",
                period === p.value
                  ? "border-stellix-highlight bg-stellix-highlight/10 text-stellix-highlight"
                  : "border-border text-muted-foreground hover:border-stellix-highlight/40",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <Button onClick={onFetch} disabled={fetching || !symbol.trim()} className="sm:w-fit">
        {fetching ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Fetching data…
          </>
        ) : (
          "Fetch data"
        )}
      </Button>
      {fetching && (
        <p className="text-xs text-muted-foreground">
          Pulling real OHLCV from yfinance and computing features — this can take a moment.
        </p>
      )}
    </div>
  );
}

function StepRegime(props: {
  symbol: string;
  algoIndex: number;
  detecting: boolean;
  regime: RegimeObject | null;
  onRetry: () => void;
  onNext: () => void;
}) {
  const { symbol, algoIndex, detecting, regime, onRetry, onNext } = props;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold">Detecting the market regime</h2>
        <p className="text-sm text-muted-foreground">
          Running the ensemble on {symbol.trim().toUpperCase()}.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {REGIME_ALGOS.map((algo, i) => {
          const done = i < algoIndex;
          const running = i === algoIndex && detecting;
          return (
            <li key={algo} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border",
                  done
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-500"
                    : running
                      ? "border-stellix-highlight text-stellix-highlight"
                      : "border-border text-muted-foreground",
                )}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" />
                ) : running ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BrainCircuit className="h-3.5 w-3.5" />
                )}
              </span>
              <span className={done || running ? "text-foreground" : "text-muted-foreground"}>
                {algo}
              </span>
            </li>
          );
        })}
      </ul>

      {regime && (
        <div className="rounded-lg border border-stellix-highlight/40 bg-stellix-highlight/5 p-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-stellix-highlight" />
            <p className="text-lg font-semibold">
              Current regime: {regime.regime_label}{" "}
              <span className="text-muted-foreground">
                ({Math.round(regime.confidence_score * 100)}% confident)
              </span>
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {regime ? (
          <Button onClick={onNext} className="sm:w-fit">
            Continue
          </Button>
        ) : (
          !detecting && (
            <Button variant="outline" onClick={onRetry}>
              Retry detection
            </Button>
          )
        )}
      </div>
    </div>
  );
}

function StepStrategy({
  symbol,
  creating,
  onCreate,
}: {
  symbol: string;
  creating: boolean;
  onCreate: () => void;
}) {
  const sym = symbol.trim().toUpperCase();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold">Create your first strategy</h2>
        <p className="text-sm text-muted-foreground">
          A classic SMA crossover, pre-filled. You can tweak it later.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-background/40 p-4">
        <p className="font-medium">{sym} SMA 20/50 Crossover</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <Row label="Fast SMA" value="20" />
          <Row label="Slow SMA" value="50" />
          <Row label="Entry" value="20 crosses above 50" />
          <Row label="Exit" value="20 crosses below 50" />
          <Row label="Max drawdown" value="15%" />
          <Row label="Stop loss" value="5%" />
        </dl>
      </div>

      <Button onClick={onCreate} disabled={creating} className="sm:w-fit">
        {creating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving &amp; backtesting…
          </>
        ) : (
          "Save & run backtest"
        )}
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/50 pb-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function StepDone({ onFinish, onClose }: { onFinish: () => void; onClose: () => void }) {
  const links = [
    { href: "/admin/regimes", label: "Regime Monitor", icon: Waves },
    { href: "/admin/memory", label: "Research Memory", icon: Network },
    { href: "/admin/assistant", label: "Research Assistant", icon: Sparkles },
  ];
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
        <Check className="h-7 w-7 text-emerald-500" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold">You&apos;re all set!</h2>
        <p className="mt-1 text-muted-foreground">Your backtest is running.</p>
      </div>
      <div className="grid w-full gap-3 sm:grid-cols-3">
        {links.map((l) => (
          <button
            key={l.href}
            onClick={() => {
              onClose();
              window.location.assign(l.href);
            }}
            className="flex flex-col items-center gap-2 rounded-lg border border-border bg-background/40 p-4 hover:border-stellix-highlight/50"
          >
            <l.icon className="h-5 w-5 text-stellix-highlight" />
            <span className="text-sm font-medium">{l.label}</span>
          </button>
        ))}
      </div>
      <Button onClick={onFinish} size="lg">
        Go to dashboard
      </Button>
    </div>
  );
}
