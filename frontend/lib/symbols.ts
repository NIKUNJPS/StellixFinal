/**
 * A small, curated reference list of common tickers → company names (Batch 21).
 *
 * These are REAL, well-known securities — not fabricated data. It exists so the
 * onboarding symbol search can show "Apple Inc. (AAPL)" without a live external
 * lookup (the codebase has no ticker→name endpoint, and yfinance name resolution
 * would be a live network call). Any symbol not in this list still works as a
 * free-text entry; the list only powers autocomplete suggestions.
 */

export interface SymbolRef {
  symbol: string;
  name: string;
}

export const COMMON_SYMBOLS: SymbolRef[] = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "MSFT", name: "Microsoft Corporation" },
  { symbol: "GOOGL", name: "Alphabet Inc. (Class A)" },
  { symbol: "AMZN", name: "Amazon.com, Inc." },
  { symbol: "NVDA", name: "NVIDIA Corporation" },
  { symbol: "META", name: "Meta Platforms, Inc." },
  { symbol: "TSLA", name: "Tesla, Inc." },
  { symbol: "BRK-B", name: "Berkshire Hathaway Inc. (Class B)" },
  { symbol: "JPM", name: "JPMorgan Chase & Co." },
  { symbol: "V", name: "Visa Inc." },
  { symbol: "MA", name: "Mastercard Incorporated" },
  { symbol: "UNH", name: "UnitedHealth Group Incorporated" },
  { symbol: "HD", name: "The Home Depot, Inc." },
  { symbol: "PG", name: "The Procter & Gamble Company" },
  { symbol: "JNJ", name: "Johnson & Johnson" },
  { symbol: "XOM", name: "Exxon Mobil Corporation" },
  { symbol: "CVX", name: "Chevron Corporation" },
  { symbol: "KO", name: "The Coca-Cola Company" },
  { symbol: "PEP", name: "PepsiCo, Inc." },
  { symbol: "COST", name: "Costco Wholesale Corporation" },
  { symbol: "WMT", name: "Walmart Inc." },
  { symbol: "DIS", name: "The Walt Disney Company" },
  { symbol: "NFLX", name: "Netflix, Inc." },
  { symbol: "AMD", name: "Advanced Micro Devices, Inc." },
  { symbol: "INTC", name: "Intel Corporation" },
  { symbol: "CSCO", name: "Cisco Systems, Inc." },
  { symbol: "ORCL", name: "Oracle Corporation" },
  { symbol: "CRM", name: "Salesforce, Inc." },
  { symbol: "ADBE", name: "Adobe Inc." },
  { symbol: "BAC", name: "Bank of America Corporation" },
  { symbol: "WFC", name: "Wells Fargo & Company" },
  { symbol: "GS", name: "The Goldman Sachs Group, Inc." },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust" },
  { symbol: "QQQ", name: "Invesco QQQ Trust" },
  { symbol: "IWM", name: "iShares Russell 2000 ETF" },
  { symbol: "DIA", name: "SPDR Dow Jones Industrial Average ETF" },
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF" },
  { symbol: "GLD", name: "SPDR Gold Shares" },
  { symbol: "TLT", name: "iShares 20+ Year Treasury Bond ETF" },
  { symbol: "BTC-USD", name: "Bitcoin USD" },
  { symbol: "ETH-USD", name: "Ethereum USD" },
];

/** Case-insensitive prefix/substring match on symbol or name (max `limit`). */
export function searchSymbols(query: string, limit = 8): SymbolRef[] {
  const q = query.trim().toLowerCase();
  if (!q) return COMMON_SYMBOLS.slice(0, limit);
  const starts = COMMON_SYMBOLS.filter((s) => s.symbol.toLowerCase().startsWith(q));
  const contains = COMMON_SYMBOLS.filter(
    (s) =>
      !s.symbol.toLowerCase().startsWith(q) &&
      (s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)),
  );
  return [...starts, ...contains].slice(0, limit);
}

export function nameFor(symbol: string): string | null {
  const hit = COMMON_SYMBOLS.find((s) => s.symbol.toLowerCase() === symbol.trim().toLowerCase());
  return hit?.name ?? null;
}
