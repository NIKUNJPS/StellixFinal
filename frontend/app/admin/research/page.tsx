"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { critiqueStrategy, generateHypothesis } from "@/lib/llm";
import type { CritiqueResponse, HypothesisResponse } from "@/lib/llm-types";
import {
  autosaveResearchNote,
  createResearchNote,
  getResearchNote,
  listResearchNotes,
  updateResearchNote,
} from "@/lib/research-note";
import type {
  ResearchNoteListItem,
  ResearchNoteRead,
  ResearchNoteStatus,
} from "@/lib/research-note-types";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

const AUTOSAVE_DEBOUNCE_MS = 3000;
const STATUS_OPTIONS: ResearchNoteStatus[] = ["in_progress", "completed", "abandoned"];

type Draft = Partial<ResearchNoteRead>;

function emptyDraft(): Draft {
  return {
    title: "",
    content: "",
    hypothesis: "",
    method: "",
    status: "in_progress",
    tags: [],
    related_strategy_ids: [],
    related_failure_ids: [],
  };
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function ResearchPage() {
  const [notes, setNotes] = useState<ResearchNoteListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ResearchNoteStatus | "">("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [tagInput, setTagInput] = useState("");
  const [strategyIdInput, setStrategyIdInput] = useState("");
  const [failureIdInput, setFailureIdInput] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const [llmSymbol, setLlmSymbol] = useState("SPY");
  const [llmLoading, setLlmLoading] = useState(false);
  const [hypothesisResult, setHypothesisResult] = useState<HypothesisResponse | null>(null);
  const [critiqueResult, setCritiqueResult] = useState<CritiqueResponse | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const selectedIdRef = useRef<string | null>(null);
  const draftRef = useRef<Draft>(draft);
  draftRef.current = draft;
  selectedIdRef.current = selectedId;

  const loadNotes = useCallback(async () => {
    try {
      const res = await listResearchNotes({ q: query || undefined, status: statusFilter || undefined, limit: 100 });
      setNotes(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notes");
    }
  }, [query, statusFilter]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  function partialPayload(d: Draft) {
    return {
      title: d.title,
      content: d.content,
      hypothesis: d.hypothesis,
      method: d.method,
      status: d.status,
      tags: d.tags,
      related_strategy_ids: d.related_strategy_ids,
      related_failure_ids: d.related_failure_ids,
    };
  }

  /** Cancels any pending debounced autosave and, if there are unsaved edits on an
   * existing note, saves them immediately (so switching notes never silently
   * drops the last few seconds of typing). */
  async function flushPendingSave() {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (dirtyRef.current && selectedIdRef.current) {
      try {
        await autosaveResearchNote(selectedIdRef.current, partialPayload(draftRef.current));
      } catch {
        // Best-effort: the note list refresh below will just show the last-saved state.
      }
      dirtyRef.current = false;
    }
  }

  async function startNewNote() {
    await flushPendingSave();
    setSelectedId(null);
    setDraft(emptyDraft());
    setSaveState("idle");
    setHypothesisResult(null);
    setCritiqueResult(null);
  }

  async function selectNote(id: string) {
    await flushPendingSave();
    try {
      const note = await getResearchNote(id);
      setSelectedId(note.id);
      setDraft(note);
      setSaveState("idle");
      setHypothesisResult(null);
      setCritiqueResult(null);
      await loadNotes();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load note");
    }
  }

  function scheduleAutosave(next: Draft) {
    dirtyRef.current = true;
    if (!selectedIdRef.current) return; // nothing to autosave until the note exists
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      const id = selectedIdRef.current;
      if (!id) return;
      setSaveState("saving");
      try {
        await autosaveResearchNote(id, partialPayload(draftRef.current));
        setSaveState("saved");
        dirtyRef.current = false;
        await loadNotes();
      } catch (e) {
        setSaveState("error");
        setError(e instanceof Error ? e.message : "Autosave failed");
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  function updateDraft(patch: Draft) {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      scheduleAutosave(next);
      return next;
    });
  }

  async function saveNow() {
    setError(null);
    if (!draft.content || !draft.content.trim()) {
      setError("Content is required.");
      return;
    }
    try {
      if (!selectedId) {
        const created = await createResearchNote({
          title: draft.title,
          content: draft.content,
          hypothesis: draft.hypothesis || null,
          method: draft.method || null,
          status: draft.status as ResearchNoteStatus,
          tags: draft.tags,
          related_strategy_ids: draft.related_strategy_ids,
          related_failure_ids: draft.related_failure_ids,
        });
        setSelectedId(created.id);
        setDraft(created);
      } else {
        const updated = await updateResearchNote(selectedId, partialPayload(draft));
        setDraft(updated);
      }
      dirtyRef.current = false;
      setSaveState("saved");
      await loadNotes();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save note");
    }
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag) return;
    updateDraft({ tags: Array.from(new Set([...(draft.tags ?? []), tag])) });
    setTagInput("");
  }

  function removeTag(tag: string) {
    updateDraft({ tags: (draft.tags ?? []).filter((t) => t !== tag) });
  }

  function addStrategyId() {
    const id = strategyIdInput.trim();
    if (!id) return;
    updateDraft({ related_strategy_ids: Array.from(new Set([...(draft.related_strategy_ids ?? []), id])) });
    setStrategyIdInput("");
  }

  function removeStrategyId(id: string) {
    updateDraft({ related_strategy_ids: (draft.related_strategy_ids ?? []).filter((s) => s !== id) });
  }

  function addFailureId() {
    const id = failureIdInput.trim();
    if (!id) return;
    updateDraft({ related_failure_ids: Array.from(new Set([...(draft.related_failure_ids ?? []), id])) });
    setFailureIdInput("");
  }

  function removeFailureId(id: string) {
    updateDraft({ related_failure_ids: (draft.related_failure_ids ?? []).filter((f) => f !== id) });
  }

  async function runHypothesis() {
    setLlmLoading(true);
    setLlmError(null);
    setHypothesisResult(null);
    try {
      const res = await generateHypothesis({ symbol: llmSymbol });
      setHypothesisResult(res);
      if (!draft.content?.trim()) {
        updateDraft({
          content: res.hypothesis.rationale,
          hypothesis: res.hypothesis.hypothesis_text,
          title: draft.title || `Hypothesis: ${llmSymbol}`,
        });
      }
    } catch (e) {
      setLlmError(e instanceof Error ? e.message : "Failed to generate hypothesis");
    } finally {
      setLlmLoading(false);
    }
  }

  async function runCritique() {
    const strategyId = (draft.related_strategy_ids ?? [])[0];
    if (!strategyId) {
      setLlmError("Link a strategy below to request a critique.");
      return;
    }
    setLlmLoading(true);
    setLlmError(null);
    setCritiqueResult(null);
    try {
      const res = await critiqueStrategy(strategyId);
      setCritiqueResult(res);
    } catch (e) {
      setLlmError(e instanceof Error ? e.message : "Failed to critique strategy");
    } finally {
      setLlmLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr_320px]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Research Notebook</CardTitle>
            <CardDescription>{total} notes</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button size="sm" onClick={startNewNote} data-testid="new-note">
              + New note
            </Button>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title/content/hypothesis..."
              className="h-8"
              data-testid="search-notes"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ResearchNoteStatus | "")}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="flex flex-col gap-1" data-testid="note-list">
              {notes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => selectNote(n.id)}
                  className={`rounded-md border p-2 text-left text-sm ${selectedId === n.id ? "border-primary bg-accent/40" : "border-border"}`}
                  data-testid={`note-item-${n.id}`}
                >
                  <div className="font-medium">{n.title || "(untitled)"}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{n.status}</Badge>
                    <span>{n.updated_at.slice(0, 10)}</span>
                  </div>
                </button>
              ))}
              {notes.length === 0 && <p className="text-xs text-muted-foreground">No notes yet.</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{selectedId ? "Edit note" : "New note"}</CardTitle>
              <SaveIndicator state={saveState} />
            </div>
            {error && <CardDescription className="text-destructive">{error}</CardDescription>}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <Label htmlFor="note-title">Title</Label>
              <Input
                id="note-title"
                value={draft.title ?? ""}
                onChange={(e) => updateDraft({ title: e.target.value })}
                data-testid="note-title"
              />
            </div>

            <div data-color-mode="dark">
              <Label>Content (markdown)</Label>
              <MDEditor
                value={draft.content ?? ""}
                onChange={(v) => updateDraft({ content: v ?? "" })}
                height={280}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="note-hypothesis">Hypothesis</Label>
                <textarea
                  id="note-hypothesis"
                  value={draft.hypothesis ?? ""}
                  onChange={(e) => updateDraft({ hypothesis: e.target.value })}
                  className="w-full rounded-md border border-input bg-transparent p-2 text-sm"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="note-method">Method</Label>
                <textarea
                  id="note-method"
                  value={draft.method ?? ""}
                  onChange={(e) => updateDraft({ method: e.target.value })}
                  className="w-full rounded-md border border-input bg-transparent p-2 text-sm"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex items-end gap-3">
              <div>
                <Label htmlFor="note-status">Status</Label>
                <select
                  id="note-status"
                  value={draft.status ?? "in_progress"}
                  onChange={(e) => updateDraft({ status: e.target.value as ResearchNoteStatus })}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <Button size="sm" onClick={saveNow} data-testid="save-note">
                {selectedId ? "Save" : "Create note"}
              </Button>
            </div>

            <div>
              <Label>Tags</Label>
              <div className="mb-2 flex flex-wrap gap-1.5" data-testid="note-tags">
                {(draft.tags ?? []).map((t) => (
                  <Badge key={t} variant="secondary" className="cursor-pointer" onClick={() => removeTag(t)}>
                    {t} &times;
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Add a tag and press Enter"
                  className="h-8"
                  data-testid="tag-input"
                />
                <Button size="sm" variant="outline" onClick={addTag}>
                  Add
                </Button>
              </div>
            </div>

            <div>
              <Label>Linked strategies</Label>
              <div className="mb-2 flex flex-wrap gap-1.5" data-testid="linked-strategies">
                {(draft.related_strategy_ids ?? []).map((id) => (
                  <a key={id} href="/admin/strategies" className="inline-block" data-testid={`strategy-chip-${id}`}>
                    <Badge variant="outline" className="cursor-pointer hover:bg-accent/60">
                      {id.slice(0, 8)}
                      <span
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removeStrategyId(id);
                        }}
                        className="ml-1"
                      >
                        &times;
                      </span>
                    </Badge>
                  </a>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={strategyIdInput}
                  onChange={(e) => setStrategyIdInput(e.target.value)}
                  placeholder="Strategy id"
                  className="h-8"
                  data-testid="strategy-id-input"
                />
                <Button size="sm" variant="outline" onClick={addStrategyId}>
                  Link
                </Button>
              </div>
            </div>

            <div>
              <Label>Linked failures</Label>
              <div className="mb-2 flex flex-wrap gap-1.5" data-testid="linked-failures">
                {(draft.related_failure_ids ?? []).map((id) => (
                  <a key={id} href="/admin/failures" className="inline-block" data-testid={`failure-chip-${id}`}>
                    <Badge variant="outline" className="cursor-pointer hover:bg-accent/60">
                      {id.slice(0, 8)}
                      <span
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removeFailureId(id);
                        }}
                        className="ml-1"
                      >
                        &times;
                      </span>
                    </Badge>
                  </a>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={failureIdInput}
                  onChange={(e) => setFailureIdInput(e.target.value)}
                  placeholder="Failure id"
                  className="h-8"
                  data-testid="failure-id-input"
                />
                <Button size="sm" variant="outline" onClick={addFailureId}>
                  Link
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg">AI Assistant</CardTitle>
            <CardDescription>Wired to Batch 9&apos;s hypothesis/critique endpoints.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <Label htmlFor="llm-symbol">Symbol</Label>
              <div className="flex gap-2">
                <Input
                  id="llm-symbol"
                  value={llmSymbol}
                  onChange={(e) => setLlmSymbol(e.target.value)}
                  className="h-8"
                />
                <Button size="sm" onClick={runHypothesis} disabled={llmLoading} data-testid="run-hypothesis-docked">
                  Hypothesis
                </Button>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={runCritique}
              disabled={llmLoading}
              data-testid="run-critique-docked"
            >
              Critique linked strategy
            </Button>
            {llmError && <p className="text-sm text-destructive">{llmError}</p>}
            {llmLoading && <p className="text-sm text-muted-foreground">Thinking...</p>}
            {hypothesisResult && (
              <div className="text-sm" data-testid="docked-hypothesis-result">
                <h4 className="mb-1 font-medium">Hypothesis</h4>
                <p className="mb-2 text-muted-foreground">{hypothesisResult.hypothesis.hypothesis_text}</p>
                <h4 className="mb-1 font-medium">Rationale</h4>
                <p className="text-muted-foreground">{hypothesisResult.hypothesis.rationale}</p>
              </div>
            )}
            {critiqueResult && (
              <div className="text-sm" data-testid="docked-critique-result">
                <h4 className="mb-1 font-medium">Strengths</h4>
                <ul className="mb-2 list-inside list-disc text-muted-foreground">
                  {critiqueResult.critique.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
                <h4 className="mb-1 font-medium">Weaknesses</h4>
                <ul className="list-inside list-disc text-muted-foreground">
                  {critiqueResult.critique.weaknesses.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <span className="text-xs text-muted-foreground" data-testid="save-indicator">
        Saving...
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="text-xs text-destructive" data-testid="save-indicator">
        Save failed
      </span>
    );
  }
  return (
    <span className="text-xs text-emerald-500" data-testid="save-indicator">
      Saved
    </span>
  );
}
