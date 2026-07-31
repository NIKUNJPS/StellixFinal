import { apiFetch, errorMessage } from "@/lib/api-client";
import type {
  MarkAllReadResponse,
  NotificationListResponse,
  NotificationRead,
} from "@/lib/notification-types";

export async function listNotifications(params?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<NotificationListResponse> {
  const qs = new URLSearchParams();
  if (params?.unreadOnly) qs.set("unread_only", "true");
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await apiFetch(`/notifications${suffix}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load notifications"));
  return (await res.json()) as NotificationListResponse;
}

export async function markNotificationRead(id: string): Promise<NotificationRead> {
  const res = await apiFetch(`/notifications/${id}/read`, { method: "PATCH" });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to mark notification read"));
  return (await res.json()) as NotificationRead;
}

export async function markAllNotificationsRead(): Promise<MarkAllReadResponse> {
  const res = await apiFetch("/notifications/read-all", { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to mark all notifications read"));
  return (await res.json()) as MarkAllReadResponse;
}
