import type { Metadata } from "next";
import { Bot, FileLock2, KeyRound, Power, ScrollText, ShieldCheck, Users, Activity } from "lucide-react";

import { CodePanel } from "@/components/marketing/artifacts";
import { Reveal } from "@/components/marketing/reveal";
import { ButtonLink, Card, CtaBand, Display, Eyebrow, PageHero, Section, SectionHeader } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Security & governance",
  description:
    "Fail-closed tenant isolation, append-only failure records, scoped API keys, multi-factor sign-in, a governed research assistant and a complete audit trail.",
};

const CONTROLS = [
  { icon: Users, title: "Fail-closed tenant isolation", body: "Every client table carries organization_id. The ORM injects the filter on every query and raises when no tenant is bound; Research Memory keys every record by organization, so a lookup can never reach another tenant." },
  { icon: FileLock2, title: "Append-only failure records", body: "UPDATE and DELETE are revoked on the failures table at the PostgreSQL role level. A record, once written, is permanent." },
  { icon: KeyRound, title: "Short-lived tokens & scoped keys", body: "15-minute access tokens with rotated httpOnly refresh cookies. API keys carry explicit scopes and are stored only as SHA-256 hashes — shown once, at creation." },
  { icon: ShieldCheck, title: "Multi-factor sign-in & verified email", body: "TOTP-based two-factor authentication, email verification, and organization approval before the first sign-in." },
  { icon: Bot, title: "A governed research assistant", body: "Forecast prompts are refused before the model is called. The assistant cannot mutate strategies, generated strategies need human review, and every call is logged first." },
  { icon: Power, title: "Kill switch with review", body: "Risk can halt a live strategy immediately; the decision then enters a review queue so nothing is silently reversed." },
  { icon: ScrollText, title: "Complete audit trail", body: "Promotions, approvals, role changes and kill-switch events are recorded and export to a compliance-ready report." },
  { icon: Activity, title: "Observable by default", body: "Prometheus metrics, Grafana dashboards, Sentry error tracking and structured logs across the API and job workers." },
];

const SQL = `-- migration 0006 · failure records are permanent
REVOKE UPDATE, DELETE ON TABLE failures FROM PUBLIC

-- migration 0009 · the LLM audit log gets the same guarantee
REVOKE UPDATE, DELETE ON TABLE llm_audit_log FROM PUBLIC`;

export default function SecurityPage() {
  return (
    <>
      <PageHero
        eyebrow="Security & governance"
        title={
          <>
            Memory you can trust, because <em>nobody can quietly edit it.</em>
          </>
        }
        intro="The guarantees on this page are structural — enforced by the database, the query layer and the API — rather than promises in a policy document."
      >
        <ButtonLink href="/contact" size="lg" arrow>
          Request a security review
        </ButtonLink>
        <ButtonLink href="/architecture" variant="secondary" size="lg">
          See the architecture
        </ButtonLink>
      </PageHero>

      <Section>
        <SectionHeader eyebrow="Controls" title={<>Eight controls, <em>built in from migration zero.</em></>} />
        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {CONTROLS.map((c, i) => {
            const Icon = c.icon;
            return (
              <Reveal key={c.title} delay={(i % 2) * 80}>
                <Card className="flex h-full gap-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <h3 className="text-[17.5px] font-semibold text-ink">{c.title}</h3>
                    <p className="mt-2 text-[15px] leading-[1.7] text-ink-2">{c.body}</p>
                  </span>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </Section>

      <Section tone="ink" className="overflow-hidden">
        <div aria-hidden className="ink-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="relative grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-20">
          <div>
            <Eyebrow tone="light">Immutability</Eyebrow>
            <h2 className="mt-5 font-editorial text-[clamp(2rem,3.8vw,3rem)] leading-[1.05] tracking-[-0.02em] text-white text-balance">
              Enforced by permission, <em className="text-brand-bright">not by policy.</em>
            </h2>
            <p className="mt-6 text-[16.5px] leading-[1.75] text-white/80">
              Failure records and the LLM audit log are append-only at the database permission level. That&apos;s what makes them
              usable as evidence in front of a risk committee or an auditor.
            </p>
          </div>
          <CodePanel code={SQL} language="sql" filename="alembic/versions · op.execute()" />
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <Display size="md">
            Need a questionnaire answered or <em>a deployment in your VPC?</em>
          </Display>
          <p className="mt-5 text-[16.5px] leading-[1.75] text-ink-2">
            Enterprise plans include on-premise or VPC deployment, SSO / SAML and full audit export. Talk to us about your
            requirements.
          </p>
          <div className="mt-8 flex justify-center">
            <ButtonLink href="/contact" arrow>
              Contact the team
            </ButtonLink>
          </div>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
