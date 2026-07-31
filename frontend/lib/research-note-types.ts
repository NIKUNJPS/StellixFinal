/** Types mirroring backend app/schemas/research_note.py. */

export type ResearchNoteStatus = "in_progress" | "completed" | "abandoned";

export interface ResearchNoteCreateRequest {
  title?: string;
  content: string;
  hypothesis?: string | null;
  method?: string | null;
  status?: ResearchNoteStatus;
  tags?: string[];
  related_strategy_ids?: string[];
  related_failure_ids?: string[];
}

export type ResearchNoteUpdateRequest = Partial<ResearchNoteCreateRequest>;

export interface ResearchNoteRead {
  id: string;
  title: string;
  content: string;
  hypothesis: string | null;
  method: string | null;
  status: ResearchNoteStatus;
  tags: string[];
  related_strategy_ids: string[];
  related_failure_ids: string[];
  author_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface ResearchNoteListItem {
  id: string;
  title: string;
  status: ResearchNoteStatus;
  tags: string[];
  author_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface ResearchNoteListResponse {
  total: number;
  count: number;
  items: ResearchNoteListItem[];
}

export interface ResearchNoteListParams {
  status?: ResearchNoteStatus;
  tag?: string;
  author_user_id?: string;
  start_date?: string;
  end_date?: string;
  q?: string;
  limit?: number;
  offset?: number;
}
