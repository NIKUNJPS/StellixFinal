import type { Metadata } from "next";

import { ArchitectureDiagram } from "@/components/marketing/architecture-diagram";
import { CodeBlock } from "@/components/marketing/code-block";
import { NeoSchemaDiagram } from "@/components/marketing/neo-schema-diagram";
import { Reveal } from "@/components/marketing/reveal";
import { Eyebrow, Section, SectionHeading, SectionIntro } from "@/components/marketing/section";
import { GRAPH_NODES, TECH_STACK } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Architecture — Multi-Tenant, Fail-Closed, Graph-Backed by Design",
  description:
    "The full technical architecture: a fail-closed multi-tenancy model, a Neo4j knowledge-graph schema of 6 nodes and 8 edges, and a locked, async, boring-on-purpose stack.",
};

const CYPHER = `// recurring_failure_modes — failure patterns shared across strategies
MATCH (s:Strategy)-[:FAILED_IN]->(r:Regime)
WHERE s.organization_id = $organization_id
MATCH (f:Failure {organization_id: $organization_id})-[:CAUSED_BY]->(p:Performance)
RETURN r.regime_label, f.trigger_condition, count(*) AS occurrences
ORDER BY occurrences DESC`;

const DSL = `{"operator": "AND",
 "conditions": [
   {"indicator": "rsi_14", "comparator": "<", "value": 30},
   {"indicator": "close", "comparator": "crosses_above", "value_ref": "sma_50"}]}`;

export default function ArchitecturePage() {
  return (
    <>
      <section className="border-b border-border/60">
        <div className="container py-20 lg:py-24">
          <Reveal className="max-w-3xl">
            <Eyebrow>Architecture</Eyebrow>
            <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
              For the evaluator who reads the schema before the pitch.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
              No hand-waving. This page shows the real multi-tenancy model, the real graph schema, and the real
              stack — the technical assets that are hardest for a competitor to copy, shown rather than hidden.
            </p>
          </Reveal>
        </div>
      </section>

      <Section>
        <Reveal>
          <SectionHeading>Four layers. Filter to isolate one.</SectionHeading>
        </Reveal>
        <div className="mt-10 rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-6">
          <ArchitectureDiagram variant="interactive" showFilters />
        </div>
      </Section>

      <Section className="bg-[#F7F9FC]">
        <Reveal className="max-w-3xl">
          <Eyebrow>Multi-Tenancy</Eyebrow>
          <SectionHeading>Multi-tenant from the first migration — and fail-closed.</SectionHeading>
          <SectionIntro className="max-w-3xl">
            Every table that holds client data carries an <code className="rounded bg-white/5 px-1 font-mono text-sm">organization_id</code>{" "}
            from migration one. A SQLAlchemy loader-criteria listener injects the tenant filter into every ORM
            query automatically; a query against tenant data with no organization bound doesn&apos;t silently return
            everything — it raises. Neo4j has no row-level security, so every single Cypher query filters by{" "}
            <code className="rounded bg-white/5 px-1 font-mono text-sm">$organization_id</code> through a helper that
            refuses to run a query that doesn&apos;t reference it. Tenant isolation is structural, not a convention
            someone has to remember.
          </SectionIntro>
        </Reveal>
      </Section>

      <Section id="graph-schema">
        <Reveal>
          <Eyebrow>Knowledge-Graph Schema</Eyebrow>
          <SectionHeading>The graph schema — 6 nodes, 8 edges.</SectionHeading>
          <SectionIntro>Hover a node to trace its edges. This is the real Batch 7 schema, not an illustration.</SectionIntro>
        </Reveal>
        <div className="mt-6 flex flex-wrap gap-2">
          {GRAPH_NODES.map((n) => (
            <span key={n} className="rounded-md border border-border bg-card/40 px-3 py-1.5 text-sm">
              {n}
            </span>
          ))}
        </div>
        <div className="mt-8">
          <NeoSchemaDiagram />
        </div>
        <div className="mt-10">
          <CodeBlock code={CYPHER} language="cypher" label="recurring_failure_modes.cypher" />
        </div>
      </Section>

      <Section className="bg-[#F7F9FC]">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <Eyebrow>Strategy DSL</Eyebrow>
            <SectionHeading>Strategies are structured data, not opaque code.</SectionHeading>
            <SectionIntro>
              A strategy&apos;s entry and exit logic is a strict, machine-evaluable and machine-generatable JSON
              tree — which is exactly why the genetic algorithm can evolve it and the LLM can draft it. The{" "}
              <code className="rounded bg-white/5 px-1 font-mono text-sm">crosses_above</code> /{" "}
              <code className="rounded bg-white/5 px-1 font-mono text-sm">crosses_below</code> comparators are
              genuine two-bar windows, not single-row approximations.
            </SectionIntro>
          </Reveal>
          <Reveal delay={80}>
            <CodeBlock code={DSL} language="json" label="entry_rules.json" />
          </Reveal>
        </div>
      </Section>

      <Section>
        <Reveal>
          <SectionHeading>The locked stack.</SectionHeading>
        </Reveal>
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-3 pr-4 font-medium">Layer</th>
                <th className="py-3 pr-4 font-medium">Technology</th>
                <th className="py-3 font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {TECH_STACK.map((t) => (
                <tr key={t.layer} className="border-b border-border/50">
                  <td className="py-3 pr-4 font-medium">{t.layer}</td>
                  <td className="py-3 pr-4 text-accent">{t.tech}</td>
                  <td className="py-3 text-muted-foreground">{t.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
