/** Market Terminal API client + types (Batch 31, ADR 0010). Mirrors backend/app/terminal. */

import { apiFetch, errorMessage } from "@/lib/api-client";

/** Every global payload: the data plus where it came from and how fresh it is. */
export interface Envelope<T> {
  data: T;
  source: string;
  delay_note: string;
  fetched_at: string;
  stale: boolean;
  age_seconds: number;
}

export class TerminalError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new TerminalError(await errorMessage(res, "Request failed"), res.status);
  return (await res.json()) as T;
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new TerminalError(await errorMessage(res, "Request failed"), res.status);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const enc = encodeURIComponent;

// ------------------------------------------------------------------ market data types
export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string | null;
}

export interface Quote {
  symbol: string;
  status: "ok" | "unavailable";
  last?: number | null;
  previous_close?: number | null;
  change?: number | null;
  change_pct?: number | null;
  volume?: number | null;
  day_high?: number | null;
  day_low?: number | null;
  as_of?: string;
}

export interface QuoteDetail {
  symbol: string;
  name: string | null;
  currency: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  last: number | null;
  bid: number | null;
  ask: number | null;
  bid_size: number | null;
  ask_size: number | null;
  open: number | null;
  day_high: number | null;
  day_low: number | null;
  previous_close: number | null;
  change: number | null;
  change_pct: number | null;
  volume: number | null;
  average_volume: number | null;
  market_cap: number | null;
  /** ETFs: total net assets (no market cap). */
  total_assets?: number | null;
  pe_ratio: number | null;
  forward_pe: number | null;
  eps: number | null;
  dividend_yield_pct: number | null;
  fifty_two_week_low: number | null;
  fifty_two_week_high: number | null;
  beta: number | null;
  shares_outstanding: number | null;
  summary: string | null;
}

export interface Candle {
  t: number;
  o: number | null;
  h: number | null;
  l: number | null;
  c: number | null;
  v: number | null;
}
export interface Point {
  t: number;
  v: number;
}
export type ChartRange = "1D" | "5D" | "1M" | "3M" | "6M" | "1Y" | "5Y" | "MAX";
export interface History {
  symbol: string;
  range: ChartRange;
  interval: string;
  intraday: boolean;
  candles: Candle[];
  indicators: Record<
    "sma_20" | "sma_50" | "ema_12" | "ema_26" | "bollinger_upper" | "bollinger_lower" | "rsi_14" | "macd" | "macd_signal" | "vwap",
    Point[]
  >;
  vwap_label: string;
}

export interface NewsItem {
  title: string;
  link: string;
  publisher: string | null;
  published_at: string | null;
}

export interface OptionRow {
  contract: string;
  strike: number;
  last: number | null;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  volume: number | null;
  open_interest: number | null;
  implied_volatility: number | null;
  in_the_money: boolean;
  greeks: { delta: number; gamma: number; theta: number; vega: number; rho: number } | null;
}
export interface OptionChain {
  symbol: string;
  expiration: string;
  expirations: string[];
  underlying_price: number | null;
  calls: OptionRow[];
  puts: OptionRow[];
  risk_free_rate: number;
  risk_free_source: string;
  greeks_model: string;
}

export interface CryptoCoin {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  rank: number | null;
  price: number | null;
  change_pct_24h: number | null;
  change_pct_7d: number | null;
  market_cap: number | null;
  volume_24h: number | null;
  sparkline_7d: number[];
}
export interface CryptoBoard {
  coins: CryptoCoin[];
  global: {
    total_market_cap_usd: number | null;
    btc_dominance: number | null;
    eth_dominance: number | null;
    market_cap_change_pct_24h: number | null;
  } | null;
  fallback?: boolean;
}
export interface CryptoKlines {
  pair: string;
  interval: string;
  candles: Candle[];
}
export interface OrderBook {
  pair: string;
  bids: [number, number][];
  asks: [number, number][];
}

export interface MacroGlobal {
  proxies: (Quote & { label: string; group: string })[];
  ecb: { key: string; label: string; value: number | null; date: string | null; error?: string }[];
}

export interface EconEvent {
  date: string;
  release_id: number;
  name: string;
  link: string | null;
  upcoming: boolean;
  series_id: string;
  latest_value: number | null;
  latest_period: string | null;
  prior_value: number | null;
  change: number | null;
  change_kind: "pct_change" | "diff" | "level";
}
export interface EarningsNext {
  symbol: string;
  next_date: string | null;
  eps_estimate?: number | null;
  eps_low?: number | null;
  eps_high?: number | null;
  revenue_estimate?: number | null;
  error?: string;
}
export interface EarningsQuarter {
  date: string;
  eps_estimate: number | null;
  eps_actual: number | null;
  surprise_pct: number | null;
  next_session_move_pct: number | null;
}

