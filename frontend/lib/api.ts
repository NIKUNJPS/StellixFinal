import type { HealthResponse } from "@/lib/types";

/** Base URL of the backend API. Set via NEXT_PUBLIC_API_BASE_URL. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    // Network-level failure (backend unreachable).
    throw new ApiError(
      err instanceof Error ? err.message : "Network request failed",
    );
  }
  if (!res.ok) {
    throw new ApiError(`Request failed: ${res.statusText}`, res.status);
  }
  return (await res.json()) as T;
}

/** Fetch live health/connectivity status for all backing services. */
export function fetchHealth(): Promise<HealthResponse> {
  return apiGet<HealthResponse>("/health");
}
