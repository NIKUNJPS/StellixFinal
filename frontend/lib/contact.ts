import { API_BASE_URL } from "@/lib/api";

export interface DemoRequestPayload {
  first_name: string;
  last_name: string;
  work_email: string;
  company: string;
  job_title: string;
  firm_type: string;
  team_size: string;
  use_case_description: string;
  primary_interest: string[];
  source?: string | null;
  consent: boolean;
  website?: string; // honeypot
}

/** Submit a demo request to the public backend endpoint (no auth). */
export async function submitDemoRequest(payload: DemoRequestPayload): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/contact/demo-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) return;
  if (res.status === 429) throw new Error("Too many requests — please wait a moment and try again.");
  try {
    const data = await res.json();
    const detail = data?.detail;
    if (typeof detail === "string") throw new Error(detail);
    if (Array.isArray(detail)) {
      throw new Error(detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ") || "Submission failed.");
    }
  } catch (e) {
    if (e instanceof Error && e.message) throw e;
  }
  throw new Error("Something went wrong submitting your request. Please try again.");
}
