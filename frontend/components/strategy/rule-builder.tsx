"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COMPARATORS, INDICATORS, type Condition, type RuleGroup } from "@/lib/strategy-types";

const selectClass =
  "h-9 rounded-xl border border-white/[0.12] bg-[#14161B]/45 px-3 text-xs text-[#F5F5F7] transition-all duration-150 focus:border-white/75 focus:outline-none focus:ring-0 focus-visible:border-white/75 focus-visible:ring-0";

interface RuleBuilderProps {
  label: string;
  value: RuleGroup;
  onChange: (next: RuleGroup) => void;
  testId?: string;
}

export function RuleBuilder({ label, value, onChange, testId }: RuleBuilderProps) {
  function updateCondition(index: number, patch: Partial<Condition>) {
    const conditions = value.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange({ ...value, conditions });
  }
  function addCondition() {
    onChange({
      ...value,
      conditions: [...value.conditions, { indicator: "rsi_14", comparator: "<", value: 30 }],
    });
  }
  function removeCondition(index: number) {
    onChange({ ...value, conditions: value.conditions.filter((_, i) => i !== index) });
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl p-4 shadow-sm backdrop-blur-sm"
      style={{
        backgroundColor: "rgba(20, 22, 27, 0.35)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
      }}
      data-testid={testId}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#F5F5F7]">{label}</span>
        <label className="flex items-center gap-2 font-mono text-xs text-[#9A9DA8]">
          Combine with
          <select
            className={selectClass}
            value={value.operator}
            onChange={(e) => onChange({ ...value, operator: e.target.value as "AND" | "OR" })}
            data-testid={testId ? `${testId}-operator` : undefined}
          >
            <option value="AND" className="bg-[#0F1115] text-[#F5F5F7]">AND</option>
            <option value="OR" className="bg-[#0F1115] text-[#F5F5F7]">OR</option>
          </select>
        </label>
      </div>

      {value.conditions.map((cond, i) => {
        const usesRef = cond.value_ref !== undefined;
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              className={selectClass}
              value={cond.indicator}
              onChange={(e) => updateCondition(i, { indicator: e.target.value })}
            >
              {INDICATORS.map((ind) => (
                <option key={ind} value={ind} className="bg-[#0F1115] text-[#F5F5F7]">{ind}</option>
              ))}
            </select>

            <select
              className={selectClass}
              value={cond.comparator}
              onChange={(e) => updateCondition(i, { comparator: e.target.value })}
            >
              {COMPARATORS.map((cmp) => (
                <option key={cmp} value={cmp} className="bg-[#0F1115] text-[#F5F5F7]">{cmp}</option>
              ))}
            </select>

            <select
              className={selectClass}
              value={usesRef ? "indicator" : "constant"}
              onChange={(e) =>
                e.target.value === "indicator"
                  ? updateCondition(i, { value: undefined, value_ref: "sma_50" })
                  : updateCondition(i, { value_ref: undefined, value: 0 })
              }
            >
              <option value="constant" className="bg-[#0F1115] text-[#F5F5F7]">constant</option>
              <option value="indicator" className="bg-[#0F1115] text-[#F5F5F7]">indicator</option>
            </select>

            {usesRef ? (
              <select
                className={selectClass}
                value={cond.value_ref}
                onChange={(e) => updateCondition(i, { value_ref: e.target.value })}
              >
                {INDICATORS.map((ind) => (
                  <option key={ind} value={ind} className="bg-[#0F1115] text-[#F5F5F7]">{ind}</option>
                ))}
              </select>
            ) : (
              <Input
                type="number"
                className="h-9 w-28 rounded-xl font-mono text-xs text-[#F5F5F7] transition-all duration-150 focus:border-white focus:outline-none focus:ring-0 focus-visible:border-white focus-visible:ring-0"
                style={{
                  backgroundColor: "rgba(20, 22, 27, 0.45)",
                  border: cond.value !== undefined && cond.value !== null
                    ? "1px solid rgba(255, 255, 255, 0.75)"
                    : "1px solid rgba(255, 255, 255, 0.12)",
                }}
                value={cond.value ?? 0}
                onChange={(e) => updateCondition(i, { value: Number(e.target.value) })}
              />
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeCondition(i)}
              disabled={value.conditions.length <= 1}
              className="h-9 w-9 rounded-xl p-0 text-xs text-[#666A76] transition-colors hover:bg-white/[0.06] hover:text-[#E45B5B] disabled:opacity-20"
            >
              ✕
            </Button>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addCondition}
        className="w-fit rounded-xl border border-white/[0.12] bg-[#14161B]/50 text-xs font-medium text-[#F5F5F7] shadow-sm transition-all duration-200 hover:border-white/[0.22] hover:bg-[#5C568E]/20 hover:text-white active:scale-[0.99]"
      >
        + Add condition
      </Button>
    </div>
  );
}