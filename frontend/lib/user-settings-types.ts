/** Types mirroring backend app/schemas/user_settings.py (Batch 12, Page 22). */

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface SessionRead {
  id: string;
  device_info: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface SessionListResponse {
  total: number;
  items: SessionRead[];
}

export interface UpdateProfileRequest {
  full_name?: string | null;
}

export interface PreferencesUpdateRequest {
  default_regime_filter?: string | null;
  default_date_range_days?: number | null;
  notifications?: Record<string, boolean> | null;
}
