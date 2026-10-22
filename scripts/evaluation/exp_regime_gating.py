"""Experiment A - does regime conditioning help OUT OF SAMPLE?

Question
    A strategy's backtest can be partitioned by the regime at each trade's entry. If you learn which
    regimes a strategy earns money in using only the EARLIER part of history, does restricting it to
    those regimes improve its results on LATER, unseen data - and by more than restricting it to
    randomly chosen regimes would?

Protocol (fixed in advance; nothing was tuned after seeing results)
    * Strategies: every human-authored strategy, de-duplicated by (symbol, rules, risk). GA-evolved variants
      are excluded because they were tuned on the full history.
    * Split: chronological, first 60% = train, last 40% = test (per symbol). No shuffling.
    * Train: run the platform's regime-aware backtest on the train slice; "allowed regimes" = regimes with
      >= 3 trades and a positive per-trade Sharpe (the platform's own per-regime partition).
    * Test: run the same strategy (a) ungated, (b) gated - entry signals masked to allowed regimes (exits and
      stops unchanged), (c) gated on every other subset of regimes of the same size (the random control),
      (d) buy-and-hold of the symbol. Same engine settings as production: 0.1% fees, 100k initial cash,
      the strategy's own stop-loss/position size, daily bars.
    * Statistics: paired differences across strategies, Wilcoxon signed-rank (two-sided), bootstrap 95% CI
      (10,000 resamples, seed 42). The informed-vs-random percentile tests whether the learned regime set
      beats chance.

Known limitations (also stated in docs/evaluation/05-baselines-and-ablations.md)
    * Regime labels come from models fit on the full history (see 03-protocol), so test-period labels are
      smoothed, not point-in-time. This can flatter any regime-conditioned result.
    * Few, correlated strategies (several share a signal); symbols overlap. Treat p-values as descriptive.

Usage: backend\\.venv\\Scripts\\python.exe scripts\\evaluation\\exp_regime_gating.py
"""
from __future__ import annotations

import itertools
import json
import multiprocessing as mp
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402


def _risk(strategy: dict) -> tuple[float | None, float | None]:
    r = strategy.get("risk_constraints") or {}
    sl = float(r["stop_loss_pct"]) / 100.0 if r.get("stop_loss_pct") is not None else None
    size = float(r["max_position_size_pct"]) / 100.0 if r.get("max_position_size_pct") is not None else None
    return sl, size


def run_masked(strategy: dict, df: pd.DataFrame, rdf: pd.DataFrame, allowed):
    import vectorbt as vbt

    from app.strategy.backtest import DEFAULT_FEES, DEFAULT_INIT_CASH
    from app.strategy.dsl import generate_signals

    df = df.sort_index()
    entries = generate_signals(strategy.get("entry_rules") or {}, df)
    exits = generate_signals(strategy.get("exit_rules") or {}, df)
    if allowed is not None:
        reg = rdf.drop_duplicates("timestamp").set_index("timestamp")["regime_label"].reindex(df.index)
        entries = entries & reg.isin(list(allowed)).fillna(False)
    sl, size = _risk(strategy)
    pf = vbt.Portfolio.from_signals(
        df["close"].astype(float), entries, exits, init_cash=DEFAULT_INIT_CASH, fees=DEFAULT_FEES, sl_stop=sl,
        size=size, size_type="percent" if size is not None else "amount", freq=pd.infer_freq(df.index) or "1D",
    )
    eq = pf.value()
    rets = pf.returns()
    std = rets.std(ddof=1)
    return {
        "total_return": float(eq.iloc[-1] / eq.iloc[0] - 1.0),
        "max_drawdown": float((eq / eq.cummax() - 1.0).min()),
        "trades": int(pf.trades.count()),
        "sharpe_daily_ann": float(rets.mean() / std * np.sqrt(252)) if std and std > 0 else 0.0,
    }


