# Third-Party Notices

Stellix Labs is original code. This file credits open-source projects whose ideas or
code meaningfully influenced specific features, as required by their licenses or as
good practice even where not strictly required.

## OpenTerminal (Batch 28 — Market Research widgets)

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
