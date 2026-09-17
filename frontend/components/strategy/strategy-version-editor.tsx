"use client";

import { AlertTriangle, GitBranch, History, LockKeyhole } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useState } from "react";

import { BackLink } from "@/components/layout/back-link";
import { RuleBuilder } from "@/components/strategy/rule-builder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStrategy, getStrategyVersionHistory, saveStrategyVersion, toDSL } from "@/lib/strategy";
import {
  ruleGroupFromDSL,
  type RiskConstraints,
  type RuleGroup,
  type StrategyRead,
  type StrategyVersionDiff,
} from "@/lib/strategy-types";
import { useCan } from "@/hooks/use-permissions";
import { PERM } from "@/lib/rbac";

const RISK_FIELDS = [
  ["max_drawdown_pct", "Max drawdown %"],
  ["max_position_size_pct", "Max position size %"],
  ["stop_loss_pct", "Stop loss %"],
] as const;

function nextVersion(version: string): string {
  const match = /^v?(\d+)\.(\d+)$/.exec(version);
  return match ? `v${match[1]}.${Number(match[2]) + 1}` : "next version";
}

function riskFrom(strategy: StrategyRead): RiskConstraints {
  const r = strategy.risk_constraints as Partial<RiskConstraints>;
  return {
    max_drawdown_pct: Number(r.max_drawdown_pct ?? 20),
    max_position_size_pct: Number(r.max_position_size_pct ?? 10),
    stop_loss_pct: Number(r.stop_loss_pct ?? 5),
  };
}

const VersionHistory = memo(function VersionHistory({ history }: { history: StrategyVersionDiff[] }) {
  return (
    <aside className="rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-5" data-testid="version-history">
      <p className="mb-3 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#808495]">
        <History className="h-3.5 w-3.5 text-[#8E88C7]" /> Version history
      </p>
      <ol className="space-y-3">
        {[...history].reverse().map((v, i) => (
          <li key={`${v.version_number}-${v.created_at}`} className="relative border-l border-white/[0.08] pl-4">
            <span className={`absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-[#8E88C7]" : "bg-white/20"}`} />
            <p className="font-mono text-xs font-semibold text-[#F5F5F7]">
              {v.version_number}
              {i === 0 && <span className="ml-2 text-[10px] font-normal text-[#8E88C7]">current</span>}
            </p>
            <p className="mt-0.5 text-xs text-[#C9CBD3]">{v.change_reason ?? "No reason recorded"}</p>
            <p className="mt-0.5 font-mono text-[10px] text-[#666A76]">
              {new Date(v.created_at).toLocaleString()}
              {v.changed_keys.length > 0 && ` · ${v.changed_keys.join(", ")}`}
            </p>
          </li>
        ))}
      </ol>
    </aside>
  );
});

/**
 * Batch 25: "save changes as a new version". Edits an existing strategy in place —
 * bumping vX.Y -> vX.(Y+1) and recording a mandatory change reason — instead of the
 * previous only-path, "New strategy", which always (correctly) starts at v1.0.
 */
