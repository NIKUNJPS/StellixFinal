import { apiFetch, errorCode, errorMessage } from "@/lib/api-client";
import type {
  ForgotPasswordResponse,
  LoginError,
  LoginInput,
  LoginResult,
  MeResponse,
  MfaEnrollResponse,
  RegisterInput,
  RegisterPendingResponse,
  TokenResponse,
} from "@/lib/auth-types";
import { useAuthStore } from "@/store/auth-store";

/**
 * Register a new organization + admin.
 *
 * Batch 24: the org is created in `pending_approval` and NO token is issued (the
 * API returns 202). The caller can't be signed in yet — a superadmin must approve
 * the org first. Returns the pending confirmation so the UI can show it, instead
 * of storing a session and redirecting.
 */
export async function registerOrg(input: RegisterInput): Promise<RegisterPendingResponse> {
  const res = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Registration failed"));
  }
  return (await res.json()) as RegisterPendingResponse;
}

/** Log in. Returns `{mfaRequired: true, challengeToken}` when the account has
 * MFA enabled (see completeMfaLogin) instead of immediately storing tokens. */
export async function loginUser(input: LoginInput): Promise<LoginResult> {
  const res = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    if (res.status === 423) {
      throw new Error("Account temporarily locked after too many failed attempts.");
    }
    // Read the machine-readable code off a clone first — errorMessage() consumes
    // the body, and the UI needs to distinguish EMAIL_NOT_VERIFIED (offer a resend)
    // from an ordinary bad password. Matching on the prose would be brittle.
    const code = await errorCode(res.clone());
    const error: LoginError = new Error(await errorMessage(res, "Invalid email or password"));
    if (code) error.code = code;
    throw error;
  }
  const data = (await res.json()) as TokenResponse | { mfa_required: true; challenge_token: string };
  if ("mfa_required" in data && data.mfa_required) {
    return { mfaRequired: true, challengeToken: data.challenge_token };
  }
  useAuthStore.getState().setAccessToken((data as TokenResponse).access_token);
  await loadMe();
  return { mfaRequired: false };
}

/** Exchange an MFA challenge token + TOTP code for real tokens. */
export async function completeMfaLogin(challengeToken: string, code: string): Promise<void> {
  const res = await apiFetch("/auth/mfa/login", {
    method: "POST",
    body: JSON.stringify({ challenge_token: challengeToken, code }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Invalid or expired code"));
  const data = (await res.json()) as TokenResponse;
  useAuthStore.getState().setAccessToken(data.access_token);
  await loadMe();
}

/** Fetch the current user + organization and put them in the store. */
export async function loadMe(): Promise<MeResponse | null> {
  const res = await apiFetch("/auth/me");
  if (!res.ok) {
    useAuthStore.getState().clear();
    return null;
  }
  const data = (await res.json()) as MeResponse;
  useAuthStore.getState().setSession(data.user, data.organization);
  // Batch 26: only /auth/me carries the live permission set (MFA responses reuse the
  // MeResponse shape without it, so they must not overwrite access).
  useAuthStore.getState().setAccess(data.effective_role, data.permissions);
  return data;
}

/** Revoke the refresh token server-side and clear local auth state. */
export async function logout(): Promise<void> {
  try {
    await apiFetch("/auth/logout", { method: "POST" }, false);
  } finally {
    useAuthStore.getState().clear();
  }
}

// --------------------------------------------------------------------------- #
// MFA enrollment (Batch 12) — authenticated, distinct from the login-time
// challenge above.
// --------------------------------------------------------------------------- #
export async function enrollMfa(): Promise<MfaEnrollResponse> {
  const res = await apiFetch("/auth/mfa/enroll", { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to start MFA enrollment"));
  return (await res.json()) as MfaEnrollResponse;
}

export async function verifyMfa(code: string): Promise<MeResponse> {
  const res = await apiFetch("/auth/mfa/verify", { method: "POST", body: JSON.stringify({ code }) });
  if (!res.ok) throw new Error(await errorMessage(res, "Invalid code"));
  const data = (await res.json()) as MeResponse;
  useAuthStore.getState().setSession(data.user, data.organization);
  return data;
}

export async function disableMfa(code: string): Promise<MeResponse> {
  const res = await apiFetch("/auth/mfa/disable", { method: "POST", body: JSON.stringify({ code }) });
  if (!res.ok) throw new Error(await errorMessage(res, "Invalid code"));
  const data = (await res.json()) as MeResponse;
  useAuthStore.getState().setSession(data.user, data.organization);
  return data;
}

// --------------------------------------------------------------------------- #
// Forgot / reset password (Batch 12, Page 09)
// --------------------------------------------------------------------------- #
export async function requestPasswordReset(email: string, organizationSlug?: string): Promise<ForgotPasswordResponse> {
  const res = await apiFetch("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email, organization_slug: organizationSlug || undefined }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to request a password reset"));
  return (await res.json()) as ForgotPasswordResponse;
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const res = await apiFetch("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to reset password"));
}

// --------------------------------------------------------------------------- #
// Email verification + team invitations (Batch 25)
// --------------------------------------------------------------------------- #
export interface VerificationResponse {
  message: string;
  email_verified: boolean;
  dev_verification_link?: string | null;
}

export async function verifyEmail(token: string): Promise<VerificationResponse> {
  const res = await apiFetch("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to confirm this email"));
  return (await res.json()) as VerificationResponse;
}

export async function resendVerification(
  email: string,
  organizationSlug?: string,
): Promise<VerificationResponse> {
  const res = await apiFetch("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email, organization_slug: organizationSlug || undefined }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to resend the link"));
  return (await res.json()) as VerificationResponse;
}

export interface AcceptInvitationResponse {
  message: string;
  email: string;
  organization_slug: string;
}

export async function acceptInvitation(
  token: string,
  password: string,
  fullName?: string,
): Promise<AcceptInvitationResponse> {
  const res = await apiFetch("/auth/accept-invitation", {
    method: "POST",
    body: JSON.stringify({ token, password, full_name: fullName || undefined }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to accept this invitation"));
  return (await res.json()) as AcceptInvitationResponse;
}
