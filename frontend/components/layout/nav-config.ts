import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CreditCard,
  Database,
  Dna,
  FlaskConical,
  LayoutDashboard,
  NotebookText,
  PieChart,
  ScrollText,
  ServerCog,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The dashboard's left sidebar (Page 10, Batch 12) — every real page in the
 * app gets a nav entry; nothing here is a placeholder/dead link. */
export const NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/strategies", label: "Strategy Explorer", icon: FlaskConical },
  { href: "/admin/portfolio", label: "Portfolio", icon: PieChart },
  { href: "/admin/failures", label: "Failure Intelligence", icon: AlertTriangle },
  { href: "/admin/evolution", label: "Evolution Engine", icon: Dna },
  { href: "/admin/regimes", label: "Regime Monitor", icon: Waves },
  { href: "/admin/governance", label: "Governance & Compliance", icon: ShieldCheck },
  { href: "/admin/graph", label: "Knowledge Graph", icon: Share2 },
  { href: "/admin/assistant", label: "Research Assistant", icon: Sparkles },
  { href: "/admin/llm-audit", label: "LLM Audit Log", icon: ScrollText },
  { href: "/admin/research", label: "Research Notebook", icon: NotebookText },
  { href: "/admin/data-ingest", label: "Data Ingest", icon: Database },
  { href: "/admin/system", label: "System Monitoring", icon: ServerCog },
  { href: "/admin/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Label lookup for the breadcrumb — includes non-sidebar path segments too. */
export const BREADCRUMB_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  admin: "Admin",
  strategies: "Strategies",
  portfolio: "Portfolio",
  failures: "Failures",
  evolution: "Evolution",
  regimes: "Regimes",
  governance: "Governance",
  graph: "Knowledge Graph",
  assistant: "Research Assistant",
  "llm-audit": "LLM Audit Log",
  research: "Research Notebook",
  "data-ingest": "Data Ingest",
  system: "System Monitoring",
  billing: "Billing",
  settings: "Settings",
  new: "New",
  validation: "Validation",
  "backtest-results": "Backtest Results",
};

/**
 * Path segments that are namespaces, not pages. The breadcrumb renders these as
 * plain text instead of links, because navigating to them 404s:
 *
 *   /admin                      — no page.tsx; every admin feature lives a level deeper
 *   /admin/strategies/<uuid>    — no [id]/page.tsx; only [id]/validation and
 *                                 [id]/backtest-results exist (UUIDs are caught by
 *                                 the UUID test in breadcrumb.tsx, not listed here)
 */
export const NON_NAVIGABLE_SEGMENTS = new Set(["admin"]);