export function StrategyVersionEditor({ basePath }: { basePath: string }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const canAuthor = useCan(PERM.STRATEGY_VERSION);

  const [strategy, setStrategy] = useState<StrategyRead | null>(null);
  const [history, setHistory] = useState<StrategyVersionDiff[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [entryRule, setEntryRule] = useState<RuleGroup | null>(null);
  const [exitRule, setExitRule] = useState<RuleGroup | null>(null);
  const [risk, setRisk] = useState<RiskConstraints | null>(null);
  const [changeReason, setChangeReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([getStrategy(id), getStrategyVersionHistory(id)])
      .then(([detail, versions]) => {
        const s = detail.strategy;
        setStrategy(s);
        setHistory(versions);
        setName(s.name);
        setDescription(s.description ?? "");
        setEntryRule(ruleGroupFromDSL(s.entry_rules));
        setExitRule(ruleGroupFromDSL(s.exit_rules));
        setRisk(riskFrom(s));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load strategy"));
  }, [id]);

  const pendingRevert = strategy && ["candidate", "active", "failed"].includes(strategy.status);
  const isRetired = strategy?.status === "retired";

  const dirty = useMemo(() => {
    if (!strategy || !entryRule || !exitRule || !risk) return false;
    // Compare in the same normalized DSL shape the builder emits.
    const same = (group: RuleGroup, stored: Record<string, unknown>) =>
      JSON.stringify(toDSL(group)) === JSON.stringify(toDSL(ruleGroupFromDSL(stored)));
    return (
      !same(entryRule, strategy.entry_rules) ||
      !same(exitRule, strategy.exit_rules) ||
      JSON.stringify(risk) !== JSON.stringify(riskFrom(strategy))
    );
  }, [strategy, entryRule, exitRule, risk]);

  async function save() {
    if (!strategy || !entryRule || !exitRule || !risk) return;
    setError(null);
    setSaving(true);
    try {
      const saved = await saveStrategyVersion(strategy.id, {
        name,
        description: description || null,
        entry_rules: toDSL(entryRule),
        exit_rules: toDSL(exitRule),
        risk_constraints: risk,
        change_reason: changeReason.trim(),
      });
      router.push(`${basePath}/strategies?versioned=${saved.id}&version=${encodeURIComponent(saved.version)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save new version");
      setSaving(false);
    }
  }

  const inputClass =
    "h-11 rounded-xl border border-white/[0.12] bg-[#14161B]/45 text-sm text-[#F5F5F7] focus-visible:ring-0 focus:border-white/75";

  return (
    <div className="mx-auto w-full max-w-6xl text-[#9A9DA8]">
      <BackLink href={`${basePath}/strategies`} label="Back to strategies" />

      {error && (
        <p className="mb-4 rounded-xl border border-[#E45B5B]/30 bg-[#E45B5B]/10 p-3 text-xs text-[#E45B5B]" role="alert">
          {error}
        </p>
      )}

      {!strategy ? (
        !error && <p className="py-20 text-center font-mono text-xs uppercase tracking-wider">Loading strategy…</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <section className="rounded-2xl border border-white/10 bg-[#0F1115]/65 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] pb-4">
              <div>
                <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#808495]">
                  <GitBranch className="h-3.5 w-3.5 text-[#8E88C7]" /> Save as new version
                </p>
                <h1 className="mt-1 text-xl font-bold tracking-tight text-[#F5F5F7]">{strategy.name}</h1>
              </div>
              <span className="rounded-lg border border-white/[0.1] bg-[#14161B] px-3 py-1 font-mono text-xs text-[#F5F5F7]">
                {strategy.version} → <span className="text-[#8E88C7]">{nextVersion(strategy.version)}</span>
              </span>
            </div>

            {isRetired || !canAuthor ? (
              <div className="flex flex-col items-center py-14 text-center">
                <LockKeyhole className="h-5 w-5 text-[#808495]" />
                <p className="mt-3 text-sm font-semibold text-[#F5F5F7]">
                  {isRetired ? "Retired strategies are immutable" : "Your role cannot author new strategy versions"}
                </p>
                <p className="mt-1 max-w-md text-xs">
                  {isRetired
                    ? "A retired strategy is a permanent research record. Create a new strategy to continue the idea."
                    : "Governance roles review and control strategies; rule changes come from the research team."}
                </p>
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-5">
                {pendingRevert && (
                  <p className="flex items-start gap-2 rounded-xl border border-[#E5A84B]/30 bg-[#E5A84B]/10 p-3 text-xs text-[#E5A84B]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    This strategy is {strategy.status}. Saving a new version returns it to draft: it must be re-validated and
                    re-approved before it can trade again. Its existing history is kept.
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs font-semibold text-[#F5F5F7]">Name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs font-semibold text-[#F5F5F7]">Description</Label>
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
                  </div>
                </div>
                {entryRule && <RuleBuilder label="Entry rules" value={entryRule} onChange={setEntryRule} testId="entry-rules" />}
                {exitRule && <RuleBuilder label="Exit rules" value={exitRule} onChange={setExitRule} testId="exit-rules" />}
                {risk && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {RISK_FIELDS.map(([key, label]) => (
                      <div key={key} className="flex flex-col gap-2">
                        <Label className="text-xs font-semibold text-[#F5F5F7]">{label}</Label>
                        <Input
                          type="number"
                          value={risk[key]}
                          onChange={(e) => setRisk({ ...risk, [key]: Number(e.target.value) })}
                          className={`${inputClass} font-mono`}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="change-reason" className="text-xs font-semibold text-[#F5F5F7]">
                    Why are you making this change? <span className="text-[#E45B5B]">*</span>
                  </Label>
                  <textarea
                    id="change-reason"
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    rows={3}
                    maxLength={512}
                    placeholder="e.g. Tightened the RSI entry threshold after the Q3 drawdown review"
                    className="rounded-xl border border-white/[0.12] bg-[#14161B]/45 p-3 text-sm text-[#F5F5F7] outline-none focus:border-white/75"
                    data-testid="change-reason"
                  />
                  <p className="text-[11px] text-[#666A76]">Recorded on the new version and in the audit trail.</p>
                </div>
                <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
                  <p className="text-[11px]">
                    {dirty ? "Unsaved rule or risk changes." : "Change a rule or risk constraint to create a new version."}
                  </p>
                  <Button
                    type="button"
                    onClick={save}
                    disabled={saving || !dirty || changeReason.trim().length < 3}
                    className="h-10 rounded-xl bg-[#5C568E] px-5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-40"
                    data-testid="save-new-version"
                  >
                    {saving ? "Saving…" : `Save as ${nextVersion(strategy.version)}`}
                  </Button>
                </div>
              </div>
            )}
          </section>
          <VersionHistory history={history} />
        </div>
      )}
    </div>
  );
}
