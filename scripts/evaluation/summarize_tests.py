"""Summarize evidence/pytest_junit.xml: totals, per-file counts, and counts by subsystem.

Usage: backend\\.venv\\Scripts\\python.exe scripts\\evaluation\\summarize_tests.py
(after:  pytest tests -q -p no:warnings --junitxml docs/evaluation/evidence/pytest_junit.xml)
"""
from __future__ import annotations

import json
import os
import re
import xml.etree.ElementTree as ET
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EV = os.path.join(ROOT, "docs", "evaluation", "evidence")

# first matching rule wins; keyed on the test file name
AREAS = [
    ("Regime detection", r"regime"),
    ("Validation (5 methods)", r"validation|walk_forward|monte_carlo|persistence|stress"),
    ("Backtest and strategy DSL", r"backtest|dsl|signal|strategy|lifecycle|features|lookahead"),
    ("Failure intelligence", r"failure|shap|cluster"),
    ("Evolution (GA)", r"evolution|ga_|fitness|encoding"),
    ("Knowledge graph", r"graph"),
    ("Multi-agent desk", r"agent_desk|agents"),
    ("Market terminal", r"terminal"),
    ("LLM layer and safeguards", r"llm|guard|safeguard|redact"),
    ("Security, RBAC and tenancy", r"rbac|auth|tenant|isolation|permission|superadmin|rate_limit|mfa|security"),
    ("Data ingestion", r"ingest|provider|market_data"),
]


def area_of(file_stem: str) -> str:
    for name, pat in AREAS:
        if re.search(pat, file_stem):
            return name
    return "Platform / other"


def main() -> None:
    root = ET.parse(os.path.join(EV, "pytest_junit.xml")).getroot()
    suite = root if root.tag == "testsuite" else root.find("testsuite")
    totals = {k: int(suite.attrib.get(k, 0)) for k in ("tests", "failures", "errors", "skipped")}
    totals["time_seconds"] = float(suite.attrib.get("time", 0))
    per_file = defaultdict(lambda: {"passed": 0, "failed": 0, "skipped": 0})
    skip_reasons = defaultdict(int)
    for tc in suite.iter("testcase"):
        stem = tc.attrib.get("classname", "").split(".")[-1] or "unknown"
        if tc.find("failure") is not None or tc.find("error") is not None:
            per_file[stem]["failed"] += 1
        elif tc.find("skipped") is not None:
            per_file[stem]["skipped"] += 1
            skip_reasons[(tc.find("skipped").attrib.get("message", "") or "")[:90]] += 1
        else:
            per_file[stem]["passed"] += 1
    by_area = defaultdict(lambda: {"files": 0, "passed": 0, "failed": 0, "skipped": 0})
    lines = ["file,area,passed,failed,skipped"]
    for stem, c in sorted(per_file.items()):
        a = area_of(stem)
        by_area[a]["files"] += 1
        for k in ("passed", "failed", "skipped"):
            by_area[a][k] += c[k]
        lines.append(f"{stem},{a},{c['passed']},{c['failed']},{c['skipped']}")
    with open(os.path.join(EV, "tests_by_file.csv"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    out = {"totals": totals, "files": len(per_file), "by_area": dict(sorted(by_area.items())),
           "skip_reasons": dict(skip_reasons)}
    with open(os.path.join(EV, "tests_summary.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
