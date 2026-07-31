/**
 * Types mirroring the backend auth schemas (app/schemas/{auth,user,organization}.py).
 * Field names are IDENTICAL to the API payload (PROJECT_CONSTITUTION §5).
 */

export type UserRole =
  | "researcher"
  | "risk_manager"
  | "cio"
  | "compliance_officer"
  | "admin";

export type OrganizationTier = "starter" | "pro" | "enterprise";

// Batch 24: org lifecycle status. Self-registration lands in `pending_approval`
// (no JWT issued); the founder approves → `active`. suspended/terminated lock the
// tenant out of the whole client API (enforced in app/api/deps.py).
export type OrganizationStatus =
  | "pending_approval"
  | "active"
  | "suspended"
  | "terminated";

export interface UserPreferences {
  default_regime_filter?: string | null;
  default_date_range_days?: number;
  notifications?: Record<string, boolean>;
}

export interface UserRead {
  id: string;
  organization_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  // Batch 12
  mfa_enabled: boolean;
  avatar_url: string | null;
  preferences: UserPreferences;
  // Batch 24: platform-wide superadmin flag (orthogonal to `role`). Gates the
  // /superadmin console and the conditional sidebar entry.
  is_super_admin: boolean;
}

export interface OrganizationRead {
  id: string;
  name: string;
  slug: string;
  tier: OrganizationTier;
  max_strategies: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Batch 12
  benchmark_symbol: string;
  // Batch 24
  status: OrganizationStatus;
  // Batch 22
  weekly_digest_enabled: boolean;
}

export interface MeResponse {
  user: UserRead;
  organization: OrganizationRead;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface MfaChallengeResponse {
  mfa_required: true;
  challenge_token: string;
}

export interface RegisterInput {
  organization_name: string;
  email: string;
  password: string;
  full_name?: string;
}

// Batch 24: registration no longer returns a token. The org is created in
// `pending_approval` and a superadmin must approve it before anyone can sign in.
export interface RegisterPendingResponse {
  status: "pending_approval";
  message: string;
}

export interface LoginInput {
  email: string;
  password: string;
  organization_slug?: string;
  /** Batch 12 Page 09: wired to the refresh token's actual expiry, not cosmetic. */
  remember_me?: boolean;
}

export type LoginResult =
  | { mfaRequired: true; challengeToken: string }
  | { mfaRequired: false };

// --- MFA (Batch 12) --------------------------------------------------------
export interface MfaEnrollResponse {
  secret: string;
  provisioning_uri: string;
}

// --- Forgot / reset password (Batch 12) ------------------------------------
export interface ForgotPasswordResponse {
  message: string;
  dev_reset_link: string | null;
}

/**
 * A login failure that may carry a machine-readable code from the API's
 * structured error detail — currently "EMAIL_NOT_VERIFIED". Batch 25.
 */
export interface LoginError extends Error {
  code?: string;
}
