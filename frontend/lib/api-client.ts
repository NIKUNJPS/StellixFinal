import { API_BASE_URL } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

/**
 * Authenticated fetch wrapper.
 *
 * - Attaches the in-memory access token as a Bearer header.
 * - Sends cookies (`credentials: "include"`) so the httpOnly refresh cookie rides along.
 * - On a 401, transparently calls /auth/refresh ONCE, updates the access token, and
 *   retries the original request. A second 401 (or failed refresh) clears auth.
 */

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  // Collapse concurrent refreshes into a single network call.
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        useAuthStore.getState().clear();
        return false;
      }
      const data = (await res.json()) as { access_token: string };
      useAuthStore.getState().setAccessToken(data.access_token);
      return true;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  allowRefresh = true,
): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // FormData bodies (Batch 12 avatar upload) need the browser to set its own
  // multipart boundary — forcing application/json here would break them.
  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && allowRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiFetch(path, init, false);
    // Refresh failed → the session is genuinely gone. Clear state (done in
    // refreshAccessToken) and bounce to /login so the user doesn't stare at errors
    // on a now-unauthenticated page. Skip if we're already on an auth page.
    if (typeof window !== "undefined" && !/^\/(login|register|forgot-password|reset-password)/.test(window.location.pathname)) {
      window.location.assign("/login");
    }
  }
  return res;
}

/**
 * Extract a human-readable message from a FastAPI error response.
 *
 * Handles the several `detail` shapes the API uses:
 * - a plain string,
 * - a Pydantic validation array (`[{msg}]`),
 * - the org-status gate dict (Batch 24: `{code, message, contact}`),
 * - the rate-limit dict (Batch 11: `{error, limit, message}`) — and appends the
 *   Retry-After hint when the response is a 429.
 */
export async function errorMessage(res: Response, fallback: string): Promise<string> {
  let message = fallback;
  try {
    const data = await res.json();
    const detail = data?.detail;
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ") || fallback;
    } else if (detail && typeof detail === "object" && typeof detail.message === "string") {
      // Org-status gate ({code, message, contact}) or rate-limit ({error, limit, message}).
      message = detail.contact ? `${detail.message} Contact ${detail.contact}.` : detail.message;
    }
  } catch {
    /* non-JSON body */
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) {
      const secs = parseInt(retryAfter, 10);
      message += Number.isFinite(secs)
        ? ` Try again in ${secs < 60 ? `${secs}s` : `${Math.ceil(secs / 60)} min`}.`
        : " Please slow down and try again shortly.";
    }
  }
  return message;
}

/**
 * Pull the machine-readable `code` out of a structured error detail
 * (e.g. {code: "EMAIL_NOT_VERIFIED", message, email}), or null if absent.
 *
 * Consumes the body — pass `res.clone()` if you also need errorMessage().
 */
export async function errorCode(res: Response): Promise<string | null> {
  try {
    const data = await res.json();
    const detail = data?.detail;
    if (detail && typeof detail === "object" && typeof detail.code === "string") {
      return detail.code;
    }
  } catch {
    /* non-JSON body */
  }
  return null;
}
