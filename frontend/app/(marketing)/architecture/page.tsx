import type { Metadata } from "next";

import { CodePanel, DSL_SAMPLE, LINEAGE_SQL, MemoryMap, RECURRING_SQL } from "@/components/marketing/artifacts";
import { Reveal } from "@/components/marketing/reveal";
import { ButtonLink, CtaBand, Display, Eyebrow, PageHero, Section, SectionHeader, Tag } from "@/components/marketing/site";
import { TECH_STACK } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Architecture — multi-tenant, fail-closed, one database",
  description:
    "The technical architecture behind Stellix Labs: a fail-closed multi-tenancy model, Research Memory built from PostgreSQL with six record types and eight relationships, a structured strategy DSL and a deliberately boring stack.",
};

const STACK_LAYERS = [
  { name: "Application", color: "#4B3FD1", items: ["Next.js workspace", "FastAPI REST", "WebSocket events", "Role-based routing"] },
  { name: "Intelligence", color: "#1E9E63", items: ["Regime ensemble", "Regime-aware backtests", "Validation gate", "Failure monitor", "Evolution engine", "Research assistant"] },
  { name: "Memory", color: "#E59A1A", items: ["PostgreSQL 15", "TimescaleDB hypertables", "Research Memory index", "Append-only failures"] },
  { name: "Data", color: "#2F86D6", items: ["Pluggable OHLCV providers", "15+ indicators", "Temporal isolation", "Celery + Redis jobs"] },
];

const TENANCY_SNIPPET = `# every ORM query, automatically
GET /strategies          # → WHERE organization_id = :org
GET /failures/{id}       # → 404 if it belongs to another org

# a query with no tenant bound
POST /internal/report    # → raises TenantContextMissing`;