export interface InsiderTx {
  filing_date: string;
  transaction_date: string | null;
  owner: string | null;
  title: string | null;
  is_director: boolean;
  is_officer: boolean;
  is_ten_percent_owner: boolean;
  code: string | null;
  code_label: string | null;
  acquired_disposed: "A" | "D" | null;
  shares: number | null;
  price: number | null;
  value: number | null;
  shares_after: number | null;
  filing_url: string;
}
export interface ShortVolume {
  symbol: string;
  sessions: {
    date: string;
    short_volume: number;
    short_exempt_volume: number;
    total_volume: number;
    short_ratio_pct: number | null;
  }[];
}

export interface ScreenerRow {
  symbol: string;
  name: string;
  sector: string;
  last_price: number | null;
  change_pct: number | null;
  volume: number | null;
  dollar_volume: number | null;
  market_cap: number | null;
  shares_source: string | null;
  status: "ok" | "unavailable";
}
export interface ScreenerPayload {
  universe_note: string;
  data_delay_note: string;
  generated_at: string;
  rows: ScreenerRow[];
  market_cap_source: string;
  market_cap_note: string | null;
}
export interface HeatmapPayload {
  size_basis: "market_cap" | "dollar_volume";
  size_note: string;
  universe_note: string;
  data_delay_note: string;
  generated_at: string;
  sectors: {
    sector: string;
    size: number | null;
    change_pct: number | null;
    tiles: { symbol: string; name: string; change_pct: number | null; size: number | null; status: string }[];
  }[];
}
export interface Recap {
  summary: string;
  summary_method: string;
  generated_at: string;
  vix: number | null;
  indices: { symbol: string; name: string; last_price: number | null; change_pct: number | null; status?: string }[];
  gainers: ScreenerRow[];
  losers: ScreenerRow[];
  sectors: { sector: string; change_pct: number }[];
  headlines: NewsItem[];
  universe_note: string;
}
export interface TerminalStatus {
  sources: Record<string, { configured: boolean; note: string | null }>;
  history_ranges: ChartRange[];
  tv_channels: { label: string; youtube_channel_id: string }[];
  risk_free_fallback: number;
}

// ------------------------------------------------------------------ user data types
export type WidgetType =
  | "chart"
  | "quote"
  | "watchlist"
  | "news"
  | "screener"
  | "heatmap"
  | "options"
  | "crypto"
  | "macro"
  | "holdings"
  | "calendar"
  | "insider"
  | "recap"
  | "tv"
  | "ai"
  | "alerts";
export interface WidgetInstance {
  id: string;
  type: WidgetType;
  config: Record<string, unknown>;
}
export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Workspace {
  widgets: WidgetInstance[];
  layout: LayoutItem[];
  active_symbol: string;
}
export interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
}
export interface HoldingPortfolio {
  id: string;
  name: string;
  base_currency: string;
  cash: number | null;
}
export interface HoldingTx {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  executed_at: string;
  note: string | null;
}
export interface PositionRow {
  symbol: string;
  quantity: number;
  average_cost: number | null;
  cost_basis: number;
  last_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
  realized_pnl: number;
  fees: number;
  trades: number;
  open: boolean;
}
export interface Positions {
  positions: PositionRow[];
  totals: {
    market_value: number | null;
    cost_basis: number;
    unrealized_pnl: number | null;
    realized_pnl: number;
    complete: boolean;
  };
  portfolio: HoldingPortfolio;
}
export interface PriceAlert {
  id: string;
  symbol: string;
  condition: "above" | "below";
  target_price: number;
  status: "active" | "triggered" | "cancelled";
  triggered_at: string | null;
  triggered_price: number | null;
  note: string | null;
  created_at: string;
}

