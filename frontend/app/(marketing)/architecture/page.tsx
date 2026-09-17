import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Architecture — Stellix Labs",
  description:
    "The full technical architecture: Next.js frontend, FastAPI backend, PostgreSQL + TimescaleDB + Neo4j data layer, Redis, Docker, and six intelligence services — explained progressively.",
};

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const LAYERS = [
  {
    id: "frontend",
    number: "01",
    name: "User Interface",
    accent: "#75A8FF",
    summary: "The analyst-facing application.",
    body: "Built in Next.js with the App Router. Role-based routing means each user role — Researcher, Compliance Officer, Risk Manager, CIO — sees only the pages and data relevant to their function. The interface is a thin client: business logic lives in the API layer, not the browser.",
    stack: ["Next.js 15", "React", "TypeScript", "Tailwind CSS", "shadcn/ui"],
  },
  {
    id: "backend",
    number: "02",
    name: "API and Service Layer",
    accent: "#A79CFF",
    summary: "FastAPI handles every request. Python handles every computation.",
    body: "A FastAPI application serves the REST API. Background jobs — regime detection runs, evolution cycles, failure monitoring — run as separate async services managed by a task queue. Real-time notifications travel over WebSocket connections managed by a dedicated service.",
    stack: ["FastAPI", "Python", "SQLAlchemy", "Celery / ARQ", "WebSocket"],
    services: [
      { name: "Background Job Service", body: "Runs regime detection, backtests, validation, and evolution cycles asynchronously. Jobs are queued, tracked, and logged." },
      { name: "Real-Time Notification Service", body: "Pushes live status updates to the frontend over WebSocket — failure triggers, job completions, approval requests." },
      { name: "SuperAdmin Control Service", body: "Manages organisation provisioning, user role assignment, and system-level configuration. Isolated from the main application context." },
    ],
  },
  {
    id: "data",
    number: "03",
    name: "Data Storage",
    accent: "#69D4AB",
    summary: "Three specialised databases. Each chosen for what it does best.",
    body: "No single database fits every data shape in quantitative research. PostgreSQL holds relational data with tenant isolation enforced at the ORM layer. TimescaleDB extends Postgres for time-series market data with time-bucketing and continuous aggregates. Neo4j holds the knowledge graph — strategies, regimes, failures, and analysts connected by typed edges.",
    stack: ["PostgreSQL 16", "TimescaleDB", "Neo4j 5"],
    stores: [
      { name: "PostgreSQL + TimescaleDB", body: "Strategies, backtests, validations, failure records, audit logs, and time-series market data. Every table carries organization_id from migration one. The ORM injects tenant filters automatically — a query without a tenant bound raises rather than leaking." },
      { name: "Neo4j", body: "The knowledge graph. Six node types (Strategy, Regime, Failure, Performance, ResearchNote, Analyst), eight edge types. Every Cypher query is validated to reference $organization_id before execution." },
    ],
  },
  {
    id: "infrastructure",
    number: "04",
    name: "Infrastructure",
    accent: "#D8A65B",
    summary: "Predictable, containerised, horizontally scalable.",
    body: "Redis serves as both the task queue broker and the caching layer. Docker containers isolate each service. The architecture is designed to scale horizontally — additional API workers, job workers, and WebSocket servers can be added without schema changes.",
    stack: ["Redis", "Docker", "Docker Compose"],
  },
  {
    id: "intelligence",
    number: "05",
    name: "Intelligence Systems",
    accent: "#E38A9A",
    summary: "Six services that turn data into institutional knowledge.",
    body: "The intelligence layer is where the platform's core value is created. Six services run on top of the data layer, each responsible for a distinct type of analysis or knowledge creation. They share the same data stores and write their outputs to the same knowledge graph.",
    services: [
      { name: "Regime Detection Engine", body: "Four algorithms — HMM, PELT, GMM, GARCH — run on every ingest. An ensemble vote labels each bar. Six possible regimes: Bull, Bear, High-Volatility, Low-Volatility, Sideways, Crisis. The Crisis label can override the ensemble fast." },
      { name: "Validation Engine", body: "Five methods — Walk-Forward, Monte Carlo, Permutation, Bootstrap, Regime-Specific — produce individual scores. The aggregate robustness score gates promotion. Threshold: 0.70." },
      { name: "Failure Intelligence Service", body: "Monitors active strategies for four trigger conditions: drawdown_breach, sharpe_decline, regime_mismatch, time_based_review. On trigger, writes an immutable failure record with SHAP attributions to both Postgres and Neo4j." },
      { name: "Knowledge Graph Service", body: "Reads from Postgres and writes enriched nodes and edges to Neo4j. Maintains five named query patterns that surface recurring failure modes, under-explored regimes, and strategy lineage." },
      { name: "Evolutionary Strategy Engine", body: "A genetic algorithm that seeds from validated active strategies. Mutates parameters and logic trees. Registers offspring with parent_strategy_id, evolution_generation, and mutation description. The lineage is queryable in the graph." },
      { name: "LLM Research Assistant", body: "A conversational interface with access to the knowledge graph, failure records, and regime history. Generates strategy DSL JSON directly. Saves drafts with full provenance — analyst, timestamp, model, and the original prompt." },
    ],
  },
];

