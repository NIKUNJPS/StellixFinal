/** Types mirroring backend app/schemas/notification.py (identical field names). */

export type NotificationType =
  | "failure_detected"
  | "evolution_completed"
  | "approval_requested"
  | "payment_failed";

export interface NotificationRead {
  id: string;
  type: NotificationType;
  message: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  total: number;
  unread_count: number;
  count: number;
  items: NotificationRead[];
}

export interface MarkAllReadResponse {
  marked_count: number;
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  failure_detected: "Failure detected",
  evolution_completed: "Evolution completed",
  approval_requested: "Approval requested",
  payment_failed: "Payment failed",
};
