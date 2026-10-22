"""Experiment B - does the evolution engine generalize? GA vs random search vs the untouched seed.

Question
    The genetic algorithm (DEAP; regime-weighted Sharpe + 0.3*robustness fitness) improves a strategy's
    parameters on the history it is shown. ADR 0007 already documents that the optimizer can exploit its
    fitness function. Here we ask the held-out question: does the GA's best individual (chosen on EARLIER
    data) beat (i) the unmodified seed and (ii) a random-search baseline given the SAME number of backtest
    evaluations, on LATER data neither saw?

Protocol (fixed in advance)
    * Strategies: human-authored, de-duplicated; selection rule = the first two by name for each of SPY, QQQ,
      GLD and BTC-USD that have >= 15 trades on the train slice. Chosen without looking at any test result.
    * Split: chronological, first 60% train / last 40% test (per symbol).
    * Genes: the platform's own derive_parameter_space (rule literals + risk-constraint numbers), same bounds.
    * GA: the platform's run_ga, population 16, max 8 generations, all other GAConfig defaults, initial
      population = the seed + Gaussian-perturbed clones (as app/services/evolution.py does).
    * Random search: same number of train evaluations as the GA actually used, genes uniform in bounds.
    * Selection: each method returns its best individual by TRAIN fitness; that individual alone is scored on TEST.
    * Seeds: 1, 2, 3 per strategy (Python `random` for DEAP, numpy Generator for random search).
    * Fitness: app.evolution.fitness.compute_fitness (unchanged). Fees 0.1%, no separate slippage.

Known limitations: three seeds, eight strategies, correlated signals -> descriptive evidence, not a
significance claim; regime labels are full-history fits (smoothed); the GA budget is small by design.

Usage: backend\\.venv\\Scripts\\python.exe scripts\\evaluation\\exp_evolution_vs_random.py
"""
from __future__ import annotations

import json
import multiprocessing as mp
import os
import random
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

SEEDS = (1, 2, 3)
# Search budget is configurable so the experiment can be repeated at a larger budget:
#   set EVAL_POP=24 & set EVAL_GENS=15 & set EVAL_TAG=_large   (outputs get the tag as a file-name suffix)
POP = int(os.environ.get("EVAL_POP", 16))
GENS = int(os.environ.get("EVAL_GENS", 8))
TAG = os.environ.get("EVAL_TAG", "")


def _eval(genes, template, df, rdf):
    from app.evolution import encoding
    from app.evolution.fitness import compute_fitness
    from app.strategy.backtest import DEFAULT_INIT_CASH, run_regime_aware_backtest

    res = run_regime_aware_backtest(encoding.decode(list(genes), template), df, rdf)
    eq = res.equity_curve
    total = float(eq.iloc[-1] / DEFAULT_INIT_CASH - 1.0) if len(eq) else 0.0
    return {
        "fitness": compute_fitness(res.per_regime, res.robustness_score), "total_return": total,
        "trades": int(res.aggregate.get("trade_count", 0)), "sharpe_per_trade": res.aggregate.get("sharpe_ratio"),
        "max_drawdown_bars": float(res.drawdown_series.min()) if len(res.drawdown_series) else 0.0,
    }


def task(args):
    strategy, seed = args
    from app.evolution import encoding
    from app.evolution.ga import GAConfig, run_ga

    feature_df, regime_df = C.load_frames(strategy["symbol"])
    tf, tr, sf, sr = C.split_frames(feature_df, regime_df)
    template = {k: strategy[k] for k in ("entry_rules", "exit_rules", "risk_constraints")}
    specs = encoding.derive_parameter_space(template)
    bounds = [(s.min, s.max) for s in specs]
    base = encoding.encode(template)

    cache: dict = {}
    evals = 0

    def train_fit(genes):
        nonlocal evals
        key = tuple(round(g, 9) for g in genes)
        if key not in cache:
            cache[key] = _eval(genes, template, tf, tr)["fitness"]
            evals += 1
        return cache[key]

    rng = random.Random(seed)
    init = [list(base)] + [
        [g + rng.gauss(0, max(0.1 * (hi - lo), 1e-6)) for g, (lo, hi) in zip(base, bounds, strict=False)]
        for _ in range(POP - 1)
    ]
    random.seed(seed)
    ga = run_ga(init, bounds, train_fit, GAConfig(population_size=POP, max_generations=GENS))
    ga_genes, ga_evals = ga.best_individual, evals

    nrng = np.random.default_rng(seed + 1000)
    rs_best, rs_best_fit = list(base), -1e18
    for _ in range(ga_evals):
        cand = [float(nrng.uniform(lo, hi)) for lo, hi in bounds]
        f = train_fit(cand)
        if f > rs_best_fit:
            rs_best, rs_best_fit = cand, f

    rows = []
    for method, genes in (("seed_unchanged", base), ("genetic_algorithm", ga_genes), ("random_search", rs_best)):
        tr_m, te_m = _eval(genes, template, tf, tr), _eval(genes, template, sf, sr)
        rows.append({
            "strategy": strategy["name"], "symbol": strategy["symbol"], "seed": seed, "method": method,
            "n_genes": len(base), "train_evals": ga_evals if method != "seed_unchanged" else 0,
            "train_fitness": tr_m["fitness"], "test_fitness": te_m["fitness"],
            "train_total_return": tr_m["total_return"], "test_total_return": te_m["total_return"],
            "test_trades": te_m["trades"], "train_trades": tr_m["trades"], "test_sharpe_per_trade": te_m["sharpe_per_trade"],
            "test_max_drawdown": te_m["max_drawdown_bars"],
        })
    return rows


