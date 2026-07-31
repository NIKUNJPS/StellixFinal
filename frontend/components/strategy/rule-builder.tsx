"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COMPARATORS, INDICATORS, type Condition, type RuleGroup } from "@/lib/strategy-types";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm";

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
    <div className="flex flex-col gap-3 rounded-md border border-border p-4" data-testid={testId}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Combine with
          <select
            className={selectClass}
            value={value.operator}
            onChange={(e) => onChange({ ...value, operator: e.target.value as "AND" | "OR" })}
            data-testid={testId ? `${testId}-operator` : undefined}
          >
            <option value="AND">AND</option>
            <option value="OR">OR</option>
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
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>

            <select
              className={selectClass}
              value={cond.comparator}
              onChange={(e) => updateCondition(i, { comparator: e.target.value })}
            >
              {COMPARATORS.map((cmp) => (
                <option key={cmp} value={cmp}>{cmp}</option>
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
              <option value="constant">constant</option>
              <option value="indicator">indicator</option>
            </select>

            {usesRef ? (
              <select
                className={selectClass}
                value={cond.value_ref}
                onChange={(e) => updateCondition(i, { value_ref: e.target.value })}
              >
                {INDICATORS.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            ) : (
              <Input
                type="number"
                className="h-9 w-28"
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
            >
              ✕
            </Button>
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={addCondition} className="w-fit">
        + Add condition
      </Button>
    </div>
  );
}
