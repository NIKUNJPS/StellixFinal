# ADR 0010: Market Terminal — OpenTerminal feature parity on official sources

- **Status:** Accepted
- **Date:** 2026-09-29
- **Batch:** 31

## Context

The project owner asked for every feature of [OpenTerminal](https://github.com/ErTasselli/OpenTerminal)
(MIT, local copy `D:\Tauric\OpenTerminal` at `95618ee`) to be integrated into the Stellix
dashboard at production grade. Batch 28 already built four widgets inspired by an earlier
OpenTerminal: Macro, Screener, Heatmap, and Charting. Since then OpenTerminal has grown to 16
widgets and 12 data providers.

OpenTerminal sources much of its data from **internal endpoints of other companies'
websites**, reached by spoofing a browser `Origin`/`Referer`:

- `scanner.tradingview.com` and `symbol-search.tradingview.com`
- `api.nasdaq.com` (quotes, charts, options, earnings)
- Yahoo's crumb/cookie flow

Its README says these sources are generally licensed "for personal/research use only" and
prohibit commercial redistribution. Stellix is a paid, multi-tenant SaaS, and Batch 28
already recorded, in `docs/schemas.md` and `THIRD_PARTY_NOTICES.md`, that none of those
sources would be adopted. Its TV widget hotlinks broadcaster CDNs and restreams CNBC through
`tier1streams.com`, an unauthorised rebroadcaster.

## Decision

**Every OpenTerminal feature is built. Each one is backed by an official or published
source, or by `yfinance`, which Stellix already uses platform-wide.** Every source below was
probed live on 2026-09-28 before any code was written.

| OpenTerminal feature | OpenTerminal source | Stellix source |
|---|---|---|
| Widget workspace (drag/resize/add/remove, saved layout) | localStorage | `react-grid-layout` with the layout **saved server-side per user** (`terminal_workspaces`), so it follows you across devices |
| ⌘K symbol search | TradingView symbol search → Yahoo | yfinance `Search`, plus the **SEC company ticker list** (official) |
| Charting: candle/bar/line/area, 8 timeframes, SMA/EMA/VWAP/BB/RSI/MACD, hover legend | Nasdaq chart API | yfinance. Intraday ranges (1D, 5D, 1M) are now offered with their real interval shown, and indicators come from the shared `compute_features`. Intraday VWAP is a true session VWAP; on daily bars it is the rolling 20-bar VWAP, labelled as such. |
| Quote panel (bid/ask, OHLC, mkt cap, P/E, EPS, yield, 52w, beta, shares) | Nasdaq + TradingView scanner | yfinance `Ticker.info` |
| News (aggregated, de-duplicated, per symbol or global) | Yahoo RSS → Google News RSS | The same **published RSS feeds**. Headline, publisher, time and link are shown; article text is never copied. |
| Full-market screener and live heatmap sized by market cap | TradingView scanner | The bounded Stellix screener universe, now with **market cap = SEC XBRL shares outstanding × price** (official bulk "frames" API). It stays labelled as a bounded universe, not the full market. |
| Options chain | Nasdaq option-chain → Yahoo | yfinance chain, plus **Black-Scholes Greeks** (OpenTerminal's own roadmap item). A zero bid/ask from the provider is shown as "no quote", never as 0. |
| Crypto board (sparklines, BTC/ETH dominance), candles, order book | CoinGecko, Binance | The same: both are **documented public APIs**. Binance uses its market-data-only host `data-api.binance.vision`. |
| Macro: yield curve, VIX, index/commodity proxies, ECB | FRED CSV-graph shortcut, ECB | Existing FRED **API** (keyed), plus the **ECB Data Portal API** (official) and commodity/FX/rates proxies via yfinance |
| Portfolio tracker (transactions, average cost, realized/unrealized P&L) | SQLite | Postgres, tenant-scoped, per user. It also **feeds the Agent Desk** as the run's portfolio. |
| Economic calendar (schedule, forecast, previous, actual) | Forex Factory feed + FRED | **FRED release-dates API** plus actuals from FRED series. Consensus forecasts have no official free source, so none are shown (not faked). |
| Earnings calendar and history (estimate vs actual, surprise, next-day move) | TradingView + Nasdaq | yfinance calendar / `earnings_dates`. The next-day move is computed from real daily closes. |
| Insider transactions | SEC EDGAR Form 4 | The same (**official**). Needs `SEC_EDGAR_USER_AGENT`, as SEC requires. |
| Short volume | FINRA Reg SHO daily files | The same (**official**), with a 10-session history instead of one day |
| Market recap | Mixed | Built from Stellix's own cached indices, screener and news. The summary is a **deterministic template**, not an LLM. |
| AI assistant, context-aware | Anthropic direct | The existing Research Assistant chat (cost router, Safeguard 1, audit log). It now gets a server-built context block: quote, **Stellix regime**, and headlines. |
| Live TV | Hotlinked CDNs / unauthorised restreams | **Official YouTube live embeds** of each broadcaster's own channel, configurable |
| Near-real-time flash on change, keyboard shortcuts (⌘K, ⌥1–⌥9) | Client | Same, client-side. Every widget shows its data delay; nothing is called real-time that isn't. |
| Price alerts with notifications | Roadmap only | **Built.** A Celery beat check every 60 s on the realtime queue. It creates a Stellix notification and an org-scoped `price_alert` WS event. |

### Not adopted

- TradingView and Nasdaq internal endpoints, and the Forex Factory feed (see Context).
- Hotlinked or restreamed TV.
- OpenTerminal's own shared-secret API key auth. Stellix's JWT/RBAC, rate limiting and
  tenant isolation already cover every endpoint.

### Engineering rules

- Global market data lives under non-org Redis keys, cached with a TTL plus a stale
  fallback. If a refresh fails, the last good value is served, marked `stale: true` with
  its age, and never presented as fresh.
- Every external call runs in a worker thread with a timeout, so the event loop never
  blocks. Multi-source aggregates (recap, market caps, FINRA files) are warmed by Celery
  beat so requests read from cache.
- User data (workspace, watchlists, holdings, alerts) uses `TenantScopedModel` **and** an
  owner check. Another member of the same org cannot read or change your book.
- Every response names its source and delay.

## Consequences

- New tables (migration `0027`): `terminal_workspaces`, `terminal_watchlists`,
  `holding_portfolios`, `holding_transactions`, `price_alerts`. There is also a new
  `notification_type` value, `price_alert`.
- New frontend dependency: `react-grid-layout`.
- `SEC_EDGAR_USER_AGENT` now also gates insider data and market-cap sizing
  (deferred-credential pattern). Without it, those widgets say "not configured" and the
  heatmap falls back to dollar-volume sizing, labelled.
- OpenTerminal (MIT) is credited in `THIRD_PARTY_NOTICES.md` for the feature set and UX.
  No OpenTerminal source file is copied.