def buy_and_hold(df: pd.DataFrame):
    close = df.sort_index()["close"].astype(float)
    r = close.pct_change().dropna()
    eq = close / close.iloc[0]
    return {
        "total_return": float(eq.iloc[-1] - 1.0), "max_drawdown": float((eq / eq.cummax() - 1.0).min()),
        "sharpe_daily_ann": float(r.mean() / r.std(ddof=1) * np.sqrt(252)),
    }


def one_strategy(strategy: dict) -> dict:
    from app.strategy.backtest import run_regime_aware_backtest

    sym = strategy["symbol"]
    feature_df, regime_df = C.load_frames(sym)
    tf, tr, sf, sr = C.split_frames(feature_df, regime_df)
    out = {"strategy": strategy["name"], "symbol": sym, "status": strategy["status"],
           "train_bars": len(tf), "test_bars": len(sf), "test_start": str(sf.index.min().date())}

    train = run_regime_aware_backtest(strategy, tf, tr)
    out["train_trades"] = int(train.aggregate.get("trade_count", 0))
    out["train_sharpe_per_trade"] = train.aggregate.get("sharpe_ratio")
    allowed = sorted(r for r, m in train.per_regime.items()
                     if m["trade_count"] >= 3 and (m["sharpe_ratio"] or 0) > 0)
    out["allowed_regimes"] = "|".join(allowed)

    base = run_masked(strategy, sf, sr, None)
    out.update({f"ungated_{k}": v for k, v in base.items()})
    bh = buy_and_hold(sf)
    out.update({f"buyhold_{k}": v for k, v in bh.items()})
    # Strategies cap each position at max_position_size_pct of equity (15-20% here), so a 100%-invested
    # buy-and-hold is not like-for-like. Size-matched baseline = that fraction of the buy-and-hold return.
    size_frac = _risk(strategy)[1] or 1.0
    out["position_size_fraction"] = size_frac
    out["buyhold_size_matched_total_return"] = size_frac * bh["total_return"]

    regs = sorted(set(tr["regime_label"]))
    k = len(allowed)
    out["regimes_seen_in_train"] = len(regs)
    out["gate_state"] = ("no_allowed_regime" if k == 0 else "inert_all_regimes_allowed" if k >= len(regs) else "active")
    if k == 0:
        gated = {"total_return": 0.0, "max_drawdown": 0.0, "trades": 0, "sharpe_daily_ann": 0.0}  # stays in cash
    elif k >= len(regs):
        gated = base
    else:
        gated = run_masked(strategy, sf, sr, allowed)
    out.update({f"gated_{k_}": v for k_, v in gated.items()})

    # Random control: every other subset of regimes of the same size (capped at 30, fixed seed).
    pct = None
    if 0 < k < len(regs):
        subsets = [c for c in itertools.combinations(regs, k)]
        if len(subsets) > 30:
            rng = np.random.default_rng(C.SEED)
            subsets = [subsets[i] for i in rng.choice(len(subsets), size=30, replace=False)]
        rets = [run_masked(strategy, sf, sr, s)["total_return"] for s in subsets]
        informed = gated["total_return"]

        def percentile(values: list[float]) -> float:
            below = sum(1 for x in values if x < informed - 1e-12)
            ties = sum(1 for x in values if abs(x - informed) <= 1e-12)
            return (below + 0.5 * ties) / len(values)

        pct = percentile(rets)
        out["random_subsets"] = len(rets)
        out["random_mean_return"] = float(np.mean(rets))
        # Exposure-matched control: informed regime sets tend to contain the most common regime, i.e. more
        # time in the market. Compare only against random subsets covering a similar share of test bars.
        reg_test = sr.drop_duplicates("timestamp").set_index("timestamp")["regime_label"].reindex(sf.index)
        share = lambda sub: float(reg_test.isin(list(sub)).mean())  # noqa: E731
        informed_share = share(allowed)
        matched = [r for s, r in zip(subsets, rets, strict=False) if abs(share(s) - informed_share) <= 0.10]
        out["informed_bar_share"] = informed_share
        out["matched_subsets"] = len(matched)
        out["informed_percentile_vs_exposure_matched"] = percentile(matched) if len(matched) >= 3 else None
    out["informed_percentile_vs_random"] = pct
    return out


