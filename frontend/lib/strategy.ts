import { apiFetch, errorMessage } from "@/lib/api-client";
import type {
  Condition,
  RiskConstraints,
  RuleGroup,
  StrategyDetailResponse,
  StrategyList,
} from "@/lib/strategy-types";

/** Convert the builder's RuleGroup into the backend DSL JSON (drops UI-only fields). */
export function toDSL(group: RuleGroup): Record<string, unknown> {
  const conditions = group.conditions.map((c: Condition) => {
    const leaf: Record<string, unknown> = {
      indicator: c.indicator,
      comparator: c.comparator,
    };
    if (c.value_ref) leaf.value_ref = c.value_ref;
    else leaf.value = c.value ?? 0;
    return leaf;
  });
  return { operator: group.operator, conditions };
}

export interface CreateStrategyInput {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  entry_rules: Record<string, unknown>;
  exit_rules: Record<string, unknown>;
  risk_constraints: RiskConstraints;
}

export async function createStrategy(input: CreateStrategyInput): Promise<{ id: string }> {
  const res = await apiFetch("/strategies", { method: "POST", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to create strategy"));
  return (await res.json()) as { id: string };
}

export async function listStrategies(): Promise<StrategyList> {
  const res = await apiFetch("/strategies?limit=100");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load strategies"));
  return (await res.json()) as StrategyList;
}

export async function getStrategy(id: string): Promise<StrategyDetailResponse> {
  const res = await apiFetch(`/strategies/${id}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load strategy"));
  return (await res.json()) as StrategyDetailResponse;
}

export async function triggerBacktest(id: string, symbol: string): Promise<void> {
  const res = await apiFetch(`/strategies/${id}/backtest`, {
    method: "POST",
    body: JSON.stringify({ symbol }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to start backtest"));
}

export async function submitStrategy(id: string): Promise<void> {
  const res = await apiFetch(`/strategies/${id}/submit`, { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res, "Submit failed"));
}

export async function approveOrRejectStrategy(
  id: string,
  action: "approve" | "reject",
  justification: string,
): Promise<void> {
  const res = await apiFetch(`/strategies/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ action, justification }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to ${action} strategy`));
}
