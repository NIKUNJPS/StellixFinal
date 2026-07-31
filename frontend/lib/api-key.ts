import { apiFetch, errorMessage } from "@/lib/api-client";
import type { ApiKeyCreatedResponse, ApiKeyCreateRequest, ApiKeyListResponse, ApiKeyRead } from "@/lib/api-key-types";

export async function createApiKey(input: ApiKeyCreateRequest): Promise<ApiKeyCreatedResponse> {
  const res = await apiFetch("/api-keys", { method: "POST", body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to create API key"));
  return (await res.json()) as ApiKeyCreatedResponse;
}

export async function listApiKeys(): Promise<ApiKeyListResponse> {
  const res = await apiFetch("/api-keys");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load API keys"));
  return (await res.json()) as ApiKeyListResponse;
}

export async function revokeApiKey(id: string): Promise<ApiKeyRead> {
  const res = await apiFetch(`/api-keys/${id}/revoke`, { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to revoke API key"));
  return (await res.json()) as ApiKeyRead;
}
