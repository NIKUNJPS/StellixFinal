# Stellix Labs — Project Cost Estimation (COCOMO)

Estimate of the effort, schedule, team size and cost to build Stellix Labs with a
conventional team, using Boehm's **COCOMO 81** model (Basic and Intermediate).
Size is measured from the real codebase, not guessed.

---

## 1. Size measurement (KLOC)

Counted on 2026-10-22: physical source lines, **excluding blank lines and comments**,
across `StellixLabsMain/` (generated folders such as `node_modules`, `.next`, `.venv`
and build output are skipped).

| Area | Files | Source lines |
|---|---:|---:|
| Backend application (FastAPI, regime ensemble, validation, evolution, Research Memory, LLM, RBAC) | 227 | 22,865 |
| Backend database migrations (Alembic) | 28 | 1,776 |
| Frontend (Next.js / TypeScript / CSS — dashboard, terminal, public site, auth) | 278 | 36,284 |
| Operations scripts (seeding, setup, evaluation) | 25 | 3,592 |
| Infrastructure (Docker Compose, Kubernetes, Prometheus) | 22 | 1,099 |
| **Delivered source (used for the estimate)** | **580** | **65,616** |
| Automated tests (pytest) | 115 | 11,185 |
| **Total including tests** | **695** | **76,801** |

**KLOC used = 65.62.** Test code is excluded from the main estimate, following the usual
COCOMO convention of counting delivered source instructions; §6 shows the result with tests
included.

---

## 1A. LOC-based estimation — module-wise three-point method

This is the classic LOC-based project estimation (Pressman):

1. Split the system into modules.
2. Give each module an **optimistic (o)**, **most likely (m)** and **pessimistic (p)** size.
3. Take the expected size `E = (o + 4m + p) / 6`.
4. Convert the total size into effort and cost using historical productivity and the labour rate.

**How the three values were set:**

- **m (most likely)** is each module's *measured* size from §1, with tests excluded, so the 14 modules add up exactly to 65,616 lines.
- **o and p** come from each module's technical risk:

| Risk | Optimistic | Pessimistic | Modules |
|---|---|---|---|
| Low | 0.85 × m | 1.25 × m | Well-understood work: UI, auth, platform core, data ingestion, DevOps |
| Medium | 0.80 × m | 1.40 × m | Terminal, strategies/validation, governance, Research Memory |
| High | 0.75 × m | 1.60 × m | Research-heavy work: regime ensemble, SHAP failure analysis, genetic algorithm, LLM / multi-agent desk |

### Step 1–3: Expected LOC per module

| # | Module | Risk | Optimistic (o) | Most likely (m) | Pessimistic (p) | Expected (o+4m+p)/6 |
|---|---|---|---:|---:|---:|---:|
| 1 | Public website & sign-in/sign-up UI | Low | 4,808 | 5,656 | 7,070 | **5,750** |
| 2 | Research dashboard UI (shell, pages, components) | Low | 3,882 | 4,567 | 5,709 | **4,643** |
| 3 | Market terminal & market research | Medium | 7,150 | 8,937 | 12,512 | **9,235** |
| 4 | Authentication, multi-tenancy & RBAC | Low | 2,723 | 3,204 | 4,005 | **3,257** |
| 5 | Data ingestion & feature engineering | Low | 1,291 | 1,519 | 1,899 | **1,544** |
| 6 | Regime detection (4-model ensemble) | High | 1,990 | 2,653 | 4,245 | **2,808** |
| 7 | Strategies, backtesting & validation | Medium | 4,676 | 5,845 | 8,183 | **6,040** |
| 8 | Failure intelligence (SHAP autopsies) | High | 1,870 | 2,493 | 3,989 | **2,638** |
| 9 | Evolution engine (genetic algorithm) | High | 1,222 | 1,629 | 2,606 | **1,724** |
| 10 | Research Memory & research notes | Medium | 2,254 | 2,817 | 3,944 | **2,911** |
| 11 | LLM research assistant & multi-agent desk | High | 4,359 | 5,812 | 9,299 | **6,151** |
| 12 | Governance, audit, billing & superadmin | Medium | 9,505 | 11,881 | 16,633 | **12,277** |
| 13 | Platform core: API, database, workers, realtime | Low | 3,108 | 3,657 | 4,571 | **3,718** |
| 14 | DevOps, infrastructure & ops scripts | Low | 4,204 | 4,946 | 6,182 | **5,028** |
| | **Total** | | **53,042** | **65,616** | **90,847** | **67,724** |

Worked example (module 6, Regime detection):

```
E = (o + 4m + p) / 6 = (1,990 + 4 × 2,653 + 4,245) / 6 = 16,847 / 6 ≈ 2,808 LOC
```