def pick_strategies() -> list[dict]:
    from app.strategy.backtest import run_regime_aware_backtest

    chosen = []
    for sym in ("SPY", "QQQ", "GLD", "BTC-USD"):
        feature_df, regime_df = C.load_frames(sym)
        tf, tr, _, _ = C.split_frames(feature_df, regime_df)
        cands = sorted((s for s in C.unique_human_strategies() if s["symbol"] == sym), key=lambda s: s["name"])
        n = 0
        for s in cands:
            trades = run_regime_aware_backtest(s, tf, tr).aggregate.get("trade_count", 0)
            if trades >= 15:
                chosen.append(s)
                n += 1
            if n == 2:
                break
    return chosen


def main() -> None:
    strategies = pick_strategies()
    print("strategies:", [s["name"] for s in strategies], flush=True)
    jobs = [(s, seed) for s in strategies for seed in SEEDS]
    rows = []
    with mp.get_context("spawn").Pool(processes=min(int(os.environ.get("EVAL_PROCS", 10)), len(jobs))) as pool:
        for i, r in enumerate(pool.imap_unordered(task, jobs), 1):
            rows.extend(r)
            print(f"  [{i}/{len(jobs)}] {r[0]['strategy'][:40]} seed {r[0]['seed']}", flush=True)
    df = pd.DataFrame(rows).sort_values(["symbol", "strategy", "seed", "method"]).reset_index(drop=True)
    df.to_csv(os.path.join(C.EVIDENCE, f"exp_evolution_vs_random{TAG}.csv"), index=False)

    from scipy import stats

    per = df.groupby(["strategy", "method"])[["train_fitness", "test_fitness", "train_total_return", "test_total_return"]].mean().reset_index()
    wide = per.pivot(index="strategy", columns="method")
    summary = {"strategies": [s["name"] for s in strategies], "seeds": list(SEEDS), "population": POP, "generations": GENS,
               "n_strategies": len(strategies),
               "mean_by_method": df.groupby("method")[["train_fitness", "test_fitness", "train_total_return", "test_total_return", "test_trades"]].mean().to_dict(orient="index")}

    def pair(metric: str, a: str, b: str) -> dict:
        d = (wide[(metric, a)] - wide[(metric, b)]).to_numpy(dtype=float)
        out = {"n_strategies": len(d), "mean_diff": float(d.mean()), "better": int((d > 1e-12).sum()),
               "worse": int((d < -1e-12).sum()), "bootstrap_95ci_mean_diff": C.bootstrap_ci(d) if len(d) >= 2 else None}
        nz = d[np.abs(d) > 1e-12]
        out["wilcoxon_p"] = float(stats.wilcoxon(nz).pvalue) if len(nz) >= 5 else None
        return out

    summary["train_fitness_ga_minus_seed"] = pair("train_fitness", "genetic_algorithm", "seed_unchanged")
    summary["train_fitness_ga_minus_random"] = pair("train_fitness", "genetic_algorithm", "random_search")
    summary["test_fitness_ga_minus_seed"] = pair("test_fitness", "genetic_algorithm", "seed_unchanged")
    summary["test_fitness_ga_minus_random"] = pair("test_fitness", "genetic_algorithm", "random_search")
    summary["test_return_ga_minus_seed"] = pair("test_total_return", "genetic_algorithm", "seed_unchanged")
    summary["test_return_ga_minus_random"] = pair("test_total_return", "genetic_algorithm", "random_search")
    # generalisation gap: how much of the in-sample fitness survives out of sample
    for m in ("seed_unchanged", "genetic_algorithm", "random_search"):
        g = (wide[("train_fitness", m)] - wide[("test_fitness", m)]).to_numpy(dtype=float)
        summary.setdefault("mean_train_minus_test_fitness", {})[m] = float(g.mean())
    with open(os.path.join(C.EVIDENCE, f"exp_evolution_vs_random{TAG}_summary.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2, default=str)
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
