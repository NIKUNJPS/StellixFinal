"""Export measured evidence from the live Meridian database (READ-ONLY) for docs/evaluation/.

Writes into docs/evaluation/evidence/:
  data_provenance.csv        per-symbol bar counts, date range, gaps, source, feature coverage
  regime_distribution.csv    per-symbol regime shares, confidence, persistence (run length)
  regime_model_agreement.csv per-model agreement with the ensemble and pairwise agreement
  strategies.csv             every strategy: lifecycle, backtest metrics, per-regime Sharpe/trades,
                             latest 5-method validation sub-scores and composite
  failures.csv               every recorded failure with a provenance class (seeded vs monitor)
  evolution_runs.csv         GA runs (config, generations, best fitness)
  evolution_lineage.csv      parent -> child robustness / backtest comparison
  agent_analyses.csv         multi-agent desk analyses and any settled outcomes
  manifest.json              environment, package versions, git state, row counts, timestamp
  summary.json               aggregates the docs quote (so no number is typed by hand)
  tables.md                  markdown tables the docs include

Nothing here writes to the database. Run:  backend\\.venv\\Scripts\\python.exe scripts\\evaluation\\export_evidence.py
"""
from __future__ import annotations

import asyncio
import json
import os
import platform
import subprocess
import sys
from datetime import datetime, timezone
from importlib import metadata

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "docs", "evaluation", "evidence")
os.makedirs(OUT, exist_ok=True)
os.chdir(os.path.join(ROOT, "backend"))
sys.path.insert(0, os.getcwd())

from sqlalchemy import func, select  # noqa: E402

import app.models  # noqa: E402,F401
from app.db.session import SessionFactory, dispose_engine  # noqa: E402
from app.db.tenant import mark_session_unscoped  # noqa: E402
from app.models.agent_analysis import AgentAnalysis  # noqa: E402
from app.models.evolution_run import EvolutionRun  # noqa: E402
from app.models.failure import Failure  # noqa: E402
from app.models.feature_matrix import FeatureMatrix  # noqa: E402
from app.models.market_data import MarketData  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.performance_snapshot import AGGREGATE_LABEL, PerformanceSnapshot  # noqa: E402
from app.models.regime_label import RegimeLabelRecord  # noqa: E402
from app.models.strategy import Strategy  # noqa: E402
from app.models.validation_result import ValidationResult  # noqa: E402

ORG_SLUG = "meridian-capital"
SEED_END = pd.Timestamp("2024-12-31", tz="UTC")  # last bar of the seeded demo window
PRIMARY = ["Bull", "Bear", "High-Volatility", "Low-Volatility", "Sideways", "Crisis"]
SYMBOL_BY_PREFIX = {"SPY": "SPY", "QQQ": "QQQ", "GOLD": "GLD", "GLD": "GLD", "BTC": "BTC-USD", "ETH": "ETH-USD"}
EVOLVED = r"\s*\(evolved.*$"


def md_table(df: pd.DataFrame, floatfmt: str = "{:.4f}") -> str:
    if df.empty:
        return "_(no rows)_\n"
    cols = list(df.columns)
    lines = ["| " + " | ".join(str(c) for c in cols) + " |", "|" + "|".join("---" for _ in cols) + "|"]
    for _, r in df.iterrows():
        cells = []
        for v in r:
            if isinstance(v, (float, np.floating)):
                cells.append("" if pd.isna(v) else floatfmt.format(v))
            else:
                cells.append("" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v))
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines) + "\n"


def sym_for(name: str, symbol: str | None) -> str | None:
    if symbol:
        return symbol.strip().upper()
    return SYMBOL_BY_PREFIX.get(name.split()[0].upper())


def git(*args: str) -> str:
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, timeout=30).stdout.strip()
    except Exception:  # noqa: BLE001
        return ""


