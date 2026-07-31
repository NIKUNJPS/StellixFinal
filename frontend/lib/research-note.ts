import { apiFetch, errorMessage } from "@/lib/api-client";
import type {
  ResearchNoteCreateRequest,
  ResearchNoteListParams,
  ResearchNoteListResponse,
  ResearchNoteRead,
  ResearchNoteUpdateRequest,
} from "@/lib/research-note-types";

export async function createResearchNote(payload: ResearchNoteCreateRequest): Promise<ResearchNoteRead> {
  const res = await apiFetch("/research-notes", { method: "POST", body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to create note"));
  return (await res.json()) as ResearchNoteRead;
}

export async function listResearchNotes(params: ResearchNoteListParams = {}): Promise<ResearchNoteListResponse> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.tag) search.set("tag", params.tag);
  if (params.author_user_id) search.set("author_user_id", params.author_user_id);
  if (params.start_date) search.set("start_date", params.start_date);
  if (params.end_date) search.set("end_date", params.end_date);
  if (params.q) search.set("q", params.q);
  search.set("limit", String(params.limit ?? 50));
  search.set("offset", String(params.offset ?? 0));
  const res = await apiFetch(`/research-notes?${search.toString()}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load research notes"));
  return (await res.json()) as ResearchNoteListResponse;
}

export async function getResearchNote(id: string): Promise<ResearchNoteRead> {
  const res = await apiFetch(`/research-notes/${id}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load note"));
  return (await res.json()) as ResearchNoteRead;
}

export async function updateResearchNote(id: string, payload: ResearchNoteUpdateRequest): Promise<ResearchNoteRead> {
  const res = await apiFetch(`/research-notes/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to update note"));
  return (await res.json()) as ResearchNoteRead;
}

export async function autosaveResearchNote(id: string, payload: ResearchNoteUpdateRequest): Promise<ResearchNoteRead> {
  const res = await apiFetch(`/research-notes/${id}/autosave`, { method: "PATCH", body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(await errorMessage(res, "Autosave failed"));
  return (await res.json()) as ResearchNoteRead;
}