**Estimated size = 67,724 LOC (67.72 KLOC).** The combined standard deviation is
`√Σ((p − o)/6)²` ≈ **±2,022 LOC**.

### Step 4: Effort and cost

Assumptions, which can be replaced with your own figures:

- **Average productivity:** 620 LOC per person-month (the textbook historical figure).
- **Labour rate:** ₹1,00,000 per person-month (≈ $8,000).

```
Cost per LOC = Labour rate / Productivity = ₹1,00,000 / 620        = ₹161.29 per LOC   ($12.90)
Total cost   = Expected LOC × Cost per LOC = 67,724 × ₹161.29     = ₹1,09,23,226       (≈ $873,858)
Effort       = Expected LOC / Productivity = 67,724 / 620           = 109.2 person-months
```

Duration depends on team size (effort ÷ team): **≈ 21.8 months with 5 people,
≈ 13.7 months with 8, ≈ 10.9 months with 10.**

| Result (LOC-based method) | Value |
|---|---:|
| Estimated size | **67,724 LOC (67.72 KLOC)** |
| Cost per LOC | **₹161.29** ($12.90) |
| Effort | **109.2 person-months** |
| Total cost | **≈ ₹1.09 crore** (≈ $0.87 M) |

### Same size through COCOMO

Feeding the expected 67.72 KLOC into the COCOMO equations from §3–§4 (semi-detached mode):

| Model | Effort (PM) | Time (months) | Staff | Cost (₹1L/PM) |
|---|---:|---:|---:|---:|
| Basic COCOMO | 336.9 | 19.2 | 17.6 | ₹3.37 crore |
| Intermediate COCOMO (EAF 0.978) | 329.4 | 19.0 | 17.3 | ₹3.29 crore |

**Why the two methods differ:** the LOC method uses a *flat* 620 LOC per person-month. COCOMO's
exponent above 1 lowers productivity as projects grow (to about 205 LOC per person-month at
this size), because larger systems spend more effort on integration, communication and
testing. Report the LOC method as the primary figure if your course follows that method, and
COCOMO as the upper bound.

---

## 2. Project mode: Semi-detached

| Mode | Fits Stellix Labs? |
|---|---|
| Organic — small, experienced team, familiar problem, few constraints | No: the product mixes quantitative finance, ML and multi-tenant SaaS |
| **Semi-detached — medium size, mixed experience, moderately novel, some firm constraints** | **Yes**: about 66 KLOC, new domain logic (regime detection, failure intelligence), plus firm constraints (tenant isolation, append-only audit records, RBAC) |
| Embedded — tight hardware, real-time or regulatory constraints | No: there is no hardware coupling or hard real-time requirement |

---

## 3. Basic COCOMO

Formulas: Effort `E = a · (KLOC)^b` person-months; Development time `D = c · E^d` months;
Staff `P = E / D`.

| Mode | a | b | c | d | Effort (PM) | Time (months) | Avg. staff |
|---|---:|---:|---:|---:|---:|---:|---:|
| Organic | 2.4 | 1.05 | 2.5 | 0.38 | 194.1 | 18.5 | 10.5 |
| **Semi-detached** | **3.0** | **1.12** | **2.5** | **0.35** | **325.2** | **18.9** | **17.2** |
| Embedded | 3.6 | 1.20 | 2.5 | 0.32 | 545.4 | 18.8 | 29.0 |

Worked example (semi-detached):

```
E = 3.0 × 65.62^1.12 = 3.0 × 108.4 = 325.2 person-months
D = 2.5 × 325.2^0.35 = 2.5 × 7.57  = 18.9 months
P = 325.2 / 18.9                  = 17.2 people (average)
```

---

## 4. Intermediate COCOMO

Intermediate COCOMO adjusts the effort with 15 cost drivers. Their product is the Effort
Adjustment Factor (EAF): `E = a · (KLOC)^b · EAF`, with `a = 3.0` and `b = 1.12` for
semi-detached projects.

The ratings are deliberately conservative: team capability is rated *Nominal* rather than
assuming an expert team.