def main() -> None:
    strategies = [s for s in C.unique_human_strategies() if s["symbol"] in {"SPY", "QQQ", "GLD", "BTC-USD"}]
    for sym in sorted({s["symbol"] for s in strategies}):
        C.load_frames(sym)  # warm the cache in the parent so workers never touch the database
    print(f"{len(strategies)} unique strategies", flush=True)
    with mp.get_context("spawn").Pool(processes=min(10, len(strategies))) as pool:
        rows = []
        for i, r in enumerate(pool.imap_unordered(one_strategy, strategies), 1):
            rows.append(r)
            print(f"  [{i}/{len(strategies)}] {r['strategy'][:44]:44s} gate={r['gate_state']}", flush=True)
    df = pd.DataFrame(rows).sort_values(["symbol", "strategy"]).reset_index(drop=True)
    df.to_csv(os.path.join(C.EVIDENCE, "exp_regime_gating.csv"), index=False)

    from scipy import stats

    def paired(sub: pd.DataFrame, a: str, b: str) -> dict:
        d = (sub[a] - sub[b]).to_numpy(dtype=float)
        res = {"n": int(len(d)), "mean_diff": float(d.mean()) if len(d) else None,
               "median_diff": float(np.median(d)) if len(d) else None,
               "better": int((d > 1e-12).sum()), "worse": int((d < -1e-12).sum()), "tied": int((np.abs(d) <= 1e-12).sum())}
        if len(d) >= 2:
            res["bootstrap_95ci_mean_diff"] = C.bootstrap_ci(d)
        nz = d[np.abs(d) > 1e-12]
        res["wilcoxon_p"] = float(stats.wilcoxon(nz).pvalue) if len(nz) >= 6 else None
        return res

    summary = {"design": "train first 60% / test last 40%, per symbol; see script docstring", "n_strategies": int(len(df)),
               "gate_state_counts": df["gate_state"].value_counts().to_dict()}
    for label, sub in (("all", df), ("active_gate_only", df[df["gate_state"] == "active"])):
        summary[label] = {
            "gated_minus_ungated_total_return": paired(sub, "gated_total_return", "ungated_total_return"),
            "gated_minus_ungated_max_drawdown(less negative=better)": paired(sub, "gated_max_drawdown", "ungated_max_drawdown"),
            "gated_minus_buyhold_total_return(100% invested)": paired(sub, "gated_total_return", "buyhold_total_return"),
            "ungated_minus_buyhold_total_return(100% invested)": paired(sub, "ungated_total_return", "buyhold_total_return"),
            "ungated_minus_buyhold_size_matched_total_return": paired(sub, "ungated_total_return", "buyhold_size_matched_total_return"),
            "gated_minus_buyhold_size_matched_total_return": paired(sub, "gated_total_return", "buyhold_size_matched_total_return"),
            "ungated_minus_buyhold_daily_sharpe": paired(sub, "ungated_sharpe_daily_ann", "buyhold_sharpe_daily_ann"),
            "gated_minus_ungated_daily_sharpe": paired(sub, "gated_sharpe_daily_ann", "ungated_sharpe_daily_ann"),
        }

    def percentile_block(col: str) -> dict | None:
        act = df[df[col].notna()]
        if not len(act):
            return None
        p = act[col].to_numpy(dtype=float)
        return {"n": int(len(p)), "mean_percentile": float(p.mean()), "share_above_median": float((p > 0.5).mean()),
                "wilcoxon_vs_0.5_p": float(stats.wilcoxon(p - 0.5).pvalue) if len(p) >= 6 and np.any(p != 0.5) else None}

    summary["informed_vs_random_regime_choice"] = percentile_block("informed_percentile_vs_random")
    summary["informed_vs_exposure_matched_random"] = percentile_block("informed_percentile_vs_exposure_matched")
    summary["test_period_buyhold_total_return_by_symbol"] = (
        df.groupby("symbol")["buyhold_total_return"].first().to_dict())
    with open(os.path.join(C.EVIDENCE, "exp_regime_gating_summary.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
