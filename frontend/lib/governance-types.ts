/** Types mirroring backend app/schemas/governance.py. */

export type AuditEventType =
  | "strategy_status_change"
  | "strategy_approved"
  | "strategy_rejected"
  | "kill_switch_activated"
  | "evolution_candidate_approved"
  | "data_export"
  | "user_role_changed"
  | "login"
  | "failed_login"
  // Batch 25
  | "logout"
  | "strategy_created"
  | "strategy_version_saved"
  | "strategy_deleted"
  | "kill_switch_reviewed"
  | "llm_explanation_generated";

export const AUDIT_EVENT_TYPES: AuditEventType[] = [
  "strategy_created",
  "strategy_version_saved",
  "strategy_status_change",
  "strategy_approved",
  "strategy_rejected",
  "strategy_deleted",
  "evolution_candidate_approved",
  "kill_switch_activated",
  "kill_switch_reviewed",
  "llm_explanation_generated",
  "data_export",
  "user_role_changed",
  "login",
  "logout",
  "failed_login",
];

export interface ActiveStrategySummary {
  id: string;
  name: string;
  version: string;
  creator: string;
  robustness_score: number | null;
  regime_compatibility: Record<string, number | null> | null;
  created_at: string;
  updated_at: string;
}

export interface ActiveStrategiesResponse {
  total: number;
  items: ActiveStrategySummary[];
}

export interface ApprovalQueueItem {
  id: string;
  name: string;
  creator: string;
  robustness_score: number | null;
  regime_compatibility: Record<string, number | null> | null;
  created_at: string;
}

export interface ApprovalQueueResponse {
  total: number;
  items: ApprovalQueueItem[];
}

export interface GovernanceAuditLogEntry {
  id: string;
  actor_user_id: string | null;
  event_type: AuditEventType;
  entity_type: string;
  entity_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  justification: string | null;
  ip_address: string | null;
  created_at: string;
  // Batch 25: readable actor + target.
  actor_email: string | null;
  actor_name: string | null;
  actor_role: string | null;
  /** recorded = captured when the action happened; current_profile = older row resolved from today's profile. */
  actor_identity_source: "recorded" | "current_profile" | "system";
  entity_name: string | null;
  description: string | null;
}

export type AuditLogScope = "organization" | "risk_actions" | "own_risk_actions";

export interface GovernanceAuditLogListResponse {
  total: number;
  count: number;
  scope: AuditLogScope;
  items: GovernanceAuditLogEntry[];
}

export interface ActorSummary {
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  role: string | null;
}

export type KillSwitchReviewState = "pending" | "overdue" | "reviewed" | "self_reviewed";

export interface KillSwitchReview {
  id: string;
  strategy_id: string;
  strategy_name: string;
  strategy_status: string;
  reason: string;
  status_before_kill: string;
  triggered_by: ActorSummary;
  triggered_at: string;
  review_deadline: string;
  review_state: KillSwitchReviewState;
  is_self_reviewed: boolean;
  reviewed_by: ActorSummary | null;
  reviewed_at: string | null;
  review_note: string | null;
}

export interface KillSwitchReviewListResponse {
  total: number;
  awaiting_review_count: number;
  overdue_count: number;
  items: KillSwitchReview[];
}

export interface StrategyControlItem {
  id: string;
  name: string;
  version: string;
  status: "draft" | "candidate" | "active" | "failed" | "retired";
  creator: string;
  robustness_score: number | null;
  updated_at: string;
}

export interface StrategyControlListResponse {
  total: number;
  items: StrategyControlItem[];
}

export type ComplianceExportFormat = "json" | "pdf";
export type ComplianceExportStatus = "pending" | "running" | "completed" | "failed";

export interface ComplianceExportEnqueued {
  job_id: string;
  message: string;
  task_id: string | null;
}

export interface ComplianceExportJob {
  id: string;
  status: ComplianceExportStatus;
  export_format: ComplianceExportFormat;
  start_date: string;
  end_date: string;
  error: string | null;
  created_at: string;
  updated_at: string;
  /** Batch 25: null when worker liveness could not be checked. */
  worker_online: boolean | null;
  status_message: string;
}

export interface ComplianceExportJobListResponse {
  items: ComplianceExportJob[];
}
