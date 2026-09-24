import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ClipboardCheck,
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
  Signal,
  Sparkles,
  Users,
  Waves,
} from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The dashboard's left sidebar (Page 10, Batch 12) — every real page in the
 * app gets a nav entry; nothing here is a placeholder/dead link. */
export const ADMIN_NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/portfolio", label: "Portfolio", icon: PieChart },
  { href: "/signals", label: "Signals", icon: Signal },
  { href: "/admin/failures", label: "Failure Intelligence", icon: AlertTriangle },
  { href: "/admin/governance", label: "Governance & Compliance", icon: ShieldCheck },
  { href: "/admin/llm-audit", label: "LLM Audit Log", icon: ScrollText },
  { href: "/admin/members", label: "Organization Members", icon: Users },
  { href: "/admin/billing", label: "Billing", icon: CreditCard },
  { href: "/admin/system", label: "System Monitoring", icon: ServerCog },
];

export const NAV_LINKS = ADMIN_NAV_LINKS;

export const COMPLIANCE_NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/signals", label: "Signals", icon: Signal },
  { href: "/compliance/governance", label: "Governance & Compliance", icon: ShieldCheck },
  { href: "/compliance/llm-audit", label: "LLM Audit Log", icon: ScrollText },
  { href: "/compliance/members", label: "Organization Members", icon: Users },
  { href: "/compliance/graph", label: "Knowledge Graph", icon: Share2 },
];

export const RESEARCHER_NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/researcher/strategies", label: "Strategy Explorer", icon: FlaskConical },
  { href: "/signals", label: "Signals", icon: Signal },
  { href: "/researcher/failures", label: "Failure Intelligence", icon: AlertTriangle },
  { href: "/researcher/assistant", label: "Research Assistant", icon: Sparkles },
  { href: "/researcher/research", label: "Research Notebook", icon: NotebookText },
  { href: "/researcher/graph", label: "Knowledge Graph", icon: Share2 },
];

/* Batch 26 Part B: Quant Engineer is a research/build role (strategy.version +
 * signals.view, no governance) with no dedicated route tree of its own — it uses the
 * same generic /admin/* research pages a custom role does (see navLinksForAccess),
 * plus Signals. */
export const QUANT_ENGINEER_NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/strategies", label: "Strategy Explorer", icon: FlaskConical },
  { href: "/signals", label: "Signals", icon: Signal },
  { href: "/admin/research", label: "Research Notebook", icon: NotebookText },
  { href: "/admin/graph", label: "Knowledge Graph", icon: Share2 },
];

/* Batch 25: the risk roles previously saw only Failure Intelligence + Graph, and
 * app/admin/layout.tsx bounced them off every /admin page — so Portfolio, the approval
 * queue and the kill switch existed but were unreachable. Every link below points at
 * a page whose backend endpoints already admit the role. */
export const RISK_MANAGER_NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/risk-manager/portfolio", label: "Portfolio Risk", icon: PieChart },
  { href: "/signals", label: "Signals", icon: Signal },
  { href: "/risk-manager/governance", label: "Approvals & Kill Switch", icon: ShieldCheck },
  { href: "/risk-manager/failures", label: "Failure Intelligence", icon: AlertTriangle },
  { href: "/risk-manager/graph", label: "Knowledge Graph", icon: Share2 },
];

export const CIO_NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cio/portfolio", label: "Performance & Portfolio", icon: PieChart },
  { href: "/signals", label: "Signals", icon: Signal },
  { href: "/cio/governance", label: "Approvals & Kill Switch", icon: ShieldCheck },
  { href: "/cio/kill-switch-reviews", label: "Kill Switch Reviews", icon: ClipboardCheck },
  { href: "/cio/failures", label: "Failure Intelligence", icon: AlertTriangle },
  { href: "/cio/graph", label: "Knowledge Graph", icon: Share2 },
];

/**
 * Batch 26: users holding one of the five system roles keep exactly the navigation they
 * had before dynamic RBAC. Users on an organization custom role get a navigation built
 * from their permissions, pointing at the generic /admin pages (the admin layout only
 * redirects system-role users to their role-specific trees).
 */
export interface NavAccess {
  /** Effective system role key, or null for a custom role. Legacy role before /auth/me loads. */
  roleKey?: string | null;
  isCustomRole?: boolean;
  permissions?: ReadonlySet<string> | null;
}

export function navLinksForAccess({ roleKey, isCustomRole, permissions }: NavAccess): NavLink[] {
  if (!isCustomRole) return getNavLinks(roleKey ?? undefined);
  const can = (key: string) => permissions?.has(key) ?? false;
  const links: NavLink[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/strategies", label: "Strategy Explorer", icon: FlaskConical },
    { href: "/admin/portfolio", label: "Portfolio", icon: PieChart },
    { href: "/admin/failures", label: "Failure Intelligence", icon: AlertTriangle },
    { href: "/admin/research", label: "Research Notebook", icon: NotebookText },
    { href: "/admin/assistant", label: "Research Assistant", icon: Sparkles },
  ];
  if (can("signals.view")) links.push({ href: "/signals", label: "Signals", icon: Signal });
  if (["governance.view", "audit.view.all", "audit.view.org_risk", "audit.view.own_risk", "compliance.export"].some(can)) {
    links.push({ href: "/admin/governance", label: "Governance & Compliance", icon: ShieldCheck });
  }
  if (can("llm_audit.view")) links.push({ href: "/admin/llm-audit", label: "LLM Audit Log", icon: ScrollText });
  if (can("members.view")) links.push({ href: "/admin/members", label: "Organization Members", icon: Users });
  if (can("billing.manage")) links.push({ href: "/admin/billing", label: "Billing", icon: CreditCard });
  if (can("system.monitor")) links.push({ href: "/admin/system", label: "System Monitoring", icon: ServerCog });
  links.push({ href: "/admin/graph", label: "Knowledge Graph", icon: Share2 });
  return links;
}

export function getNavLinks(role?: string): NavLink[] {
  if (role === "compliance_officer") {
    return COMPLIANCE_NAV_LINKS;
  }
  if (role === "researcher") {
    return RESEARCHER_NAV_LINKS;
  }
  if (role === "risk_manager") {
    return RISK_MANAGER_NAV_LINKS;
  }
  if (role === "cio") {
    return CIO_NAV_LINKS;
  }
  if (role === "admin") {
    return ADMIN_NAV_LINKS;
  }
  if (role === "quant_engineer") {
    return QUANT_ENGINEER_NAV_LINKS;
  }
  return ADMIN_NAV_LINKS;
}

/** Label lookup for the breadcrumb — includes non-sidebar path segments too. */
export const BREADCRUMB_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  admin: "Admin",
  compliance: "Compliance",
  researcher: "Researcher",
  "risk-manager": "Risk Manager",
  cio: "CIO",
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
  members: "Organization Members",
  "kill-switch-reviews": "Kill Switch Reviews",
  edit: "New Version",
};

/**
 * Path segments that are namespaces, not pages. The breadcrumb renders these as
 * plain text instead of links, because navigating to them 404s:
 */
export const NON_NAVIGABLE_SEGMENTS = new Set(["admin", "compliance", "researcher", "risk-manager", "cio"]);