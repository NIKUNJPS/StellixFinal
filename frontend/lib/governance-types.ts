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
  | "failed_login";

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
}

export interface GovernanceAuditLogListResponse {
  total: number;
  count: number;
  items: GovernanceAuditLogEntry[];
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
}