// ------------------------------------------------------------------ calls
export const terminalApi = {
  status: () => get<TerminalStatus>("/terminal/status"),
  search: (q: string) => get<Envelope<SearchResult[]>>(`/terminal/search?q=${enc(q)}`),
  quotes: (symbols: string[]) => get<Envelope<Quote[]>>(`/terminal/quotes?symbols=${enc(symbols.join(","))}`),
  quote: (s: string) => get<Envelope<QuoteDetail>>(`/terminal/quote/${enc(s)}`),
  history: (s: string, range: ChartRange) => get<Envelope<History>>(`/terminal/history/${enc(s)}?range=${range}`),
  news: (symbol?: string) => get<Envelope<NewsItem[]>>(`/terminal/news${symbol ? `?symbol=${enc(symbol)}` : ""}`),
  options: (s: string, expiration?: string) =>
    get<Envelope<OptionChain>>(`/terminal/options/${enc(s)}${expiration ? `?expiration=${expiration}` : ""}`),
  crypto: () => get<Envelope<CryptoBoard>>("/terminal/crypto"),
  cryptoHistory: (s: string, interval: string) =>
    get<Envelope<CryptoKlines>>(`/terminal/crypto/${enc(s)}/history?interval=${interval}`),
  orderbook: (s: string) => get<Envelope<OrderBook>>(`/terminal/crypto/${enc(s)}/orderbook`),
  macro: () => get<Envelope<MacroGlobal>>("/terminal/macro/global"),
  econCalendar: () => get<Envelope<EconEvent[]>>("/terminal/calendar/economic"),
  earningsCalendar: (symbols: string[]) =>
    get<Envelope<EarningsNext[]>>(`/terminal/calendar/earnings?symbols=${enc(symbols.join(","))}`),
  earningsHistory: (s: string) => get<Envelope<EarningsQuarter[]>>(`/terminal/earnings-history/${enc(s)}`),
  insider: (s: string) =>
    get<Envelope<{ symbol: string; cik: number; company: string; transactions: InsiderTx[] }>>(`/terminal/insider/${enc(s)}`),
  shortVolume: (s: string) => get<Envelope<ShortVolume>>(`/terminal/short-volume/${enc(s)}`),
  screener: () => get<ScreenerPayload>("/terminal/screener"),
  heatmap: () => get<HeatmapPayload>("/terminal/heatmap"),
  recap: () => get<Recap>("/terminal/recap"),

  workspace: () => get<Workspace>("/terminal/workspace"),
  saveWorkspace: (w: Workspace) => send<Workspace>("/terminal/workspace", "PUT", w),
  watchlists: () => get<Watchlist[]>("/terminal/watchlists"),
  updateWatchlist: (id: string, body: { name?: string; symbols?: string[] }) =>
    send<Watchlist>(`/terminal/watchlists/${id}`, "PATCH", body),
  createWatchlist: (body: { name: string; symbols: string[] }) => send<Watchlist>("/terminal/watchlists", "POST", body),
  portfolios: () => get<HoldingPortfolio[]>("/terminal/portfolios"),
  createPortfolio: (body: { name: string; base_currency?: string; cash?: number | null }) =>
    send<HoldingPortfolio>("/terminal/portfolios", "POST", body),
  deletePortfolio: (id: string) => send<void>(`/terminal/portfolios/${id}`, "DELETE"),
  transactions: (id: string) => get<HoldingTx[]>(`/terminal/portfolios/${id}/transactions`),
  addTransaction: (id: string, body: Omit<HoldingTx, "id">) =>
    send<HoldingTx>(`/terminal/portfolios/${id}/transactions`, "POST", body),
  deleteTransaction: (id: string, tx: string) => send<void>(`/terminal/portfolios/${id}/transactions/${tx}`, "DELETE"),
  positions: (id: string) => get<Positions>(`/terminal/portfolios/${id}/positions`),
  alerts: () => get<PriceAlert[]>("/terminal/alerts"),
  createAlert: (body: { symbol: string; condition: "above" | "below"; target_price: number; note?: string }) =>
    send<PriceAlert>("/terminal/alerts", "POST", body),
  cancelAlert: (id: string) => send<PriceAlert>(`/terminal/alerts/${id}`, "DELETE"),
};

// ------------------------------------------------------------------ formatting
export function fmtNum(x: number | null | undefined, digits = 2): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return x.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPrice(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "—";
  const abs = Math.abs(x);
  // Sub-cent precision only for genuinely tiny prices (some crypto), never for zero.
  return fmtNum(x, abs === 0 || abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6);
}

export function fmtPct(x: number | null | undefined, digits = 2): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return `${x > 0 ? "+" : ""}${x.toFixed(digits)}%`;
}

export function fmtBig(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "—";
  const abs = Math.abs(x);
  if (abs >= 1e12) return `${(x / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(x / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(x / 1e3).toFixed(1)}K`;
  return x.toFixed(0);
}

export function changeColor(x: number | null | undefined): string {
  if (x == null || x === 0) return "#9A9DA8";
  return x > 0 ? "#34D399" : "#F87171";
}

export function ageLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
