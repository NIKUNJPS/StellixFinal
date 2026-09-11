import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Product Overview — Stellix Labs",
  description:
    "Stellix Labs preserves failure intelligence, detects market regime shifts, and compounds institutional knowledge over time. Three intelligence systems. One research loop.",
};

// ---------------------------------------------------------------------------
// Static content
// ---------------------------------------------------------------------------

const PROBLEMS = [
  {
    number: "01",
    heading: "Research knowledge disappears.",
    body: "When a strategy fails, the investigation stops. The team moves on. The lessons — why it failed, under which market regime, what the SHAP attribution showed — are lost. Six months later, a different analyst repeats the same experiment.",
  },
  {
    number: "02",
    heading: "Teams repeat failed experiments.",
    body: "Without a systematic record, failed strategies get re-authored, re-backtested, and re-submitted. The organisation pays twice for the same dead end. The knowledge that could have prevented it was never captured.",
  },
  {
    number: "03",
    heading: "Institutional intelligence cannot compound.",
    body: "Individual analysts are skilled. But their knowledge walks out the door. There is no connective tissue between a failure last quarter and the regime conditions today. Research remains episodic, not cumulative.",
  },
];

const SYSTEMS = [
  {
    name: "Regime-Conditioning",
    accent: "#A79CFF",
    tagline: "Context is not optional.",
    body: "Every strategy evaluation — backtest, validation, failure record — is labelled with its market regime. Bull, Bear, High-Volatility, Low-Volatility, Sideways, or Crisis. A Sharpe ratio without regime context is noise. Stellix makes regime context structural.",
    detail: "Four detection algorithms (HMM, PELT, GMM, GARCH) form an ensemble. Each bar of data is voted on and labelled. The label is written to the record permanently.",
  },
  {
    name: "Failure-as-Asset",
    accent: "#69D4AB",
    tagline: "Failure is not deleted. It is indexed.",
    body: "When a strategy triggers a failure condition — drawdown breach, Sharpe decline, regime mismatch, or time-based review — an immutable failure record is written. It includes the regime context, the SHAP attribution, the trigger condition, and a research note.",
    detail: "The failures table carries REVOKE UPDATE, DELETE at the database level. No one can rewrite a failure record. Every failure becomes permanent institutional memory.",
  },
  {
    name: "Compounding Memory",
    accent: "#D8A65B",
    tagline: "Knowledge connects across time.",
    body: "A Neo4j knowledge graph connects strategies, regimes, failures, performance records, and research notes. Analysts can query: which strategies failed in the same regime? What trigger conditions recur? What hypotheses have been tested before?",
    detail: "Six node types, eight edge types. Five named Cypher queries surface the most operationally useful patterns — recurring failure modes, under-explored regimes, strategy lineage.",
  },
];

