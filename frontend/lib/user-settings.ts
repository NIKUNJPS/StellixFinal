import { apiFetch, errorMessage } from "@/lib/api-client";
import type { UserRead } from "@/lib/auth-types";
import type {
  ChangePasswordRequest,
  PreferencesUpdateRequest,
  SessionListResponse,
  SessionRead,
  UpdateProfileRequest,
} from "@/lib/user-settings-types";

export async function updateProfile(input: UpdateProfileRequest): Promise<UserRead> {
  const res = await apiFetch("/users/me", { method: "PATCH", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to update profile"));
  return (await res.json()) as UserRead;
}

export async function changePassword(input: ChangePasswordRequest): Promise<void> {
  const res = await apiFetch("/users/me/change-password", { method: "POST", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to change password"));
}

export async function listMySessions(): Promise<SessionListResponse> {
  const res = await apiFetch("/users/me/sessions");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load sessions"));
  return (await res.json()) as SessionListResponse;
}

export async function revokeMySession(id: string): Promise<SessionRead> {
  const res = await apiFetch(`/users/me/sessions/${id}/revoke`, { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to revoke session"));
  return (await res.json()) as SessionRead;
}

export async function updatePreferences(input: PreferencesUpdateRequest): Promise<UserRead> {
  const res = await apiFetch("/users/me/preferences", { method: "PATCH", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to update preferences"));
  return (await res.json()) as UserRead;
}

export async function uploadAvatar(file: File): Promise<UserRead> {
  const body = new FormData();
  body.append("file", file);
  const res = await apiFetch("/users/me/avatar", { method: "POST", body });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to upload avatar"));
  return (await res.json()) as UserRead;
}
