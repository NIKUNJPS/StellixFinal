# 02 - Dataset and data provenance

> Covers checklist item **"Dataset and data provenance"**. Every number here is produced by
> `scripts/evaluation/export_evidence.py` from the live Meridian database (read-only);
> the machine-readable copies are in [`evidence/`](evidence/) (`data_provenance.csv`,
> `regime_distribution.csv`, `manifest.json`, `tables.md`).

## 1. Source and usage terms

| Item | Value |
|---|---|
| Price source | Yahoo Finance through the open-source `yfinance` wrapper (`app/providers/yfinance_provider.py`). `yfinance` is not affiliated with Yahoo. |
| Frequency | Daily bars only (`interval="1d"`). The platform does not ingest intraday data for research. |
| Fields | `timestamp` (UTC), `open`, `high`, `low`, `close`, `volume`, plus a `source` tag. |
| **Price adjustment** | **`auto_adjust=False`: raw OHLC, not adjusted for splits or dividends.** Consequences in section 5. |
| Storage | Postgres tables `market_data`, `feature_matrix`, `regime_labels`, scoped to one organization (`meridian-capital`, the seeded demo tenant). |
| Usage restrictions | Yahoo Finance data is governed by Yahoo's own terms of use, which restrict redistribution and commercial use (verify the current terms before any redistribution; this was not re-checked for this document). **No raw price data is included in this evidence pack**; only derived metrics are. Re-running requires re-downloading the data under those terms. |
| Other data in the product (not used in any experiment here) | SEC EDGAR filings (public), FRED, CoinGecko, ECB, FINRA Reg SHO, RSS news. They feed the Market Terminal and the multi-agent desk, not the regime / validation / evolution experiments. |

## 2. Two universes

The store holds two populations that must not be confused:

| Universe | Symbols | Bars per symbol | Used for |
|---|---|---|---|
| **Research** | `SPY`, `QQQ`, `GLD`, `BTC-USD`, `ETH-USD` | 819 to 2,849 (multi-year) | Every strategy backtest, validation run, evolution run and experiment in this pack |
| **Screener** | 518 further symbols (US large caps and ETFs) | median 564 (about two years; first bar 2024-07-23, last 2026-10-20) | Terminal screener and regime tagging only. **Never used for strategy research.** |

Research universe, as stored (from `evidence/tables.md`):

| symbol | bars | first bar | last bar | source | gaps > 4 days | max gap (days) | zero-volume bars | feature rows | sma_50 warm-up nulls | regime rows |
|---|---|---|---|---|---|---|---|---|---|---|
| BTC-USD | 2,849 | 2019-01-01 | 2026-10-19 | yfinance | 0 | 1 | 0 | 2,849 | 228 | 2,829 |
| ETH-USD | 819 | 2024-07-23 | 2026-10-19 | yfinance | 0 | 1 | 0 | 819 | 172 | 799 |
| GLD | 1,961 | 2019-01-02 | 2026-10-20 | yfinance | 0 | 4 | 0 | 1,961 | 203 | 1,941 |
| QQQ | 1,961 | 2019-01-02 | 2026-10-20 | yfinance | 0 | 4 | 0 | 1,961 | 203 | 1,941 |
| SPY | 2,715 | 2016-01-04 | 2026-10-20 | yfinance | 0 | 4 | 0 | 2,715 | 114 | 2,695 |

Notes on what the table shows (and does not):

- Start dates differ by symbol. The demo seed script (`scripts/seed_demo_data.py`) nominally ingests
  2019-01-01 to 2024-12-31 for SPY, QQQ, GLD and BTC-USD; the stored data extends to October 2026
  because later refresh jobs appended newer bars, and SPY goes back to 2016 from an earlier ingestion.
  The stored range, not the seed's nominal range, is what the experiments used.
- Equities and ETFs have no gaps over 4 calendar days (weekends and holidays only); crypto trades every
  day (maximum gap 1 day).
- **`sma_50` warm-up nulls exceed the 49 expected for a single series** (BTC-USD 228, GLD/QQQ 203, ETH 172,
  SPY 114). A plausible but unconfirmed explanation is that features were computed per ingestion batch, so
  the warm-up gap recurs at each batch boundary. This was not investigated further. Effect: indicator-based
  rules cannot fire on those rows (NaN comparisons are false), which slightly reduces trade opportunities.