const LOOP_STEPS = [
  { step: "Ingest", body: "Market data is pulled, cleaned, and stamped with temporal integrity guarantees." },
  { step: "Detect", body: "Four algorithms label every bar with a market regime. The ensemble votes." },
  { step: "Author", body: "A strategy is written — via the JSON DSL or drafted by the LLM assistant." },
  { step: "Backtest", body: "Simulation runs per regime. Performance metrics are split by market context." },
  { step: "Validate", body: "Five validation methods produce a robustness score. Gate threshold: 0.70." },
  { step: "Promote", body: "Strategies above threshold are promoted to active. Below threshold stay as candidates." },
  { step: "Monitor", body: "Live strategies are watched for drawdown, Sharpe decline, and regime mismatch." },
  { step: "Record", body: "Any failure trigger writes an immutable, SHAP-attributed failure record to the graph." },
  { step: "Evolve", body: "A genetic algorithm seeds from survivors. Offspring are registered with full lineage." },
  { step: "Query", body: "Analysts query accumulated failure patterns. Research compounds across time." },
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

export default function ProductOverviewPage() {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "#08080B", color: "#F4F3F7" }}
    >
      {/* ── Hero ── */}
      <section className="border-b border-white/[0.06] px-6 py-24 sm:px-12 lg:px-20">
        <div className="mx-auto max-w-4xl">
          <SectionLabel>Product Overview</SectionLabel>
          <h1
            className="text-[clamp(2.4rem,5vw,4.2rem)] font-medium leading-[1.05] tracking-[-0.04em]"
            style={{ color: "#F4F3F7" }}
          >
            Institutional research infrastructure
            <br />
            for quantitative teams.
          </h1>
          <p
            className="mt-8 max-w-2xl text-[17px] leading-[1.8]"
            style={{ color: "rgba(244,243,247,0.5)" }}
          >
            Stellix Labs preserves failure intelligence, detects market regime
            shifts, and compounds institutional knowledge over time. Research
            becomes connected, searchable, and reusable — across strategies,
            analysts, and market cycles.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/contact"
              className="inline-flex h-11 items-center rounded-full px-6 text-[13px] font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#A79CFF", color: "#08080B" }}
            >
              Request Demo
            </Link>
            <Link
              href="/architecture"
              className="inline-flex h-11 items-center rounded-full border px-6 text-[13px] font-medium transition-opacity hover:opacity-80"
              style={{ borderColor: "rgba(255,255,255,0.12)", color: "rgba(244,243,247,0.7)" }}
            >
              View Architecture →
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 py-20 sm:px-12 lg:px-20">

        {/* ── The Problem ── */}
        <section>
          <SectionLabel>The Problem</SectionLabel>
          <h2
            className="mb-14 max-w-2xl text-[clamp(1.6rem,3vw,2.4rem)] font-medium leading-tight tracking-[-0.03em]"
            style={{ color: "#F4F3F7" }}
          >
            Institutional amnesia is the invisible cost in quantitative research.
          </h2>

          <div className="space-y-10">
            {PROBLEMS.map((p) => (
              <div key={p.number} className="flex gap-8">
                <span
                  className="shrink-0 pt-1 font-mono text-[11px] font-semibold tracking-[0.1em]"
                  style={{ color: "rgba(167,156,255,0.4)" }}
                >
                  {p.number}
                </span>
                <div>
                  <h3
                    className="mb-2 text-[17px] font-semibold leading-tight"
                    style={{ color: "#F4F3F7" }}
                  >
                    {p.heading}
                  </h3>
                  <p
                    className="text-[15px] leading-[1.75]"
                    style={{ color: "rgba(244,243,247,0.48)" }}
                  >
                    {p.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* ── Three Intelligence Systems ── */}
        <section>
          <SectionLabel>The Stellix Solution</SectionLabel>
          <h2
            className="mb-4 max-w-2xl text-[clamp(1.6rem,3vw,2.4rem)] font-medium leading-tight tracking-[-0.03em]"
            style={{ color: "#F4F3F7" }}
          >
            Three intelligence systems. One compounding research loop.
          </h2>
          <p
            className="mb-16 max-w-xl text-[15px] leading-[1.75]"
            style={{ color: "rgba(244,243,247,0.48)" }}
          >
            Regime-Conditioning, Failure-as-Asset, and Compounding Memory are not features.
            They are the architectural pillars that make research cumulative instead of episodic.
          </p>

          <div className="space-y-16">
            {SYSTEMS.map((sys, i) => (
              <div key={sys.name} className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
                <div>
                  <div className="mb-3 flex items-center gap-3">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: sys.accent, boxShadow: `0 0 12px ${sys.accent}` }}
                    />
                    <span
                      className="text-[10px] font-semibold uppercase tracking-[0.22em]"
                      style={{ color: sys.accent }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3
                    className="mb-2 text-[22px] font-semibold tracking-[-0.02em]"
                    style={{ color: "#F4F3F7" }}
                  >
                    {sys.name}
                  </h3>
                  <p
                    className="mb-4 text-[13px] font-medium italic"
                    style={{ color: sys.accent }}
                  >
                    {sys.tagline}
                  </p>
                  <p
                    className="text-[15px] leading-[1.75]"
                    style={{ color: "rgba(244,243,247,0.5)" }}
                  >
                    {sys.body}
                  </p>
                </div>
                <div
                  className="rounded-2xl border p-6"
                  style={{
                    backgroundColor: "#0D0D13",
                    borderColor: "rgba(255,255,255,0.07)",
                  }}
                >
                  <p
                    className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]"
                    style={{ color: "rgba(244,243,247,0.28)" }}
                  >
                    How it works
                  </p>
                  <p
                    className="text-[14px] leading-[1.75]"
                    style={{ color: "rgba(244,243,247,0.6)" }}
                  >
                    {sys.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* ── The Research Loop ── */}
        <section>
          <SectionLabel>How They Work Together</SectionLabel>
          <h2
            className="mb-4 max-w-2xl text-[clamp(1.6rem,3vw,2.4rem)] font-medium leading-tight tracking-[-0.03em]"
            style={{ color: "#F4F3F7" }}
          >
            The research lifecycle — one loop that gets smarter each turn.
          </h2>
          <p
            className="mb-14 max-w-xl text-[15px] leading-[1.75]"
            style={{ color: "rgba(244,243,247,0.48)" }}
          >
            Each cycle adds to the institutional knowledge base. Failures are
            preserved, not discarded. Successes are traceable, not incidental. The
            loop compounds.
          </p>

          <ol className="relative space-y-0 border-l border-white/[0.07]">
            {LOOP_STEPS.map((s, i) => (
              <li key={s.step} className="relative pb-8 pl-10 last:pb-0">
                {/* Timeline node */}
                <span
                  className="absolute -left-[9px] top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border text-[8px] font-bold"
                  style={{
                    backgroundColor: "#0D0D13",
                    borderColor: "rgba(167,156,255,0.35)",
                    color: "#A79CFF",
                  }}
                >
                  {i + 1}
                </span>
                <h4
                  className="mb-1 text-[14px] font-semibold"
                  style={{ color: "#F4F3F7" }}
                >
                  {s.step}
                </h4>
                <p
                  className="text-[13px] leading-[1.7]"
                  style={{ color: "rgba(244,243,247,0.46)" }}
                >
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <Divider />

        {/* ── CTA ── */}
        <section className="text-center">
          <h2
            className="mb-4 text-[clamp(1.4rem,2.5vw,2rem)] font-medium tracking-[-0.025em]"
            style={{ color: "#F4F3F7" }}
          >
            Ready to see it in action?
          </h2>
          <p
            className="mb-8 text-[15px]"
            style={{ color: "rgba(244,243,247,0.46)" }}
          >
            30-minute technical demo. No slides. Real product.
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