const TENANCY_PRINCIPLES = [
  {
    heading: "Every table carries organization_id from migration one.",
    body: "Multi-tenancy is not a filter added later. It is in the schema from the first migration. There is no period in the codebase history where tenant isolation was not enforced.",
  },
  {
    heading: "ORM queries fail closed, not open.",
    body: "A SQLAlchemy loader-criteria listener injects the tenant filter into every ORM query automatically. A query without an organisation bound does not silently return all rows — it raises an exception.",
  },
  {
    heading: "Neo4j enforces the same contract.",
    body: "Neo4j has no row-level security. So every Cypher query is validated by a helper that refuses to execute it if $organization_id is not referenced. Tenant isolation in the graph is structural, not a convention.",
  },
];

const TECH_TABLE = [
  { layer: "Frontend", tech: "Next.js, React, TypeScript, Tailwind CSS", purpose: "Role-based analyst interface, server-rendered pages, real-time updates" },
  { layer: "API", tech: "FastAPI, Python 3.12", purpose: "REST API, authentication, authorisation, business logic routing" },
  { layer: "Task Queue", tech: "ARQ / Celery, Redis", purpose: "Async jobs: regime detection, validation runs, evolution cycles" },
  { layer: "Realtime", tech: "WebSocket, FastAPI", purpose: "Live failure alerts, job status notifications, approval prompts" },
  { layer: "Relational DB", tech: "PostgreSQL 16, SQLAlchemy", purpose: "Strategies, backtests, failures, audit logs, user data" },
  { layer: "Time-Series", tech: "TimescaleDB", purpose: "OHLCV market data, feature series, regime label history" },
  { layer: "Graph DB", tech: "Neo4j 5, Cypher", purpose: "Knowledge graph — 6 node types, 8 edge types, 5 named queries" },
  { layer: "Cache / Broker", tech: "Redis", purpose: "Task queue broker, session cache, regime label cache" },
  { layer: "Containers", tech: "Docker, Docker Compose", purpose: "Service isolation, consistent deployment, horizontal scaling" },
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

function Divider() {
  return <div className="my-20 h-px bg-white/[0.06]" />;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ArchitecturePage() {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "#08080B", color: "#F4F3F7" }}
    >
      {/* ── Hero ── */}
      <section className="border-b border-white/[0.06] px-6 py-24 sm:px-12 lg:px-20">
        <div className="mx-auto max-w-4xl">
          <SectionLabel>Architecture</SectionLabel>
          <h1
            className="text-[clamp(2.2rem,4.5vw,3.8rem)] font-medium leading-[1.06] tracking-[-0.04em]"
            style={{ color: "#F4F3F7" }}
          >
            Designed for research that
            <br />
            compounds over time.
          </h1>
          <p
            className="mt-7 max-w-2xl text-[17px] leading-[1.8]"
            style={{ color: "rgba(244,243,247,0.5)" }}
          >
            Five layers. Six intelligence services. Multi-tenant from migration
            one. This page explains the architecture progressively — from the
            user interface down to the knowledge graph.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 py-20 sm:px-12 lg:px-20">

        {/* ── Progressive Layer Breakdown ── */}
        <section>
          <SectionLabel>System Layers</SectionLabel>
          <h2
            className="mb-4 text-[clamp(1.6rem,3vw,2.2rem)] font-medium leading-tight tracking-[-0.03em]"
            style={{ color: "#F4F3F7" }}
          >
            Five layers. Each with a distinct responsibility.
          </h2>
          <p
            className="mb-16 max-w-xl text-[15px] leading-[1.75]"
            style={{ color: "rgba(244,243,247,0.46)" }}
          >
            The architecture is progressive: user interaction flows downward through
            the API layer, into storage, and back up through intelligence services
            as enriched, structured knowledge.
          </p>

          <div className="space-y-12">
            {LAYERS.map((layer) => (
              <div
                key={layer.id}
                className="rounded-2xl border p-7"
                style={{
                  backgroundColor: "#0D0D13",
                  borderColor: "rgba(255,255,255,0.07)",
                }}
              >
                {/* Layer header */}
                <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <span
                      className="font-mono text-[11px] font-semibold tracking-[0.1em]"
                      style={{ color: `${layer.accent}60` }}
                    >
                      {layer.number}
                    </span>
                    <div>
                      <h3
                        className="text-[19px] font-semibold tracking-[-0.02em]"
                        style={{ color: "#F4F3F7" }}
                      >
                        {layer.name}
                      </h3>
                      <p
                        className="mt-0.5 text-[12px] font-medium"
                        style={{ color: layer.accent }}
                      >
                        {layer.summary}
                      </p>
                    </div>
                  </div>
                  {/* Stack pills */}
                  {layer.stack && (
                    <div className="flex flex-wrap gap-1.5">
                      {layer.stack.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
                          style={{
                            borderColor: `${layer.accent}30`,
                            color: layer.accent,
                            backgroundColor: `${layer.accent}0D`,
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Body */}
                <p
                  className="mb-5 text-[14px] leading-[1.75]"
                  style={{ color: "rgba(244,243,247,0.55)" }}
                >
                  {layer.body}
                </p>

                {/* Services sub-list (API / Intelligence layers) */}
                {layer.services && (
                  <div className="mt-6 space-y-4 border-t border-white/[0.05] pt-6">
                    {layer.services.map((s) => (
                      <div key={s.name} className="flex gap-4">
                        <span
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: layer.accent, opacity: 0.55 }}
                        />
                        <div>
                          <h4
                            className="mb-1 text-[13px] font-semibold"
                            style={{ color: "#F4F3F7" }}
                          >
                            {s.name}
                          </h4>
                          <p
                            className="text-[13px] leading-[1.65]"
                            style={{ color: "rgba(244,243,247,0.45)" }}
                          >
                            {s.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Data stores sub-list */}
                {layer.stores && (
                  <div className="mt-6 space-y-4 border-t border-white/[0.05] pt-6">
                    {layer.stores.map((s) => (
                      <div key={s.name} className="flex gap-4">
                        <span
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: layer.accent, opacity: 0.55 }}
                        />
                        <div>
                          <h4
                            className="mb-1 text-[13px] font-semibold"
                            style={{ color: "#F4F3F7" }}
                          >
                            {s.name}
                          </h4>
                          <p
                            className="text-[13px] leading-[1.65]"
                            style={{ color: "rgba(244,243,247,0.45)" }}
                          >
                            {s.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* ── Multi-Tenancy ── */}
        <section>
          <SectionLabel>Multi-Tenancy</SectionLabel>
          <h2
            className="mb-4 text-[clamp(1.5rem,2.8vw,2.1rem)] font-medium leading-tight tracking-[-0.03em]"
            style={{ color: "#F4F3F7" }}
          >
            Fail-closed tenant isolation. Structural, not conventional.
          </h2>
          <p
            className="mb-12 max-w-xl text-[15px] leading-[1.75]"
            style={{ color: "rgba(244,243,247,0.46)" }}
          >
            The worst kind of multi-tenancy bug is a silent one — a query that
            returns another tenant&apos;s data without error. Stellix is designed so
            that cannot happen.
          </p>

          <div className="space-y-0 border-l border-white/[0.07]">
            {TENANCY_PRINCIPLES.map((p, i) => (
              <div key={i} className="relative pb-10 pl-8 last:pb-0">
                <span
                  className="absolute -left-[5px] top-[5px] h-2.5 w-2.5 rounded-full border"
                  style={{ backgroundColor: "#0D0D13", borderColor: "rgba(105,212,171,0.4)" }}
                />
                <h3
                  className="mb-2 text-[15px] font-semibold leading-snug"
                  style={{ color: "#F4F3F7" }}
                >
                  {p.heading}
                </h3>
                <p
                  className="text-[14px] leading-[1.7]"
                  style={{ color: "rgba(244,243,247,0.46)" }}
                >
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* ── Data Flow ── */}
        <section>
          <SectionLabel>Data Flow</SectionLabel>
          <h2
            className="mb-4 text-[clamp(1.5rem,2.8vw,2.1rem)] font-medium leading-tight tracking-[-0.03em]"
            style={{ color: "#F4F3F7" }}
          >
            From raw market data to institutional memory — the full path.
          </h2>

          <div className="mt-10 space-y-0">
            {[
              { step: 1, label: "User interaction", detail: "An analyst authors a strategy, requests a backtest, or queries a failure pattern through the Next.js frontend." },
              { step: 2, label: "API processing", detail: "FastAPI receives the request, enforces authentication and role-based authorisation, and routes to the appropriate service." },
              { step: 3, label: "Intelligence services process", detail: "Depending on the action: regime detection labels the data, the validation engine scores the strategy, or the failure intelligence service monitors a live position." },
              { step: 4, label: "Data is written to storage", detail: "Results land in PostgreSQL (structured records), TimescaleDB (time-series), and Neo4j (graph relationships). All writes are tenant-scoped." },
              { step: 5, label: "Knowledge graph enriches", detail: "The Knowledge Graph Service reads new records and creates or updates nodes and edges in Neo4j. Patterns become queryable." },
              { step: 6, label: "Governance gates control promotion", detail: "Before a strategy can become active, it must pass the 0.70 robustness gate and receive explicit approval from a designated role. The approval is logged immutably." },
              { step: 7, label: "Intelligence compounds", detail: "Every failure, every evolution cycle, every approval adds to the graph. Future queries return richer results. Research compounds over time." },
            ].map((item) => (
              <div
                key={item.step}
                className="flex gap-5 border-b border-white/[0.05] py-6 last:border-b-0"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold"
                  style={{
                    borderColor: "rgba(167,156,255,0.3)",
                    color: "#A79CFF",
                    backgroundColor: "rgba(167,156,255,0.06)",
                  }}
                >
                  {item.step}
                </span>
                <div>
                  <h4
                    className="mb-1 text-[14px] font-semibold"
                    style={{ color: "#F4F3F7" }}
                  >
                    {item.label}
                  </h4>
                  <p
                    className="text-[13px] leading-[1.7]"
                    style={{ color: "rgba(244,243,247,0.45)" }}
                  >
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* ── Technology Table ── */}
        <section>
          <SectionLabel>Technology Stack</SectionLabel>
          <h2
            className="mb-8 text-[clamp(1.5rem,2.8vw,2.1rem)] font-medium leading-tight tracking-[-0.03em]"
            style={{ color: "#F4F3F7" }}
          >
            The locked, boring-on-purpose stack.
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  {["Layer", "Technology", "Purpose"].map((h) => (
                    <th
                      key={h}
                      className="pb-3 pr-6 text-[10px] font-semibold uppercase tracking-[0.18em]"
                      style={{ color: "rgba(244,243,247,0.28)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TECH_TABLE.map((row) => (
                  <tr key={row.layer} className="border-b border-white/[0.05]">
                    <td
                      className="py-4 pr-6 text-[13px] font-medium"
                      style={{ color: "#F4F3F7" }}
                    >
                      {row.layer}
                    </td>
                    <td
                      className="py-4 pr-6 text-[13px] font-mono"
                      style={{ color: "#A79CFF" }}
                    >
                      {row.tech}
                    </td>
                    <td
                      className="py-4 text-[13px]"
                      style={{ color: "rgba(244,243,247,0.44)" }}
                    >
                      {row.purpose}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <Divider />

        {/* ── CTA ── */}
        <section className="text-center">
          <h2
            className="mb-3 text-[clamp(1.4rem,2.5vw,2rem)] font-medium tracking-[-0.025em]"
            style={{ color: "#F4F3F7" }}
          >
            See the architecture running in production.
          </h2>
          <p
            className="mb-8 text-[15px]"
            style={{ color: "rgba(244,243,247,0.44)" }}
          >
            Technical demo. We walk through the schema, the graph, and the intelligence services.
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
              href="/features"
              className="inline-flex h-11 items-center rounded-full border px-7 text-[13px] font-medium transition-opacity hover:opacity-80"
              style={{ borderColor: "rgba(255,255,255,0.12)", color: "rgba(244,243,247,0.65)" }}
            >
              Explore Features →
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