| Driver | Meaning | Rating | Multiplier | Reason |
|---|---|---|---:|---|
| RELY | Required reliability | High | 1.15 | Drives investment-research decisions; governance approvals and failure records must be correct |
| DATA | Database size | High | 1.08 | Time-series market data (TimescaleDB), strategy, backtest and failure history |
| CPLX | Product complexity | High | 1.15 | 4-model regime ensemble, genetic algorithm, SHAP attribution, multi-tenant isolation |
| TIME | Execution-time constraint | Nominal | 1.00 | Heavy jobs run asynchronously in Celery |
| STOR | Main-storage constraint | Nominal | 1.00 | No unusual memory limits |
| VIRT | Platform volatility | Nominal | 1.00 | Stable, mainstream platforms |
| TURN | Computer turnaround time | Low | 0.87 | Interactive development with hot reload |
| ACAP | Analyst capability | Nominal | 1.00 | Conservative assumption |
| AEXP | Application experience | Nominal | 1.00 | Quant finance is a specialised domain |
| PCAP | Programmer capability | Nominal | 1.00 | Conservative assumption |
| VEXP | Platform experience | Nominal | 1.00 | — |
| LEXP | Language experience | High | 0.95 | Python and TypeScript are mainstream |
| MODP | Modern practices | High | 0.91 | Typed code, automated tests, linting, migrations, ADRs |
| TOOL | Software tools | High | 0.91 | Modern IDEs, CI, profilers, API docs generated from code |
| SCED | Schedule constraint | Nominal | 1.00 | No compressed deadline assumed |
| **EAF** | | | **0.978** | product of all 15 multipliers |

Results for all three modes:

| Mode | a | Effort (PM) | Time (months) | Avg. staff |
|---|---:|---:|---:|---:|
| Organic | 3.2 | 253.0 | 20.5 | 12.4 |
| **Semi-detached (selected)** | **3.0** | **317.9** | **18.8** | **16.9** |
| Embedded | 2.8 | 414.7 | 17.2 | 24.1 |

```
E = 3.0 × 65.62^1.12 × 0.978 = 317.9 person-months
D = 2.5 × 317.9^0.35        = 18.8 months
P = 317.9 / 18.8            = 16.9 people (average)
Productivity = 65,616 / 317.9 ≈ 206 LOC per person-month
```

---

## 5. Cost

Cost = effort × average fully loaded cost per person-month (salary plus overheads). The rates
are **assumptions**; replace them with your own figures, since cost scales linearly.

| Basis | Rate per person-month | Effort | **Estimated cost** |
|---|---:|---:|---:|
| India (mid-level team) | ₹1,00,000 | 317.9 PM | **₹3.18 crore** (₹3,17,91,957) |
| International (USD) | $8,000 | 317.9 PM | **$2.54 million** |

### Effort by phase (approximate COCOMO distribution, semi-detached)

| Phase | Share | Effort (PM) | Cost at ₹1,00,000/PM |
|---|---:|---:|---:|
| Plans & requirements (added on top) | 7% | 22.3 | ₹22.3 lakh |
| Product design | 17% | 54.0 | ₹54.0 lakh |
| Detailed design | 25% | 79.5 | ₹79.5 lakh |
| Code & unit test | 33% | 104.9 | ₹1.05 crore |
| Integration & test | 25% | 79.5 | ₹79.5 lakh |

---

## 6. Sensitivity

| Scenario | KLOC | Effort (PM) | Time (months) | Staff | Cost (₹1L/PM) |
|---|---:|---:|---:|---:|---:|
| Basic, semi-detached | 65.62 | 325.2 | 18.9 | 17.2 | ₹3.25 crore |
| **Intermediate, semi-detached (selected)** | **65.62** | **317.9** | **18.8** | **16.9** | **₹3.18 crore** |
| Intermediate, semi-detached, tests included | 76.80 | 379.2 | 20.0 | 19.0 | ₹3.79 crore |
| Intermediate, organic (lower bound) | 65.62 | 253.0 | 20.5 | 12.4 | ₹2.53 crore |

---

## 7. Summary

> **LOC-based three-point method (§1A):** 14 modules, expected size **67,724 LOC** (±2,022).
> At 620 LOC per person-month and ₹1,00,000 per person-month, that gives **₹161.29 per LOC**,
> **109.2 person-months** of effort and a total cost of **≈ ₹1.09 crore** (≈ $0.87 M).
>
> **COCOMO (§3–§4):** on the measured 65.6 KLOC, Intermediate COCOMO (semi-detached,
> EAF 0.978) estimates **≈ 318 person-months**, about **19 months** with an average team of
> **≈ 17 people**, costing **≈ ₹3.18 crore**. This is the conservative upper bound.

### Limitations

- COCOMO 81 was calibrated on 1970s–80s projects. It estimates what a **conventional team**
  would spend; modern frameworks, open-source libraries (FastAPI, Next.js, scikit-learn,
  vectorbt) and AI-assisted development reduce real effort considerably.
- Lines of code are measured after the fact, so this is a **retrospective sizing**, not a
  prediction made before development.
- TypeScript, CSS, YAML and SQL lines are counted alongside Python; COCOMO does not
  distinguish languages, which adds some uncertainty.
- Third-party code is excluded (`node_modules`, the virtualenv, and the separate
  `TradingAgents` and `OpenTerminal` repositories), so only code written for this
  project is counted.
- Rates per person-month are assumptions; costs scale linearly with them.
