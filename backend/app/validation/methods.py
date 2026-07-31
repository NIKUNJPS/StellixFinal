"""The five validation methods (SRC report §11). Each returns (sub_score, passed, details).

Every sub-score is a real 0–1 value (not just pass/fail) so the composite keeps the
information. The exact formula for each is documented at its function.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

PRIMARY_REGIMES = ["Bull", "Bear", "High-Volatility", "Low-Volatility"]


def _safe_histogram(values: np.ndarray, bins: int = 30) -> tuple[np.ndarray, np.ndarray]:
    """np.histogram that tolerates degenerate (near-constant) data.

    When the value range is too small to split into ``bins`` finite-sized buckets
    (e.g. all-identical simulated Sharpes), return a single bucket holding everything.
    """
    values = np.asarray(values, dtype=float)
    lo, hi = float(values.min()), float(values.max())
    span = hi - lo
    if not np.isfinite(span) or span <= abs(hi) * 1e-9 + 1e-12:
        edge = max(abs(lo) * 1e-6, 1e-6)
        return np.array([len(values)]), np.array([lo, lo + edge])
    return np.histogram(values, bins=bins, range=(lo, hi))

# Known historical stress windows, auto-detected from the data's date coverage.
KNOWN_STRESS_WINDOWS = [
    ("covid_2020", "2020-02-15", "2020-04-30"),
    ("rate_hike_2022", "2022-01-01", "2022-10-31"),
]


# --------------------------------------------------------------------------- #
# 1. Walk-Forward Validation (weight 30%)
# --------------------------------------------------------------------------- #
def walk_forward(
    strategy: dict,
    feature_df: pd.DataFrame,
    regime_df: pd.DataFrame,
    *,
    n_folds: int = 5,
    min_oos_sharpe: float = 0.5,
    min_bars: int = 15,
) -> tuple[float, bool, dict]:
    """Expanding-window walk-forward. Fold 0 is the initial in-sample block; folds
    1..N-1 are held-out FORWARD test periods. Since the rules are fixed (no fitting),
    "training" is a no-op — each test fold measures genuine out-of-sample Sharpe.

    sub_score = fraction of test folds with OOS Sharpe > ``min_oos_sharpe``.
    passed    = sub_score > 0.5 (majority of folds).
    """
    from app.strategy.backtest import run_regime_aware_backtest

    df = feature_df.sort_index()
    n = len(df)
    folds: list[dict] = []
    for i in range(1, n_folds):
        lo, hi = i * n // n_folds, (i + 1) * n // n_folds
        test = df.iloc[lo:hi]
        rec = {
            "fold": i,
            "period_start": str(test.index.min()) if len(test) else None,
            "period_end": str(test.index.max()) if len(test) else None,
            "trade_count": 0,
            "oos_sharpe": None,
            "passed": False,
        }
        if len(test) >= min_bars:
            rslice = regime_df[
                (regime_df["timestamp"] >= test.index.min())
                & (regime_df["timestamp"] <= test.index.max())
            ]
            res = run_regime_aware_backtest(strategy, test, rslice)
            sharpe = res.aggregate.get("sharpe_ratio")
            rec["oos_sharpe"] = sharpe
            rec["trade_count"] = res.aggregate.get("trade_count", 0)
            rec["passed"] = sharpe is not None and sharpe > min_oos_sharpe
        folds.append(rec)

    num = len(folds)
    passing = sum(1 for f in folds if f["passed"])
    sub = passing / num if num else 0.0
    return sub, sub > 0.5, {"n_folds": n_folds, "test_folds": num, "passing": passing, "folds": folds}


# --------------------------------------------------------------------------- #
# 2. Regime-Based Cross-Validation (weight 30%)
# --------------------------------------------------------------------------- #
def regime_cv(per_regime: dict[str, dict]) -> tuple[float, bool, dict]:
    """Reuse the regime-partitioned backtest. Only the 4 PRIMARY regimes count here
    (Crisis/Sideways are secondary per the SRC spec).

    sub_score = (# primary regimes with a positive Sharpe) / 4.
    passed    = positive Sharpe in >= 2 of the 4 primary regimes.
    """
    details: dict[str, dict] = {}
    positives: list[str] = []
    for regime in PRIMARY_REGIMES:
        m = per_regime.get(regime)
        trade_count = m["trade_count"] if m else 0
        sharpe = m.get("sharpe_ratio") if m else None
        positive = trade_count > 0 and sharpe is not None and sharpe > 0
        if positive:
            positives.append(regime)
        details[regime] = {"trade_count": trade_count, "sharpe_ratio": sharpe, "positive": positive}
    sub = len(positives) / len(PRIMARY_REGIMES)
    return sub, len(positives) >= 2, {"primary_regimes": details, "positive_count": len(positives)}


# --------------------------------------------------------------------------- #
# 3. Monte Carlo Simulation (weight 20%)
# --------------------------------------------------------------------------- #
def monte_carlo(
    trades_df: pd.DataFrame,
    *,
    tolerance: float,
    n_sims: int = 1000,
    seed: int = 42,
) -> tuple[float, bool, dict]:
    """Bootstrap-resample trade returns WITH replacement, SEGMENTED by regime (each
    trade is replaced by a draw from its own regime's pool, preserving chronology so
    the drawdown sequence is meaningful and regime contexts are never mixed).

    sub_score = clip(1 - p95_drawdown / (2 * tolerance), 0, 1)
                → 1.0 at p95=0, 0.5 at p95=tolerance, 0.0 at p95>=2*tolerance.
    passed    = 95th-percentile worst-case drawdown <= tolerance.
    """
    if trades_df is None or len(trades_df) == 0:
        return 0.0, False, {"applicable": True, "n_simulations": 0, "reason": "no trades"}

    rng = np.random.default_rng(seed)
    labels = trades_df["regime"].fillna("__none__").to_numpy()
    rets = trades_df["return"].to_numpy(dtype=float)
    n = len(rets)
    pools = {lab: rets[labels == lab] for lab in np.unique(labels)}

    sim = np.empty((n_sims, n))
    for k in range(n):
        sim[:, k] = rng.choice(pools[labels[k]], size=n_sims)

    means = sim.mean(axis=1)
    stds = sim.std(axis=1, ddof=1) if n > 1 else np.zeros(n_sims)
    # Treat float-noise-level std as zero so constant returns give Sharpe 0, not 1e15.
    valid = stds > 1e-12
    sharpes = np.where(valid, means / np.where(valid, stds, 1.0), 0.0)
    equity = np.cumprod(1.0 + sim, axis=1)
    peak = np.maximum.accumulate(equity, axis=1)
    dd_mag = -(equity / peak - 1.0).min(axis=1)  # positive magnitudes

    p95 = float(np.percentile(dd_mag, 95))
    sub = float(np.clip(1.0 - p95 / (2.0 * tolerance), 0.0, 1.0))
    passed = p95 <= tolerance

    sh_counts, sh_edges = _safe_histogram(sharpes, bins=30)
    dd_counts, dd_edges = _safe_histogram(dd_mag, bins=30)
    details = {
        "applicable": True,
        "n_simulations": n_sims,
        "tolerance": tolerance,
        "p95_drawdown": p95,
        "median_sharpe": float(np.median(sharpes)),
        "p05_sharpe": float(np.percentile(sharpes, 5)),
        "sharpe_hist": {"counts": sh_counts.tolist(), "edges": sh_edges.tolist()},
        "drawdown_hist": {"counts": dd_counts.tolist(), "edges": dd_edges.tolist()},
    }
    return sub, passed, details


# --------------------------------------------------------------------------- #
# 4. Persistence Filtering (weight 10%)
# --------------------------------------------------------------------------- #
def persistence(
    trades_df: pd.DataFrame,
    feature_df: pd.DataFrame,
    regime_df: pd.DataFrame,
    *,
    seed: int = 42,
    alpha: float = 0.05,
    n_random: int = 500,
    min_trades: int = 3,
) -> tuple[float, bool, dict]:
    """Within each regime, t-test the strategy's realized returns against a random-entry
    benchmark (same # trades, random timing WITHIN the regime, same holding-period
    distribution). A genuine random strategy fails this; a real edge is significant.

    sub_score = clip(1 - min_p / (2 * alpha), 0, 1) over regimes where the strategy beats
                random → 1.0 at p=0, 0.5 at p=alpha, 0.0 at p>=2*alpha.
    passed    = a significant edge (p < alpha AND strategy mean > random mean) in >= 1 regime.
    """
    from scipy import stats

    if trades_df is None or len(trades_df) == 0:
        return 0.0, False, {"applicable": True, "reason": "no trades", "regimes": {}}

    rng = np.random.default_rng(seed)
    close = feature_df["close"].to_numpy(dtype=float)
    regime_by_ts = (
        regime_df.set_index("timestamp")["regime_label"]
        if "timestamp" in regime_df.columns
        else regime_df["regime_label"]
    )
    regime_at_pos = np.array([regime_by_ts.get(ts) for ts in feature_df.index], dtype=object)

    details: dict[str, dict] = {}
    edge_p_values: list[float] = []
    for regime in sorted({r for r in trades_df["regime"].dropna()}):
        grp = trades_df[trades_df["regime"] == regime]
        strat_ret = grp["return"].to_numpy(dtype=float)
        holds = grp["holding_bars"].to_numpy(dtype=int)
        k = len(strat_ret)
        if k < min_trades:
            details[str(regime)] = {"n_trades": k, "tested": False, "reason": "too few trades"}
            continue

        regime_positions = np.where(regime_at_pos == regime)[0]
        random_returns: list[float] = []
        for _ in range(n_random):
            h = int(rng.choice(holds))
            candidates = regime_positions[regime_positions < len(close) - h - 1]
            if len(candidates) == 0:
                continue
            e = int(rng.choice(candidates))
            random_returns.append(close[e + h] / close[e] - 1.0)
        if len(random_returns) < 5:
            details[str(regime)] = {"n_trades": k, "tested": False, "reason": "insufficient random entries"}
            continue

        rand = np.array(random_returns)
        _t, p = stats.ttest_ind(strat_ret, rand, equal_var=False)
        p = float(np.nan_to_num(p, nan=1.0))
        edge = float(strat_ret.mean()) > float(rand.mean())
        significant = p < alpha and edge
        if edge:
            edge_p_values.append(p)
        details[str(regime)] = {
            "n_trades": k,
            "strategy_mean": float(strat_ret.mean()),
            "random_mean": float(rand.mean()),
            "p_value": p,
            "significant": bool(significant),
            "tested": True,
        }

    if not edge_p_values:
        return 0.0, False, {"applicable": True, "regimes": details, "min_p": None, "alpha": alpha}
    min_p = min(edge_p_values)
    sub = float(np.clip((2 * alpha - min_p) / (2 * alpha), 0.0, 1.0))
    passed = any(d.get("significant") for d in details.values())
    return sub, passed, {"applicable": True, "regimes": details, "min_p": float(min_p), "alpha": alpha}


# --------------------------------------------------------------------------- #
# 5. Out-of-Sample Stress Test (weight 10%, N/A → excluded & renormalized)
# --------------------------------------------------------------------------- #
def stress_test(
    strategy: dict,
    feature_df: pd.DataFrame,
    regime_df: pd.DataFrame,
    *,
    tolerance: float,
    min_bars: int = 10,
) -> tuple[float | None, bool | None, dict]:
    """Backtest against known stress windows the data actually covers. If the data
    covers NONE, return (None, None, applicable=False) so the composite renormalizes
    the other four weights rather than penalizing the strategy.

    per-window score = clip(1 - drawdown_magnitude / (2 * tolerance), 0, 1); the sub-score
    is the mean across covered windows. passed = sub_score >= 0.5.
    """
    from app.strategy.backtest import run_regime_aware_backtest

    if len(feature_df) == 0:
        return None, None, {"applicable": False, "reason": "no data"}

    covered: list[dict] = []
    checked: list[dict] = []
    for name, start, end in KNOWN_STRESS_WINDOWS:
        ws, we = pd.Timestamp(start, tz="UTC"), pd.Timestamp(end, tz="UTC")
        window = feature_df[(feature_df.index >= ws) & (feature_df.index <= we)]
        checked.append({"name": name, "bars_in_window": len(window)})
        if len(window) >= min_bars:
            rslice = regime_df[
                (regime_df["timestamp"] >= window.index.min())
                & (regime_df["timestamp"] <= window.index.max())
            ]
            res = run_regime_aware_backtest(strategy, window, rslice)
            dd = res.aggregate.get("max_drawdown") or 0.0
            score = float(np.clip(1.0 - (-dd) / (2.0 * tolerance), 0.0, 1.0))
            covered.append(
                {
                    "name": name,
                    "max_drawdown": dd,
                    "trade_count": res.aggregate.get("trade_count", 0),
                    "score": score,
                }
            )

    if not covered:
        return None, None, {
            "applicable": False,
            "reason": "data covers no known stress window",
            "checked": checked,
        }
    sub = float(np.mean([c["score"] for c in covered]))
    return sub, sub >= 0.5, {"applicable": True, "windows": covered, "checked": checked}