async def main() -> None:
    summary: dict = {}
    tables: list[str] = []
    async with SessionFactory() as s:
        mark_session_unscoped(s.sync_session)
        org = (await s.execute(select(Organization).where(Organization.slug == ORG_SLUG))).scalar_one()
        oid = org.id

        # ------------------------------------------------------------------ data provenance
        prov_rows = []
        regime_rows, agree_rows = [], []
        symbols = [r[0] for r in (await s.execute(
            select(MarketData.symbol).where(MarketData.organization_id == oid).distinct().order_by(MarketData.symbol))).all()]
        for sym in symbols:
            ts = [r[0] for r in (await s.execute(
                select(MarketData.timestamp).where(MarketData.organization_id == oid, MarketData.symbol == sym)
                .order_by(MarketData.timestamp))).all()]
            idx = pd.DatetimeIndex(pd.to_datetime(ts, utc=True))
            gaps = pd.Series(idx[1:] - idx[:-1]).dt.days if len(idx) > 1 else pd.Series(dtype=int)
            sources = [r[0] for r in (await s.execute(
                select(MarketData.source).where(MarketData.organization_id == oid, MarketData.symbol == sym).distinct())).all()]
            zero_vol = (await s.execute(select(func.count()).select_from(MarketData).where(
                MarketData.organization_id == oid, MarketData.symbol == sym, MarketData.volume == 0))).scalar()
            fm_n = (await s.execute(select(func.count()).select_from(FeatureMatrix).where(
                FeatureMatrix.organization_id == oid, FeatureMatrix.symbol == sym))).scalar()
            fm_null = (await s.execute(select(func.count()).select_from(FeatureMatrix).where(
                FeatureMatrix.organization_id == oid, FeatureMatrix.symbol == sym, FeatureMatrix.sma_50.is_(None)))).scalar()
            rg_n = (await s.execute(select(func.count()).select_from(RegimeLabelRecord).where(
                RegimeLabelRecord.organization_id == oid, RegimeLabelRecord.symbol == sym))).scalar()
            prov_rows.append({
                "symbol": sym, "bars": len(idx), "first_bar": str(idx.min().date()) if len(idx) else None,
                "last_bar": str(idx.max().date()) if len(idx) else None, "source": ",".join(sorted(sources)),
                "gaps_over_4_days": int((gaps > 4).sum()), "max_gap_days": int(gaps.max()) if len(gaps) else 0,
                "zero_volume_bars": int(zero_vol or 0), "feature_rows": int(fm_n or 0),
                "feature_warmup_nulls_sma50": int(fm_null or 0), "regime_rows": int(rg_n or 0),
            })

            if rg_n:
                rr = (await s.execute(
                    select(RegimeLabelRecord.timestamp, RegimeLabelRecord.regime_label, RegimeLabelRecord.confidence_score,
                           RegimeLabelRecord.model_votes)
                    .where(RegimeLabelRecord.organization_id == oid, RegimeLabelRecord.symbol == sym)
                    .order_by(RegimeLabelRecord.timestamp))).all()
                df = pd.DataFrame(rr, columns=["ts", "label", "conf", "votes"])
                df["label"] = df["label"].map(lambda v: getattr(v, "value", v))
                runs = (df["label"] != df["label"].shift()).cumsum()
                run_len = df.groupby(runs).size()
                for lab in PRIMARY:
                    share = float((df["label"] == lab).mean())
                    regime_rows.append({
                        "symbol": sym, "regime": lab, "bars": int((df["label"] == lab).sum()), "share": share,
                        "mean_confidence": float(df.loc[df["label"] == lab, "conf"].mean()) if share else None,
                    })
                regime_rows.append({
                    "symbol": sym, "regime": "_ALL_", "bars": len(df), "share": 1.0,
                    "mean_confidence": float(df["conf"].mean()),
                    "transitions": int((df["label"] != df["label"].shift()).sum() - 1),
                    "mean_run_length_bars": float(run_len.mean()), "median_run_length_bars": float(run_len.median()),
                })
                votes = pd.DataFrame([v if isinstance(v, dict) else {} for v in df["votes"]])
                if not votes.empty:
                    for m in votes.columns:
                        agree_rows.append({"symbol": sym, "model": m, "vs": "ensemble_final",
                                           "agreement": float((votes[m].values == df["label"].values).mean())})
                    for i, a in enumerate(votes.columns):
                        for b in votes.columns[i + 1:]:
                            agree_rows.append({"symbol": sym, "model": a, "vs": b,
                                               "agreement": float((votes[a].values == votes[b].values).mean())})
        prov = pd.DataFrame(prov_rows)
        # "research" symbols have multi-year history and are the ones strategies are backtested on;
        # "screener" symbols (~2 years) feed the Terminal screener and regime tagging only.
        long_syms = set(prov.loc[prov["bars"] >= 700, "symbol"])
        prov.insert(1, "universe", np.where(prov["symbol"].isin(long_syms), "research", "screener"))
        prov.to_csv(os.path.join(OUT, "data_provenance.csv"), index=False)
        pd.DataFrame(regime_rows).to_csv(os.path.join(OUT, "regime_distribution.csv"), index=False)
        agree = pd.DataFrame(agree_rows)
        agree.to_csv(os.path.join(OUT, "regime_model_agreement.csv"), index=False)
        screener = prov[prov["universe"] == "screener"]
        summary["data_universes"] = {
            "research_symbols": sorted(long_syms),
            "screener_symbols": int(len(screener)),
            "screener_bars_median": float(screener["bars"].median()) if len(screener) else None,
            "screener_first_bar_min": screener["first_bar"].min() if len(screener) else None,
            "screener_last_bar_max": screener["last_bar"].max() if len(screener) else None,
        }
        prov_research = prov[prov["universe"] == "research"].drop(columns=["universe"])
        tables += ["## Data provenance: research symbols (Meridian org)\n", md_table(prov_research),
                   f"\nThe screener universe has {len(screener)} further symbols (median {summary['data_universes']['screener_bars_median']:.0f} daily bars each); "
                   "see `data_provenance.csv`.\n"]
        agree_r = agree[agree["symbol"].isin(long_syms)] if not agree.empty else agree
        if not agree_r.empty:
            tables += ["## Regime model agreement with the ensemble (research symbols)\n",
                       md_table(agree_r[agree_r["vs"] == "ensemble_final"].pivot_table(index="symbol", columns="model", values="agreement").reset_index()),
                       "## Pairwise model agreement (research symbols)\n",
                       md_table(agree_r[agree_r["vs"] != "ensemble_final"].groupby(["model", "vs"])["agreement"].mean().reset_index())]
        reg = pd.DataFrame(regime_rows)
        if not reg.empty:
            reg_r = reg[reg["symbol"].isin(long_syms)]
            share_tbl = reg_r[reg_r["regime"].isin(PRIMARY)].pivot_table(index="symbol", columns="regime", values="share").reset_index()
            tables += ["## Regime shares by symbol (research symbols)\n", md_table(share_tbl)]
            persist = reg_r[reg_r["regime"] == "_ALL_"][["symbol", "bars", "mean_confidence", "transitions", "mean_run_length_bars", "median_run_length_bars"]]
            tables += ["## Regime persistence (research symbols)\n", md_table(persist)]
            summary["regime_persistence_research"] = persist.to_dict(orient="records")
            allp = reg[reg["regime"] == "_ALL_"]
            summary["regime_persistence_all_symbols"] = {
                "symbols": int(len(allp)), "median_mean_run_length_bars": float(allp["mean_run_length_bars"].median()),
                "median_confidence": float(allp["mean_confidence"].median()),
            }

        # ------------------------------------------------------------------ strategies
        strategies = (await s.execute(select(Strategy).where(Strategy.organization_id == oid))).scalars().all()
        snaps = (await s.execute(select(PerformanceSnapshot).where(PerformanceSnapshot.organization_id == oid))).scalars().all()
        vals = (await s.execute(select(ValidationResult).where(ValidationResult.organization_id == oid)
                                .order_by(ValidationResult.created_at.desc()))).scalars().all()
        snap_by: dict = {}
        for sn in snaps:
            snap_by.setdefault(sn.strategy_id, {})[sn.regime_label] = sn
        val_by: dict = {}
        for v in vals:
            val_by.setdefault(v.strategy_id, v)  # newest first
        by_id = {st.id: st for st in strategies}
        rows = []
        for st in strategies:
            sn = snap_by.get(st.id, {})
            agg = sn.get(AGGREGATE_LABEL)
            v = val_by.get(st.id)
            row = {
                "strategy_id": str(st.id)[:8], "name": st.name, "family": pd.Series([st.name]).str.replace(EVOLVED, "", regex=True).iloc[0].strip(),
                "status": st.status.value, "creator": getattr(st.creator, "value", st.creator), "symbol": sym_for(st.name, st.symbol),
                "is_evolved_variant": "(evolved" in st.name.lower(), "parent_id": str(st.parent_strategy_id)[:8] if st.parent_strategy_id else None,
                "robustness_score": st.robustness_score, "backtest_robustness": st.backtest_robustness,
                "period_start": str(agg.period_start.date()) if agg and agg.period_start else None,
                "period_end": str(agg.period_end.date()) if agg and agg.period_end else None,
                "trades": agg.trade_count if agg else None, "sharpe_per_trade": agg.sharpe_ratio if agg else None,
                "sortino_per_trade": agg.sortino_ratio if agg else None, "max_drawdown_trade_seq": agg.max_drawdown if agg else None,
                "win_rate": agg.win_rate if agg else None, "profit_factor": agg.profit_factor if agg else None,
                "annualized_return": agg.annualized_return if agg else None, "annualized_vol": agg.volatility if agg else None,
                "beta_vs_spy": agg.beta_vs_benchmark if agg else None,
            }
            for lab in PRIMARY:
                m = sn.get(lab)
                row[f"sharpe_{lab}"] = m.sharpe_ratio if m else None
                row[f"trades_{lab}"] = m.trade_count if m else 0
            if v:
                row.update({
                    "val_walk_forward": v.walk_forward_score, "val_regime_cv": v.regime_cv_score, "val_monte_carlo": v.monte_carlo_score,
                    "val_persistence": v.persistence_score, "val_stress": v.stress_test_score, "val_composite": v.composite_score,
                    "val_class": getattr(v.classification, "value", v.classification),
                })
            rows.append(row)
        strat = pd.DataFrame(rows)
        strat.to_csv(os.path.join(OUT, "strategies.csv"), index=False)

        n_val = int(strat["val_composite"].notna().sum()) if "val_composite" in strat else 0
        summary["strategies"] = {
            "total": len(strat), "by_status": strat["status"].value_counts().to_dict(),
            "by_creator": strat["creator"].value_counts().to_dict(),
            "evolved_variants": int(strat["is_evolved_variant"].sum()), "with_validation": n_val,
            "validation_classification": strat["val_class"].value_counts().to_dict() if "val_class" in strat else {},
        }
        base = strat[~strat["is_evolved_variant"] & strat["val_composite"].notna()]
        tables += ["## Validated base strategies (not evolved variants), sorted by composite\n",
                   md_table(base.sort_values("val_composite", ascending=False)[[
                       "name", "symbol", "status", "trades", "sharpe_per_trade", "val_walk_forward", "val_regime_cv", "val_monte_carlo",
                       "val_persistence", "val_stress", "val_composite", "val_class"]].reset_index(drop=True))]

        # ------------------------------------------------------------------ failures
        fails = (await s.execute(select(Failure).where(Failure.organization_id == oid))).scalars().all()
        frows = []
        for f in fails:
            st = by_id.get(f.strategy_id)
            ts_ = pd.Timestamp(f.failure_timestamp)
            ts_ = ts_.tz_localize("UTC") if ts_.tzinfo is None else ts_.tz_convert("UTC")
            frows.append({
                "failure_id": str(f.id)[:8], "strategy": st.name if st else None, "trigger": f.trigger_condition.value,
                "regime_at_failure": f.regime_at_failure, "failure_timestamp": str(ts_.date()),
                "instrument_recorded": (f.market_context_snapshot or {}).get("symbol"),
                "strategy_symbol": sym_for(st.name, st.symbol) if st else None,
                "provenance": "seed-script forced trigger (last bar of the seeded window)" if ts_ <= SEED_END else "monitor sweep (live data)",
                "has_ai_explanation": bool(f.llm_generated_explanation), "numeric_validation_passed": f.llm_numeric_validation_passed,
                "has_shap_attribution": bool(f.feature_attribution),
            })
        fdf = pd.DataFrame(frows)
        fdf.to_csv(os.path.join(OUT, "failures.csv"), index=False)
        summary["failures"] = {
            "total": len(fdf), "by_trigger": fdf["trigger"].value_counts().to_dict(),
            "by_provenance": fdf["provenance"].value_counts().to_dict(),
            "with_ai_explanation": int(fdf["has_ai_explanation"].sum()),
            "numeric_validation_passed": int((fdf["numeric_validation_passed"] == True).sum()),  # noqa: E712
            "with_shap": int(fdf["has_shap_attribution"].sum()),
        }
        tables += ["## Failure records and their provenance\n", md_table(fdf)]

        # ------------------------------------------------------------------ evolution
        runs = (await s.execute(select(EvolutionRun).where(EvolutionRun.organization_id == oid))).scalars().all()
        erows = [{
            "run_id": str(r.id)[:8], "symbol": r.symbol, "status": r.status.value, "population": (r.ga_config or {}).get("population_size"),
            "max_generations": (r.ga_config or {}).get("max_generations"), "generations_run": r.generations_run,
            "best_fitness": r.best_fitness, "seed_strategies": len(r.seed_strategy_ids or []), "candidates_produced": len(r.candidate_strategy_ids or []),
        } for r in runs]
        edf = pd.DataFrame(erows)
        edf.to_csv(os.path.join(OUT, "evolution_runs.csv"), index=False)
        summary["evolution_runs"] = edf.to_dict(orient="records")
        tables += ["## Evolution (genetic algorithm) runs\n", md_table(edf)]

        lrows = []
        for st in strategies:
            if st.parent_strategy_id and st.parent_strategy_id in by_id:
                p = by_id[st.parent_strategy_id]
                pa, ca = snap_by.get(p.id, {}).get(AGGREGATE_LABEL), snap_by.get(st.id, {}).get(AGGREGATE_LABEL)
                pv, cv = val_by.get(p.id), val_by.get(st.id)
                lrows.append({
                    "child": st.name[:48], "child_kind": "evolved" if "(evolved" in st.name.lower() else "successor/other",
                    "parent": p.name[:40], "parent_val_composite": pv.composite_score if pv else None,
                    "child_val_composite": cv.composite_score if cv else None,
                    "parent_trades": pa.trade_count if pa else None, "child_trades": ca.trade_count if ca else None,
                    "parent_sharpe": pa.sharpe_ratio if pa else None, "child_sharpe": ca.sharpe_ratio if ca else None,
                })
        ldf = pd.DataFrame(lrows)
        ldf.to_csv(os.path.join(OUT, "evolution_lineage.csv"), index=False)
        if not ldf.empty:
            both = ldf.dropna(subset=["parent_val_composite", "child_val_composite"]).copy()
            both["delta"] = both["child_val_composite"] - both["parent_val_composite"]
            ev = both[both["child_kind"] == "evolved"]
            summary["evolution_lineage"] = {
                "pairs_with_both_validations": len(both), "evolved_pairs": len(ev),
                "evolved_mean_delta": float(ev["delta"].mean()) if len(ev) else None,
                "evolved_improved": int((ev["delta"] > 0).sum()), "evolved_worse": int((ev["delta"] < 0).sum()),
                "evolved_equal": int((ev["delta"] == 0).sum()),
                "evolved_cleared_0_70": int((ev["child_val_composite"] > 0.70).sum()),
            }

        # ------------------------------------------------------------------ agent desk
        ans = (await s.execute(select(AgentAnalysis).where(AgentAnalysis.organization_id == oid)
                               .order_by(AgentAnalysis.created_at))).scalars().all()
        arows = [{
            "analysis_id": str(a.id)[:8], "ticker": a.ticker, "trade_date": str(a.trade_date), "status": a.status.value, "rating": a.rating,
            "trader_action": a.trader_action, "regime": a.regime_at_analysis, "regime_confidence": a.regime_confidence,
            "analysts": ",".join(a.selected_analysts or []), "llm_calls": a.llm_call_count, "provider": a.llm_provider,
            "backtest_cell": a.backtest_run_id is not None, "holding_days": a.holding_days, "settled_raw_return": a.settled_raw_return,
            "settled_alpha": a.settled_alpha, "benchmark": a.benchmark,
        } for a in ans]
        adf = pd.DataFrame(arows)
        adf.to_csv(os.path.join(OUT, "agent_analyses.csv"), index=False)
        summary["agent_analyses"] = {
            "total": len(adf), "completed": int((adf["status"] == "completed").sum()) if len(adf) else 0,
            "settled": int(adf["settled_alpha"].notna().sum()) if len(adf) else 0,
        }
        tables += ["## Multi-agent desk analyses\n", md_table(adf)]

        # row counts for the manifest
        counts = {
            "strategies": len(strategies), "performance_snapshots": len(snaps), "validation_results": len(vals),
            "failures": len(fails), "evolution_runs": len(runs), "agent_analyses": len(ans),
            "market_data_rows": int(prov["bars"].sum()), "regime_rows": int(prov["regime_rows"].sum()),
        }

    manifest = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "organization": ORG_SLUG, "python": platform.python_version(), "platform": platform.platform(),
        "git_branch": git("rev-parse", "--abbrev-ref", "HEAD"), "git_commit": git("rev-parse", "--short", "HEAD"),
        "git_uncommitted_files": len([ln for ln in git("status", "--short").splitlines() if ln.strip()]),
        "row_counts": counts,
        "packages": {p: metadata.version(p) for p in (
            "hmmlearn", "ruptures", "arch", "scikit-learn", "vectorbt", "deap", "shap", "lightgbm", "pandas", "numpy",
            "scipy", "SQLAlchemy", "fastapi", "langgraph", "anthropic") if _has(p)},
    }
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
    with open(os.path.join(OUT, "summary.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2, default=str)
    with open(os.path.join(OUT, "tables.md"), "w", encoding="utf-8") as fh:
        fh.write("# Auto-generated tables (do not edit by hand)\n\nGenerated by `scripts/evaluation/export_evidence.py` at "
                 f"{manifest['generated_at_utc']}.\n\n" + "\n".join(tables))
    await dispose_engine()
    print(json.dumps({"counts": counts, "summary_keys": list(summary)}, indent=2))


def _has(pkg: str) -> bool:
    try:
        metadata.version(pkg)
        return True
    except metadata.PackageNotFoundError:
        return False


if __name__ == "__main__":
    asyncio.run(main())
