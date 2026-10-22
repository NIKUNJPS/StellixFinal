"""Post-hoc ablation of the 5-method validation composite, and a naive-ranking baseline.

This is a RE-COMPUTATION on stored validation results (evidence/strategies.csv), not a re-run experiment:
for each of the five components, drop it, renormalize the remaining weights with the platform's own
compute_composite(), and see how many strategies change class (auto_fail / candidate / eligible_active) and
how the ranking changes. It shows how much each component contributes to the gate's decisions; it does not
show that the component is *correct*.

Baseline: rank strategies by naive aggregate per-trade Sharpe (what a non-regime-aware, non-validated workflow
would sort on) and compare with the validation composite.

Usage: backend\\.venv\\Scripts\\python.exe scripts\\evaluation\\ablate_validation_score.py
(run export_evidence.py first)
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402
from app.validation.composite import classify, compute_composite  # noqa: E402

COMPONENTS = {"walk_forward": "val_walk_forward", "regime_cv": "val_regime_cv", "monte_carlo": "val_monte_carlo",
              "persistence": "val_persistence", "stress_test": "val_stress"}


def main() -> None:
    df = pd.read_csv(os.path.join(C.EVIDENCE, "strategies.csv"))
    df = df[df["val_composite"].notna()].copy()
    # Evolved variants are near-duplicates of each other; report both the full set and the de-duplicated base set.
    sets = {"all_validated": df, "base_strategies_only": df[~df["is_evolved_variant"]]}
    rows, summary = [], {}
    for set_name, sub in sets.items():
        sub = sub.copy()
        full_class = sub["val_class"]
        summary[set_name] = {"n": int(len(sub)), "full_class_counts": full_class.value_counts().to_dict()}
        for drop in [None, *COMPONENTS]:
            comp = []
            for _, r in sub.iterrows():
                scores = {k: (None if pd.isna(r[c]) else float(r[c])) for k, c in COMPONENTS.items() if k != drop}
                comp.append(compute_composite(scores))
            sub[f"c_{drop}"] = comp
            cls = pd.Series([classify(c).value for c in comp], index=sub.index)
            flips = int((cls != full_class).sum())
            rho = float(stats.spearmanr(sub["val_composite"], pd.Series(comp, index=sub.index)).correlation)
            rows.append({"set": set_name, "dropped": drop or "(none - full composite)", "n": len(sub), "class_changes": flips,
                         "eligible_active": int((cls == "eligible_active").sum()), "candidate": int((cls == "candidate").sum()),
                         "auto_fail": int((cls == "auto_fail").sum()), "spearman_vs_full": rho})
    out = pd.DataFrame(rows)
    out.to_csv(os.path.join(C.EVIDENCE, "ablation_score_components.csv"), index=False)

    # Baseline: naive aggregate per-trade Sharpe ranking vs validation composite
    base = sets["base_strategies_only"].dropna(subset=["sharpe_per_trade"]).copy()
    rho = stats.spearmanr(base["sharpe_per_trade"], base["val_composite"])
    top = base.sort_values("sharpe_per_trade", ascending=False).head(10)
    summary["naive_sharpe_ranking_vs_validation"] = {
        "n": int(len(base)), "spearman_sharpe_vs_composite": float(rho.correlation), "p": float(rho.pvalue),
        "top10_by_sharpe_auto_fail": int((top["val_class"] == "auto_fail").sum()),
        "top10_by_sharpe_eligible_active": int((top["val_class"] == "eligible_active").sum()),
        "top10_by_sharpe": top[["name", "sharpe_per_trade", "val_composite", "val_class"]].to_dict(orient="records"),
    }
    # How concentrated is the failure of the gate on trade count? (persistence needs trades)
    many = base[base["trades"] >= 30]
    few = base[base["trades"] < 30]
    summary["trade_count_vs_persistence"] = {
        "persistence_zero_share_<30_trades": float((few["val_persistence"] == 0).mean()) if len(few) else None,
        "persistence_zero_share_>=30_trades": float((many["val_persistence"] == 0).mean()) if len(many) else None,
        "n_<30": int(len(few)), "n_>=30": int(len(many)),
    }
    with open(os.path.join(C.EVIDENCE, "ablation_score_summary.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2, default=str)
    print(out.to_string(index=False))
    print(json.dumps(summary, indent=2, default=str)[:3000])


if __name__ == "__main__":
    main()