export default function ArchitecturePage() {
  return (
    <>
      <PageHero
        eyebrow="Architecture"
        title={
          <>
            For the evaluator who reads <em>the schema</em> before the pitch.
          </>
        }
        intro="No hand-waving. This page shows the real tenancy model, the real memory model and the real stack — the parts that are hardest to copy, shown rather than hidden."
      >
        <ButtonLink href="/docs" size="lg" arrow>
          Read the docs
        </ButtonLink>
        <ButtonLink href="/docs/api" variant="secondary" size="lg">
          API reference
        </ButtonLink>
      </PageHero>

      {/* Layer stack */}
      <Section>
        <SectionHeader eyebrow="The stack, layer by layer" title={<>Four layers, <em>clean boundaries.</em></>} />
        <div className="mt-14 space-y-3">
          {STACK_LAYERS.map((l, i) => (
            <Reveal key={l.name} delay={i * 80}>
              <div className="grid gap-4 rounded-2xl border border-line bg-paper-raised p-5 sm:grid-cols-[200px_1fr] sm:items-center sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="h-8 w-1.5 rounded-full" style={{ backgroundColor: l.color }} />
                  <div>
                    <p className="font-code text-[11px] text-ink-3">Layer {String(4 - i).padStart(2, "0")}</p>
                    <p className="text-[17px] font-semibold text-ink">{l.name}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {l.items.map((it) => (
                    <span key={it} className="rounded-lg border border-line bg-paper px-3 py-1.5 text-[13.5px] font-medium text-ink-2">
                      {it}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Tenancy */}
      <Section tone="ink" className="overflow-hidden">
        <div aria-hidden className="ink-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="relative grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-20">
          <div>
            <Eyebrow tone="light">Multi-tenancy</Eyebrow>
            <h2 className="mt-5 font-editorial text-[clamp(2rem,3.8vw,3rem)] leading-[1.05] tracking-[-0.02em] text-white text-balance">
              Multi-tenant from the first migration — <em className="text-brand-bright">and fail-closed.</em>
            </h2>
            <div className="mt-6 space-y-4 text-[16px] leading-[1.75] text-white/80">
              <p>
                Every table that holds client data carries an <code className="font-code text-signal">organization_id</code>. A
                loader-criteria listener injects the tenant filter into every ORM query; a query with no organization bound
                doesn&apos;t silently return everything — it raises.
              </p>
              <p>
                Research Memory inherits the same guarantee: every record in the index is keyed by its{" "}
                <code className="font-code text-signal">organization_id</code>, so a lookup can only ever reach the caller&apos;s
                own research.
              </p>
            </div>
          </div>
          <CodePanel code={TENANCY_SNIPPET} language="http" filename="tenancy.behaviour" />
        </div>
      </Section>

      {/* Research Memory */}
      <Section id="research-memory">
        <SectionHeader
          eyebrow="Research Memory"
          title={
            <>
              Six record types. Eight relationships. <em>Hover to trace them.</em>
            </>
          }
          intro="PostgreSQL is the single source of truth. Research Memory links its rows — strategies, failures, regimes, notes and researchers — into an index the API rebuilds on a schedule, so it can never drift from the database and there is no second database to run."
        />
        <div className="mt-14">
          <MemoryMap />
        </div>
        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_1.3fr] lg:items-center">
          <div>
            <Display size="md" as="h3">
              The questions a research desk <em>actually asks.</em>
            </Display>
            <p className="mt-4 text-[16px] leading-[1.75] text-ink-2">
              “Trace this evolved strategy back to the research note that inspired its ancestor.” “Which regimes cause recurring
              failures across all our momentum strategies?” Each is a single lookup — and each traces back to plain SQL tables.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["failed_strategies_by_regime", "lineage", "robust_across_regimes", "recurring_failure_modes", "hypotheses_leading_to_active"].map((q) => (
                <Tag key={q} tone="brand">
                  {q}
                </Tag>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <CodePanel code={RECURRING_SQL} language="sql" filename="recurring_failure_modes.sql" />
            <CodePanel code={LINEAGE_SQL} language="sql" filename="lineage.sql" />
          </div>
        </div>
      </Section>

      {/* DSL */}
      <Section tone="sunken">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-20">
          <CodePanel code={DSL_SAMPLE} language="json" filename="strategy.entry_rules.json" />
          <div>
            <Eyebrow>Strategy DSL</Eyebrow>
            <Display className="mt-5">
              Strategies are structured data, <em>not opaque code.</em>
            </Display>
            <p className="mt-5 text-[16.5px] leading-[1.75] text-ink-2">
              Entry and exit logic is a strict JSON tree — machine-evaluable and machine-generatable. That&apos;s why the genetic
              algorithm can evolve it and the assistant can draft it. <code className="font-code text-[14px] text-brand">crosses_above</code> and{" "}
              <code className="font-code text-[14px] text-brand">crosses_below</code> are genuine two-bar windows, not single-row
              approximations.
            </p>
          </div>
        </div>
      </Section>

      {/* Tech stack */}
      <Section>
        <SectionHeader eyebrow="The locked stack" title={<>Boring on purpose. <em>Proven everywhere.</em></>} />
        <div className="mt-12 overflow-hidden rounded-2xl border border-line bg-paper-raised">
          <table className="w-full text-left text-[14.5px]">
            <thead className="border-b border-line bg-paper-sunken/70">
              <tr>
                <th scope="col" className="px-5 py-3.5 font-code text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">Layer</th>
                <th scope="col" className="px-5 py-3.5 font-code text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">Technology</th>
                <th scope="col" className="hidden px-5 py-3.5 font-code text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3 md:table-cell">Why</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {TECH_STACK.map((row) => (
                <tr key={row.layer} className="transition-colors hover:bg-paper">
                  <td className="px-5 py-3.5 text-ink-2">{row.layer}</td>
                  <td className="px-5 py-3.5 font-semibold text-ink">{row.tech}</td>
                  <td className="hidden px-5 py-3.5 text-ink-2 md:table-cell">{row.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="h-4 bg-paper" />
      <CtaBand />
    </>
  );
}