## 3. Preprocessing and missing-data handling

Ingestion (`app/services/ingestion.py`, `validate_and_clean`). The policy is "reject and log, never
silently proceed":

1. Rows with NaN open/high/low/close are dropped (a warning is raised if the dropped share exceeds
   `DATA_NAN_TOLERANCE`).
2. Duplicate timestamps for a symbol: keep the latest.
3. OHLC sanity violations (high < low, high below open/close, low above open/close, non-positive prices,
   negative volume): rows dropped, first five timestamps logged.
4. Timestamp gaps larger than interval x `DATA_GAP_INTERVAL_MULTIPLIER`: **warn only** (partial data is kept).

Nothing is forward-filled or interpolated.

Features (`app/features/engineering.py`). Thirteen columns, all strictly trailing (a feature at time T
uses data from T and earlier; asserted by `tests/test_lookahead.py`): `log_return`, `sma_20`, `sma_50`,
`ema_12`, `ema_26`, `rsi_14`, `macd` (12/26/9), `macd_signal`, `atr_14`, `bollinger_upper` /
`bollinger_lower` (20, 2 sd), `realized_vol_20` (std of trailing 20 log returns) and `autocorr_5`
(lag-5 autocorrelation over a trailing 30-bar window). Indicator math comes from the `ta` library.
Warm-up rows are `NaN` and are never back-filled.

Regime labels: see [03-experimental-protocol.md](03-experimental-protocol.md) section 2. The detectors use
only `log_return` and `realized_vol_20`; rows missing either are dropped (hence regime rows are 20 fewer
than feature rows).

## 4. Regime label statistics (research universe)

Shares of bars by final ensemble label, from `regime_distribution.csv`:

| symbol | Bear | Bull | Crisis | High-Volatility | Low-Volatility | Sideways |
|---|---|---|---|---|---|---|
| BTC-USD | 0.1% | 8.7% | 4.9% | 24.5% | 61.8% | 0.1% |
| ETH-USD | 1.0% | 0.9% | 4.8% | 16.2% | 40.8% | 36.4% |
| GLD | 0.9% | 25.4% | 5.5% | 19.4% | 48.8% | 0.0% |
| QQQ | 1.8% | 3.3% | 4.8% | 30.0% | 59.9% | 0.2% |
| SPY | 3.2% | 9.4% | 4.9% | 21.9% | 60.6% | 0.0% |

The distribution is heavily skewed toward Low-Volatility (41-62%), and Bear and Sideways are nearly empty
for most symbols. That is a property of the labeling rules (the discrete-state models always assign the
lowest-volatility state "Low-Volatility" and the highest "High-Volatility"; the remaining two states
become Bull / Bear / Sideways by mean-return sign), not evidence that bear markets were rare. It also
means per-regime statistics for Bear, Sideways and Crisis rest on very few trades.

## 5. Known data limitations

1. **Unadjusted prices.** Returns are price returns without dividends. For SPY, QQQ and GLD (no splits in
   the window) this understates buy-and-hold by roughly the dividend yield, and the strategies are
   evaluated on the same basis, so strategy-versus-buy-and-hold comparisons are like-for-like but
   understate both. For stocks with splits (for example NVDA), raw prices contain artificial jumps; no
   strategy research was run on such symbols, but the Terminal and multi-agent desk do display them.
2. **Survivorship bias in the screener universe.** The 518 screener symbols look like current index
   members; delisted names are absent. Not used in any experiment.
3. **Single vendor, free data.** No cross-check against a second source was performed.
4. **Regime labels are not point-in-time** (fit on the full history; see protocol section 2).
5. **Daily bars only.** No intraday execution, no bid/ask, no market impact.
6. **Seeded organization.** The Meridian tenant is a demo organization built by `scripts/seed_demo_data.py`
   and the follow-up scripts listed in `docs/PLATFORM_STATE.md`. Strategy lifecycle states (active /
   failed / retired) in it are partly staged; see [04-results.md](04-results.md) section 4 and the
   provenance column in `evidence/failures.csv`.
