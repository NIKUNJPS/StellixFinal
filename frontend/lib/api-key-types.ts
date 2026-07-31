/** Types mirroring backend app/schemas/api_key.py (Batch 12, Page 22 > API Keys). */

export const API_KEY_SCOPES = ["strategies:read", "strategies:write", "data:read", "data:write"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export interface ApiKeyCreateRequest {
  name: string;
  scopes: string[];
  expires_in_days?: number | null;
}

/** Returned ONLY at creation time — the raw key is never retrievable again. */
export interface ApiKeyCreatedResponse {
  id: string;
  name: string;
  scopes: string[];
  key_prefix: string;
  raw_key: string;
  expires_at: string | null;
}

export interface ApiKeyRead {
  id: string;
  name: string;
  scopes: string[];
  key_prefix: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface ApiKeyListResponse {
  total: number;
  items: ApiKeyRead[];
}
