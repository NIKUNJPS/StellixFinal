import { apiFetch, errorMessage } from "@/lib/api-client";
import type { CorrelationMatrix, PortfolioOverview } from "@/lib/portfolio-types";

export async function getPortfolioOverview(): Promise<PortfolioOverview> {
  const res = await apiFetch("/portfolio/overview");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load portfolio overview"));
  return (await res.json()) as PortfolioOverview;
}

export async function getPortfolioCorrelation(): Promise<CorrelationMatrix> {
  const res = await apiFetch("/portfolio/correlation");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load correlation matrix"));
  return (await res.json()) as CorrelationMatrix;
}
