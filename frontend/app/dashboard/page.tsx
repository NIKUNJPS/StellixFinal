"use client";

import { Activity, AlertTriangle, ArrowUpRight, Dna, FlaskConical, NotebookText, TrendingUp } from "lucide-react";
import dynamic from "next/dynamic";
import { memo, type ReactNode, useMemo } from "react";

import { TiltSurface } from "@/components/dashboard/tilt-surface";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { GlobalMarkets } from "@/components/market/global-markets";
import { RealtimeEtfs } from "@/components/market/realtime-etfs";
import {
  useBenchmarkSymbol,
  useCurrentRegimeQuery,
  useEvolutionCountQuery,
  useFailureCountQuery,
  useFailureHeatmapQuery,
  usePlatformRealtimeSync,
  useRegimeHistoryQuery,
  useResearchCountQuery,
  useStrategiesQuery,
  useTopPerformersQuery,
} from "@/hooks/use-platform-queries";
import { formatRole } from "@/lib/members";
import { useAuthStore } from "@/store/auth-store";

/* Heavy chart libraries (Recharts, D3) load on demand, after the KPIs and markets are
 * on screen, instead of inflating the page's initial JavaScript. */
function ChartSkeleton({ height = 290 }: { height?: number }) {
  return <div className="animate-pulse rounded-xl bg-white/[0.03]" style={{ height }} />;
}
const EquityCurveChart = dynamic(
  () => import("@/components/dashboard/dashboard-charts").then((m) => m.EquityCurveChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const StatusDonut = dynamic(() => import("@/components/dashboard/dashboard-charts").then((m) => m.StatusDonut), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const RegimeTimeline = dynamic(() => import("@/components/regime/regime-timeline").then((m) => m.RegimeTimeline), {
  ssr: false,
  loading: () => <ChartSkeleton height={120} />,
});
const FailureHeatmap = dynamic(() => import("@/components/failure/failure-heatmap").then((m) => m.FailureHeatmap), {
  ssr: false,
  loading: () => <ChartSkeleton height={220} />,
});

const ACCENTS = {
  regime: "#38BDF8",
  failure: "#F87171",
  default: "#8E88C7",
} as const;

const KpiCard = memo(function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <TiltSurface
      maxTilt={12}
      className="h-full rounded-2xl border border-white/[0.08] bg-[#0D0F14]/80 shadow-[0_22px_45px_-20px_rgba(0,0,0,0.95)] backdrop-blur-xl"
      testId={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 h-24 w-3/4 -translate-x-1/2 rounded-full opacity-25 blur-2xl"
        style={{ backgroundColor: accent }}
      />
      <div className="flex min-h-[125px] flex-col justify-between p-5" style={{ transform: "translateZ(30px)" }}>
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#808495]">{label}</span>
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${accent}1F`, color: accent, border: `1px solid ${accent}40`, transform: "translateZ(20px)" }}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div>
          <p className="truncate text-[26px] font-bold tracking-tight text-[#F5F5F7]">{value}</p>
          {sub && <p className="mt-0.5 truncate text-[11px] font-medium text-[#9A9DA8]">{sub}</p>}
        </div>
      </div>
    </TiltSurface>
  );
});

/** A chart panel with 3D depth (layered shadow, perspective lift on hover) but no
 * rotation — rotating a chart would skew Recharts' pointer hit-testing. */
const DepthCard = memo(function DepthCard({
  title,
  description,
  children,
  testId,
}: {
  title: string;
  description: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/75 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_30px_60px_-30px_rgba(0,0,0,0.95),0_12px_24px_-12px_rgba(92,86,142,0.25)] backdrop-blur-xl transition-transform duration-300 [transform:perspective(1200px)_translateZ(0)] hover:[transform:perspective(1200px)_translateZ(12px)_translateY(-2px)]"
      data-testid={testId}
    >
      <header className="flex items-start justify-between border-b border-white/[0.06] p-5">
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-[#F5F5F7]">{title}</h3>
          <p className="mt-0.5 text-xs text-[#808495]">{description}</p>
        </div>
        <ArrowUpRight className="h-4 w-4 text-[#808495] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
});

const KpiRow = memo(function KpiRow({ symbol }: { symbol: string }) {
  const regime = useCurrentRegimeQuery(symbol);
  const strategies = useStrategiesQuery();
  const failures = useFailureCountQuery();
  const research = useResearchCountQuery();
  const evolution = useEvolutionCountQuery();

  const { activeCount, avgRobustness } = useMemo(() => {
    const active = strategies.data?.items.filter((s) => s.status === "active") ?? [];
    const scored = active.filter((s) => s.robustness_score !== null);
    return {
      activeCount: strategies.data ? String(active.length) : "—",
      avgRobustness: scored.length
        ? (scored.reduce((sum, s) => sum + (s.robustness_score ?? 0), 0) / scored.length).toFixed(2)
        : "—",
    };
  }, [strategies.data]);

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        icon={Activity}
        label="Current Market Regime"
        value={regime.data?.regime_label ?? "—"}
        sub={regime.data ? `${symbol} • ${(regime.data.confidence_score * 100).toFixed(0)}% conf` : symbol}
        accent={ACCENTS.regime}
      />
      <KpiCard icon={FlaskConical} label="Active Strategies" value={activeCount} sub="live research threads" accent={ACCENTS.default} />
      <KpiCard icon={TrendingUp} label="Avg Strategy Performance" value={avgRobustness} sub="mean robustness score" accent={ACCENTS.default} />
      <KpiCard
        icon={AlertTriangle}
        label="Failure Alerts"
        value={failures.data !== undefined ? String(failures.data) : "—"}
        sub="logged constraint breaches"
        accent={ACCENTS.failure}
      />
      <KpiCard
        icon={NotebookText}
        label="Research Activity"
        value={research.data !== undefined ? String(research.data) : "—"}
        sub="research notes"
        accent={ACCENTS.default}
      />
      <KpiCard
        icon={Dna}
        label="Evolution Updates"
        value={evolution.data !== undefined ? String(evolution.data) : "—"}
        sub="genetic optimizer runs"
        accent={ACCENTS.default}
      />
    </div>
  );
});

const ChartsGrid = memo(function ChartsGrid({ symbol }: { symbol: string }) {
  const strategies = useStrategiesQuery();
  const performers = useTopPerformersQuery();
  const history = useRegimeHistoryQuery(symbol);
  const heatmap = useFailureHeatmapQuery();

  const slices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of strategies.data?.items ?? []) counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
    return Array.from(counts, ([status, count]) => ({ status, count }));
  }, [strategies.data]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <DepthCard title="Equity Curve • Top 5 Strategies" description="Toggle strategies, drag the brush to zoom" testId="chart-equity">
        {performers.isLoading ? <ChartSkeleton /> : <EquityCurveChart performers={performers.data ?? []} />}
      </DepthCard>
      <DepthCard title="Strategy Distribution" description="Hover a slice to inspect each lifecycle stage" testId="chart-distribution">
        {strategies.isLoading ? <ChartSkeleton /> : <StatusDonut slices={slices} />}
      </DepthCard>
      <DepthCard title="Regime Timeline" description={`${symbol} • ensemble history — hover a band for details`} testId="chart-regime">
        {history.isLoading ? (
          <ChartSkeleton height={120} />
        ) : history.data?.length ? (
          <RegimeTimeline points={history.data} />
        ) : (
          <p className="py-16 text-center text-xs text-[#666A76]">No regime history for {symbol} yet.</p>
        )}
      </DepthCard>
      <DepthCard title="Failure Heatmap" description="Strategy × regime failure density" testId="chart-heatmap">
        <FailureHeatmap cells={heatmap.data?.cells ?? []} />
      </DepthCard>
    </div>
  );
});

function Greeting() {
  const fullName = useAuthStore((s) => s.user?.full_name);
  const email = useAuthStore((s) => s.user?.email);
  const role = useAuthStore((s) => s.user?.role);
  const roleName = useAuthStore((s) => s.effectiveRole?.name);
  const symbol = useBenchmarkSymbol();
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#808495]">Research Mode</p>
        <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight text-[#F5F5F7]">
          Hello, {fullName || email?.split("@")[0] || "there"}
        </h1>
        <p className="mt-1 text-sm font-semibold text-[#A79CFF]">{roleName ?? (role === "admin" ? "Tenant Admin" : formatRole(role))}</p>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-4 py-2 font-mono text-xs font-semibold text-[#F5F5F7]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
        {symbol}
        <span className="text-[10px] text-[#666A76]">BENCHMARK</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const symbol = useBenchmarkSymbol();
  usePlatformRealtimeSync();

  return (
    <DashboardShell>
      <div className="relative min-h-full overflow-hidden bg-[#07080B] px-1 py-1 text-[#F5F5F7]">
        {/* 3D depth backdrop: a receding perspective grid behind the dashboard. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-40 [perspective:700px]"
        >
          <div
            className="absolute inset-x-[-20%] top-24 h-[640px] origin-top [transform:rotateX(62deg)]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(142,136,199,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(142,136,199,0.14) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage: "linear-gradient(to bottom, black, transparent 75%)",
              WebkitMaskImage: "linear-gradient(to bottom, black, transparent 75%)",
            }}
          />
        </div>
        <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-[#5C568E]/10 blur-[120px]" />

        <div className="relative">
          <Greeting />
          <KpiRow symbol={symbol} />
          <RealtimeEtfs />
          <GlobalMarkets />
          <ChartsGrid symbol={symbol} />
        </div>
      </div>
    </DashboardShell>
  );
}
