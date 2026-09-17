import { apiFetch, errorMessage } from "@/lib/api-client";

/** Batch 25: delayed global index quote (mirrors app/schemas/market.py IndexQuote).
 * Numbers are null whenever status is "unavailable" — the backend never sends a stale
 * price as if it were current. */
export interface IndexQuote {
  symbol: string;
  name: string;
  region: string;
  last_price: number | null;
  previous_close: number | null;
  change: number | null;
  change_pct: number | null;
  /** Exchange session the price belongs to (not a live trade time). */
  session_date: string | null;
  /** When the platform last refreshed this quote successfully. */
  fetched_at: string | null;
  last_attempt_at: string | null;
  status: "ok" | "unavailable";
  unavailable_reason: string | null;
}

export interface GlobalIndicesFeed {
  provider: string;
  is_realtime: boolean;
  refresh_interval_seconds: number;
  stale_after_seconds: number;
  data_delay_note: string;
  generated_at: string;
  refresh_requested?: boolean;
  quotes: IndexQuote[];
}

export async function getGlobalIndices(): Promise<GlobalIndicesFeed> {
  const res = await apiFetch("/market/indices");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load market data"));
  return (await res.json()) as GlobalIndicesFeed;
}

/** "42s ago" / "3m ago" / "2h ago" — the only freshness claim the UI makes. */
export function formatAge(fromIso: string | null, nowMs: number): string {
  if (!fromIso) return "never";
  const seconds = Math.max(0, Math.round((nowMs - new Date(fromIso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

/** Client-side mirror of the server's stale rule, so a card that stops receiving
 * updates (socket dropped, poller stopped) turns "unavailable" on its own instead of
 * showing a frozen number. */
export function isQuoteFresh(quote: IndexQuote, staleAfterSeconds: number, nowMs: number): boolean {
  if (quote.status !== "ok" || quote.last_price === null || !quote.fetched_at) return false;
  return nowMs - new Date(quote.fetched_at).getTime() <= staleAfterSeconds * 1000;
}
