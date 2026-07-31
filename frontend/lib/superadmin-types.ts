/**
 * Types for the SUPERADMIN control plane (Batch 24) — mirrors the dict responses
 * from app/services/superadmin.py. These are the founder's cross-tenant views; the
 * backend returns plain dicts (internal tooling), so these interfaces track those
 * shapes rather than a Pydantic response_model.
 */

import type { OrganizationStatus, OrganizationTier } from "@/lib/auth-types";

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  plan: OrganizationTier;
  monthly_revenue_usd: number;
  created_at: string | null;
  // Real counts from _org_stats (no fabrication).
  user_count: number;
  strategy_count: number;
  backtest_count: number;
  llm_cost_this_month: number;
  last_active_at: string | null;
}

export interface OrgListResponse {
  total: number;
  count: number;
  items: OrgSummary[];
}

export interface OrgUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
}

export interface OrgDetail extends OrgSummary {
  onboarding_completed: boolean;
  company_size: string | null;
  aum_usd_millions: number | null;
  primary_asset_class: string | null;
  internal_notes: string | null;
  suspended_reason: string | null;
  users: OrgUser[];
}

export interface PlatformUser {
  id: string;
  email: string;
  full_name: string | null;
  company: string;
  organization_id: string;
  role: string;
  is_active: boolean;
  is_super_admin: boolean;
  last_login_at: string | null;
}

export interface UserListResponse {
  total: number;
  count: number;
  items: PlatformUser[];
}

export interface DemoRequestSummary {
  id: string;
  company: string;
  contact_name: string;
  work_email: string;
  job_title: string;
  firm_type: string;
  team_size: string;
  use_case: string;
  status: "pending" | "approved" | "rejected" | "converted";
  rejection_reason: string | null;
  created_at: string | null;
}

export interface DemoRequestInbox {
  pending: DemoRequestSummary[];
  reviewed: DemoRequestSummary[];
}

export interface PlatformStats {
  orgs_by_status: Record<string, number>;
  total_orgs: number;
  total_users: number;
  total_strategies: number;
  total_backtests: number;
  total_llm_calls: number;
  total_llm_cost_usd: number;
  mrr_usd: number;
  mrr_is_list_price: boolean;
  new_orgs_30d: number;
}

export interface RevenueByPlan {
  plan: OrganizationTier;
  org_count: number;
  mrr_usd: number;
}

export interface RevenueBreakdown {
  by_plan: RevenueByPlan[];
  mrr_is_list_price: boolean;
}

export interface UsageRow {
  organization_id: string;
  name: string;
  plan: OrganizationTier;
  monthly_revenue_usd: number;
  llm_cost_this_month: number;
}

export interface UsageResponse {
  items: UsageRow[];
}

export interface ImpersonateResponse {
  access_token: string;
  token_type: string;
  expires_in_minutes: number;
  read_only: boolean;
  impersonating: {
    user_id: string;
    email: string;
    organization_id: string;
  };
}

export interface ApproveDemoResponse {
  organization_id: string;
  organization_slug: string;
  admin_user_id: string;
  admin_email: string;
  temporary_password: string;
}
