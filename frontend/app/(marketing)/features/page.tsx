import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Features — Stellix Labs",
  description:
    "Regime-Aware Evaluation, Failure Preservation, Institutional Memory Graph, Multi-Method Validation, Evolutionary Strategy Improvement, LLM Research Assistant, Governance, Audit Trails, and Multi-Tenant Infrastructure.",
};

// ---------------------------------------------------------------------------
// Feature data — grouped into logical sections
// ---------------------------------------------------------------------------

const FEATURE_GROUPS = [
  {
    group: "Research Intelligence",
    description:
      "The systems that make research regime-aware, context-rich, and genuinely informed by history.",
    features: [
      {
        name: "Regime-Aware Evaluation",
        body: "Every backtest and validation run is split and labelled by market regime — Bull, Bear, High-Volatility, Low-Volatility, Sideways, or Crisis. A strategy is never evaluated in aggregate. It is evaluated in context.",
        detail:
          "Four detection algorithms (HMM, PELT, GMM, GARCH) form an ensemble. Each bar receives a voted regime label. The label is written into every downstream record permanently.",
      },
      {
        name: "Failure Preservation",
        body: "When a strategy triggers a failure condition, an immutable record is written. It captures the regime at failure, the trigger condition, SHAP feature attributions, and the performance breakdown.",
        detail:
          "Four trigger conditions: drawdown_breach, sharpe_decline, regime_mismatch, time_based_review. The failures table carries REVOKE UPDATE, DELETE at the database level — no record can be overwritten.",
      },
      {
        name: "LLM Research Assistant",
        body: "A conversational interface for strategy drafting, failure analysis, and hypothesis exploration. The assistant has access to the knowledge graph, failure records, and regime history.",
        detail:
          "The assistant generates strategy DSL JSON directly. Drafts are saved as candidates with full provenance — analyst, timestamp, source model, and the original prompt.",
      },
    ],
  },
  {
    group: "Validation and Reliability",
    description:
      "Multiple independent methods to confirm that a strategy's performance is real, not a statistical artifact.",
    features: [
      {
        name: "Multi-Method Validation",
        body: "Five validation methods run on every strategy before it can be promoted to active: Walk-Forward, Monte Carlo, Permutation, Bootstrap, and Regime-Specific analysis. Each produces a score. The aggregate must exceed 0.70.",
        detail:
          "The 0.70 robustness gate is not configurable by default — it is a structural constraint. A strategy below threshold stays as a candidate regardless of backtest performance.",
      },
      {
        name: "Evolutionary Strategy Improvement",
        body: "A genetic algorithm seeds from validated, active strategies and their failure records. It mutates parameters, recombines logic trees, and registers the fittest offspring — with full lineage tracing.",
        detail:
          "Offspring inherit parent_strategy_id, evolution_generation, and the mutation description. The lineage graph in Neo4j makes the evolutionary path queryable at any depth.",
      },
    ],
  },
  {
    group: "Institutional Memory",
    description:
      "The connective tissue that makes research cumulative rather than episodic.",
    features: [
      {
        name: "Institutional Memory Graph",
        body: "A Neo4j knowledge graph connects strategies, regimes, failures, performance records, research notes, and analysts. Patterns that span years and multiple strategy generations become queryable.",
        detail:
          "Six node types: Strategy, Regime, Failure, Performance, ResearchNote, Analyst. Eight edge types including FAILED_IN, CAUSED_BY, EVOLVED_FROM, DOCUMENTED_BY. Five named Cypher queries surface the most operationally useful patterns.",
      },
    ],
  },
  {
    group: "Governance and Control",
    description:
      "Institutional-grade controls for research promotion, audit trails, and multi-tenant data isolation.",
    features: [
      {
        name: "Governance and Approval Gates",
        body: "Strategies require explicit approval by a designated role before promotion to active. The approval workflow is configurable per organisation. No strategy can self-promote.",
        detail:
          "Approval actions are logged with approver identity, timestamp, and rationale. Rejection triggers a candidate status update and notifies the originating analyst.",
      },
      {
        name: "Audit Trails",
        body: "Every significant action — strategy creation, approval, rejection, failure trigger, evolution run, graph query — is recorded with actor, timestamp, and context. Audit logs are immutable.",
        detail:
          "The audit log is designed for compliance review. Fields include: action_type, actor_id, resource_id, resource_type, regime_context, and a free-text rationale field.",
      },
      {
        name: "Multi-Tenant Research Infrastructure",
        body: "Every table that holds research data carries an organisation_id from migration one. A SQLAlchemy loader-criteria listener injects the tenant filter into every ORM query automatically.",
        detail:
          "A query against tenant data with no organisation bound doesn't silently return everything — it raises. Neo4j enforces the same constraint: every Cypher query is validated to reference $organization_id before execution.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#A79CFF]">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FeaturesPage() {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "#08080B", color: "#F4F3F7" }}
    >
      {/* ── Hero ── */}
      <section className="border-b border-white/[0.06] px-6 py-24 sm:px-12 lg:px-20">
        <div className="mx-auto max-w-4xl">
          <SectionLabel>Features</SectionLabel>
          <h1
            className="text-[clamp(2.2rem,4.5vw,3.8rem)] font-medium leading-[1.06] tracking-[-0.04em]"
            style={{ color: "#F4F3F7" }}
          >
            Nine capabilities. Each one
            <br />
            earns its place.
          </h1>
          <p
            className="mt-7 max-w-2xl text-[17px] leading-[1.8]"
            style={{ color: "rgba(244,243,247,0.5)" }}
          >
            Stellix Labs is not a collection of dashboards. Every feature serves
            the core mission: preserving failure intelligence, detecting regime
            shifts, and compounding institutional memory.
          </p>
        </div>
      </section>

      {/* ── Feature Groups ── */}
      <div className="mx-auto max-w-5xl px-6 py-20 sm:px-12 lg:px-20">
        <div className="space-y-24">
          {FEATURE_GROUPS.map((group, gi) => (
            <section key={group.group}>
              {/* Group header */}
              <div className="mb-12 flex items-start gap-6">
                <span
                  className="shrink-0 pt-1 font-mono text-[10px] font-semibold tracking-[0.1em]"
                  style={{ color: "rgba(167,156,255,0.35)" }}
                >
                  {String(gi + 1).padStart(2, "0")}
                </span>
                <div>
                  <h2
                    className="mb-2 text-[22px] font-semibold tracking-[-0.02em]"
                    style={{ color: "#F4F3F7" }}
                  >
                    {group.group}
                  </h2>
                  <p
                    className="max-w-lg text-[14px] leading-[1.7]"
                    style={{ color: "rgba(244,243,247,0.46)" }}
                  >
                    {group.description}
                  </p>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-1 pl-12">
                {group.features.map((f) => (
                  <details
                    key={f.name}
                    className="group border-b border-white/[0.06] last:border-b-0"
                  >
                    <summary
                      className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 transition-colors duration-150"
                      style={{ color: "#F4F3F7" }}
                    >
                      <div className="flex items-start gap-4">
                        <span
                          className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: "#A79CFF", opacity: 0.6 }}
                        />
                        <div>
                          <h3
                            className="text-[16px] font-medium leading-snug"
                            style={{ color: "#F4F3F7" }}
                          >
                            {f.name}
                          </h3>
                          <p
                            className="mt-1 text-[13px] leading-[1.65]"
                            style={{ color: "rgba(244,243,247,0.46)" }}
                          >
                            {f.body}
                          </p>
                        </div>
                      </div>
                      {/* Expand / collapse indicator */}
                      <span
                        className="shrink-0 text-[18px] font-thin transition-transform duration-200 group-open:rotate-45"
                        style={{ color: "rgba(167,156,255,0.5)" }}
                        aria-hidden
                      >
                        +
                      </span>
                    </summary>

                    {/* Technical detail — visible when expanded */}
                    <div
                      className="mb-5 ml-5 rounded-xl border-l-2 pl-5"
                      style={{
                        borderColor: "rgba(167,156,255,0.22)",
                      }}
                    >
                      <p
                        className="text-[13px] leading-[1.75]"
                        style={{ color: "rgba(244,243,247,0.5)" }}
                      >
                        {f.detail}
                      </p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* ── Bottom CTA ── */}
        <div className="mt-24 border-t border-white/[0.06] pt-16 text-center">
          <h2
            className="mb-3 text-[clamp(1.4rem,2.5vw,2rem)] font-medium tracking-[-0.025em]"
            style={{ color: "#F4F3F7" }}
          >
            See every feature running live.
          </h2>
          <p
            className="mb-8 text-[15px]"
            style={{ color: "rgba(244,243,247,0.44)" }}
          >
            30-minute technical walkthrough. Real data. Real product.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/contact"
              className="inline-flex h-11 items-center rounded-full px-7 text-[13px] font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#A79CFF", color: "#08080B" }}
            >
              Request Demo
            </Link>
            <Link
              href="/architecture"
              className="inline-flex h-11 items-center rounded-full border px-7 text-[13px] font-medium transition-opacity hover:opacity-80"
              style={{ borderColor: "rgba(255,255,255,0.12)", color: "rgba(244,243,247,0.65)" }}
            >
              View Architecture →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
