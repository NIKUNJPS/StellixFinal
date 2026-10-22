# Third-Party Notices

Stellix Labs is original code. This file credits open-source projects whose ideas or
code meaningfully influenced specific features, as required by their licenses or as
good practice even where not strictly required.

## TradingAgents (Batch 30 — Multi-Agent Desk)

- **Project:** [TradingAgents](https://github.com/TauricResearch/TradingAgents)
  (Xiao, Sun, Luo & Wang, *TradingAgents: Multi-Agents LLM Financial Trading
  Framework*, arXiv:2412.20138)
- **Author:** Tauric Research and TradingAgents contributors
- **License:** Apache License 2.0
- **Version used:** v0.5.1, pinned to commit `35543d0248bf89fcb92b17a15858ad0c0e940687`

Unlike OpenTerminal below, TradingAgents is used **as a dependency, unmodified**
(`requirements.txt`). Stellix code in `backend/app/agents/` drives its LangGraph
pipeline, agents, rating parser, settlement and reflection. No TradingAgents source
file is copied into this repository, and none is modified. See ADR 0009 for how it
is integrated (point-in-time regime context, Postgres memory, audit logging,
Safeguard 1 redaction of price levels).

Per the Apache License 2.0, a copy of the license is available at
<http://www.apache.org/licenses/LICENSE-2.0> and ships with the installed
`tradingagents` package. TradingAgents is provided "AS IS", without warranties or
conditions of any kind, and its authors state it is designed for research purposes
and is not financial, investment, or trading advice.

## OpenTerminal (Batch 28 — Market Research widgets; Batch 31 — Market Terminal)

> **Batch 31 update (ADR 0010).** The Market Terminal (`/terminal`) reproduces OpenTerminal's
> full feature set and UX concepts: widget workspace, ⌘K palette, ⌥-number shortcuts,
> charting, quote, news, screener, heatmap, options, crypto, macro, portfolio, calendar,
> insiders, short volume, recap, AI and TV. It is again a **native re-implementation**; no
> OpenTerminal source file is copied. Each feature is backed by an official or published
> source instead of OpenTerminal's `scanner.tradingview.com`, `api.nasdaq.com`, Forex
> Factory and hotlinked or restreamed TV sources. The feature-by-source table is in
> `docs/adr/0010-market-terminal-openterminal-parity.md`. The MIT notice below covers the
> concepts adopted.


- **Project:** [OpenTerminal](https://github.com/ErTasselli/OpenTerminal)
- **Author:** ErTasselli and OpenTerminal contributors
- **License:** MIT

Batch 28's Market Research page (Macro Dashboard, Screener, Sector Heatmap, and
candlestick Charting) was **inspired by** OpenTerminal's widget concepts. This is a
from-scratch, native Stellix implementation — a different language (Python/FastAPI
backend vs. OpenTerminal's Node/Express), different data sources (see below), and
Stellix's own design system throughout. No OpenTerminal source files were copied.

Two design choices were adapted from OpenTerminal's approach rather than its code:
- Using `lightweight-charts` (TradingView's own MIT-licensed charting library) for
  candlestick + indicator-overlay charting, the same library OpenTerminal uses, for
  the same reason (a general-purpose charting library doesn't do OHLC candlesticks
  well).
- FRED (Federal Reserve Economic Data) as the macro-dashboard data source — though
  Stellix uses FRED's official documented REST API with a registered key, not
  OpenTerminal's keyless CSV-graph endpoint.

Per the MIT License's requirement to retain the copyright and permission notice in
copies or substantial portions of the software, and as attribution for the concepts
adopted:

```
Copyright (c) 2026 OpenTerminal contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Features considered but deliberately NOT adopted from OpenTerminal

Several OpenTerminal widgets rely on reverse-engineered endpoints that power
commercial sites' own frontends rather than published, documented APIs — Stellix's
sourcing policy does not adopt these silently. Evaluated and rejected for this batch:

| OpenTerminal feature | Its real source | Why not adopted |
|---|---|---|
| Screener, Sector Heatmap | `scanner.tradingview.com` (internal endpoint; requires a spoofed browser `Referer`/`Origin` to avoid a 403) | Unofficial/reverse-engineered — no ToS clarity, no uptime guarantee. Stellix's Screener/Heatmap are built on `yfinance` instead. |
| Options Chain, Charting, Quote panel | `api.nasdaq.com/api/...` (internal endpoint; no key, spoofed browser headers, its own code admits *"no documented limit... stay gentle to avoid tripping bot-detection"*) | Unofficial/reverse-engineered. |
| Economic Calendar | `nfs.faireconomy.media/ff_calendar_thisweek.json` (its own code comment: *"Undocumented public feed"*) | Unofficial; out of scope this batch regardless. |
| News Feed | Yahoo Finance RSS / Google News RSS | Genuine public syndication feeds, not a scrape, but not a supported third-party API either; out of scope this batch. |

### `lightweight-charts`

- **Project:** [lightweight-charts](https://github.com/tradingview/lightweight-charts)
- **Author:** TradingView
- **License:** Apache License 2.0

Used directly as an npm dependency (`frontend/package.json`), not copied or modified.
Included here because it's the same library OpenTerminal uses for its charting widget.

## Alpaca Market Data API (real-time US ETF prices)

- **Provider:** [Alpaca](https://alpaca.markets) — official, documented API
  ([real-time stock data](https://docs.alpaca.markets/docs/real-time-stock-pricing-data),
  [streaming protocol](https://docs.alpaca.markets/docs/streaming-market-data))
- **Plan used:** the free *Basic* market-data plan. Per Alpaca's docs it provides
  real-time coverage from the **IEX exchange only** (not the consolidated tape),
  websocket subscriptions for 30 symbols, and a connection limit that "in many
  subscriptions (or without one) … is 1".
- **What Stellix does with it:** `app/streaming/etf_stream.py` holds one websocket to
  `wss://stream.data.alpaca.markets/v2/iex`, subscribes to trades for SPY, QQQ, DIA
  and IWM, and seeds each session's previous close from `GET /v2/stocks/snapshots`
  (`feed=iex`). Prices are shown as ETF prices with the index each ETF tracks as
  context — never as the index value itself — and labelled "IEX only".
- **Credentials:** the account and key pair belong to the project owner
  (`ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`); unset means the feature reports
  "not configured".
