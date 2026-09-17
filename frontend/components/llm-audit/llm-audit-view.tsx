"use client";

import { useCallback, useEffect, useState } from "react";
import { type LucideIcon, AlertCircle, Check, ChevronDown, Copy, RefreshCw, Sparkles, Terminal } from "lucide-react";

import { MemberPicker } from "@/components/members/member-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAuditLog } from "@/lib/llm";
import type { AuditLogEntry } from "@/lib/llm-types";
import { listOrganizationMembers, type OrganizationMember } from "@/lib/members";

function callerLabel(entry: AuditLogEntry): string {
  if (!entry.user_id) return "System (background task)";
  if (entry.user_name) return `${entry.user_name} (${entry.user_email})`;
  return entry.user_email ?? "Deleted user";
}

const FUNCTION_NAMES = [
  "generate_hypothesis",
  "explain_failure",
  "critique_strategy",
  "summarize_graph_query_result",
];

function SectionEyebrow({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#808495]">
      <Icon className="h-3.5 w-3.5 text-[#8E88C7]" />
      {children}
    </div>
  );
}

export function LLMAuditView() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [functionFilter, setFunctionFilter] = useState<string>("");
  // Batch 25: the filter is chosen by name/email; only the resulting user_id is sent.
  const [userIdFilter, setUserIdFilter] = useState<string | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"prompt" | "response">("prompt");
  const [copied, setCopied] = useState<"prompt" | "response" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await getAuditLog({
        function_name: functionFilter || undefined,
        user_id: userIdFilter || undefined,
        limit: 50,
      });
      setItems(res.items);
      setTotal(res.total);
      if (res.items.length > 0 && !selected) {
        setSelected(res.items[0] ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit log (admin/compliance_officer only)");
    }
  }, [functionFilter, userIdFilter, selected]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listOrganizationMembers()
      .then((res) => setMembers(res.items))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
  }, []);

  const copyToClipboard = (text: string, type: "prompt" | "response") => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const cardClass = "relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl";

  return (
    <div className="relative min-h-full bg-[#07080B] px-4 pb-12 pt-6 text-[#F5F5F7] sm:px-6 lg:px-8">
      {/* Background Ambient Glows */}
      <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-[#8E88C7]/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-60 right-10 h-72 w-72 rounded-full bg-[#38BDF8]/5 blur-[100px]" />

      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* HEADER */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <SectionEyebrow icon={Sparkles}>
              Quantix Intelligence • System Oversight
            </SectionEyebrow>

            <h1 className="text-3xl font-extrabold tracking-tight text-[#F5F5F7]">
              LLM Audit Log
            </h1>

            <p className="mt-1 text-xs text-[#9A9DA8]">
              Every LLM call logged before returning results (admin & compliance officer access only).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-4 py-2 font-mono text-xs font-semibold text-[#F5F5F7] shadow-inner backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-[#8E88C7] shadow-[0_0_10px_rgba(142,136,199,0.7)]" />
              <span className="text-[#808495]">TOTAL RECORDED:</span>
              <span className="text-[#F5F5F7]">{total}</span>
            </div>
          </div>
        </div>

        {/* ERROR NOTIFICATION */}
        {error && (
          <div
            className="flex items-center gap-3 rounded-2xl border p-4 text-xs font-medium text-[#F87171] shadow-lg backdrop-blur-md"
            style={{
              backgroundColor: "rgba(248, 113, 113, 0.08)",
              borderColor: "rgba(248, 113, 113, 0.25)",
            }}
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-[#F87171]" />
            <p>{error}</p>
          </div>
        )}

        {/* MAIN CONTAINER */}
        <div
          className={cardClass}
          style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
        >
          {/* FILTER TOOLBAR */}
          <div className="border-b border-white/[0.06] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {/* Custom Visually Reliable Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen((prev) => !prev)}
                    className="flex h-10 min-w-[180px] items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-3.5 font-mono text-xs font-medium text-[#F5F5F7] transition-colors hover:border-white/[0.18]"
                    data-testid="filter-function-name"
                  >
                    <span className="truncate">
                      {functionFilter ? functionFilter : "All functions"}
                    </span>
                    <ChevronDown className={`h-3.5 w-3.5 text-[#808495] transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                  </button>

                  {/* Fallback hidden select for test runner interaction */}
                  <select
                    value={functionFilter}
                    onChange={(e) => setFunctionFilter(e.target.value)}
                    className="sr-only"
                    tabIndex={-1}
                  >
                    <option value="">All functions</option>
                    {FUNCTION_NAMES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>

                  {dropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setDropdownOpen(false)} />
                      <div className="absolute left-0 top-12 z-30 min-w-[220px] overflow-hidden rounded-xl border border-white/[0.12] bg-[#0D0F14] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
                        <button
                          type="button"
                          onClick={() => {
                            setFunctionFilter("");
                            setDropdownOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 font-mono text-xs ${
                            functionFilter === "" ? "bg-[#8E88C7]/20 text-[#F5F5F7]" : "text-[#808495] hover:bg-white/[0.04] hover:text-[#F5F5F7]"
                          }`}
                        >
                          <span>All functions</span>
                          {functionFilter === "" && <Check className="h-3.5 w-3.5 text-[#8E88C7]" />}
                        </button>
                        {FUNCTION_NAMES.map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => {
                              setFunctionFilter(f);
                              setDropdownOpen(false);
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 font-mono text-xs ${
                              functionFilter === f ? "bg-[#8E88C7]/20 text-[#F5F5F7]" : "text-[#808495] hover:bg-white/[0.04] hover:text-[#F5F5F7]"
                            }`}
                          >
                            <span>{f}</span>
                            {functionFilter === f && <Check className="h-3.5 w-3.5 text-[#8E88C7]" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Person filter: search by name or email, never by raw UUID */}
                <MemberPicker
                  members={members}
                  value={userIdFilter}
                  onChange={setUserIdFilter}
                  loading={membersLoading}
                  placeholder="Filter by person (name or email)"
                  testId="filter-user"
                />
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={load}
                className="h-10 rounded-xl border-white/10 bg-transparent px-4 font-mono text-xs text-[#9A9DA8] hover:bg-white/[0.05] hover:text-[#F5F5F7]"
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          </div>

          {/* DUAL PANELS: LOG TABLE & INSPECTION DETAILED PANEL */}
          <div className="grid gap-0 lg:grid-cols-[1.2fr_1fr]">
            {/* LOG TABLE */}
            <div className="overflow-x-auto border-b border-white/[0.06] lg:border-b-0 lg:border-r">
              <table className="w-full border-collapse text-left text-xs" data-testid="audit-log-table">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-[#0F1117]/40 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#808495]">
                    <th className="px-4 py-3">Function</th>
                    <th className="px-4 py-3">Called by</th>
                    <th className="px-4 py-3">Model</th>
                    <th className="px-4 py-3">Tokens</th>
                    <th className="px-4 py-3">Numeric OK</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {items.map((row) => {
                    const isSelected = selected?.id === row.id;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelected(row)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? "bg-[#8E88C7]/15" : "hover:bg-white/[0.02]"
                        }`}
                      >
                        <td className="px-4 py-3 font-mono font-medium text-[#F5F5F7]">
                          <div className="flex items-center gap-2">
                            <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-[#8E88C7]" : "bg-transparent"}`} />
                            {row.function_name}
                          </div>
                        </td>
                        <td className="max-w-[180px] truncate px-4 py-3 text-[#C9CBD3]" title={callerLabel(row)}>
                          {row.user_id ? row.user_name ?? row.user_email ?? "Deleted user" : "System"}
                        </td>
                        <td className="px-4 py-3 font-mono text-[#808495]">{row.model_used}</td>
                        <td className="px-4 py-3 font-mono text-[#9A9DA8]">
                          {row.input_tokens ?? "—"} / {row.output_tokens ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {row.numeric_validation_passed === null ? (
                            <span className="font-mono text-[11px] text-[#666A76]">n/a</span>
                          ) : row.numeric_validation_passed ? (
                            <span className="inline-flex rounded-full border border-[#34D399]/30 bg-[#34D399]/10 px-2 py-0.5 font-mono text-[9px] font-semibold text-[#34D399]">
                              passed
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-[#F87171]/30 bg-[#F87171]/10 px-2 py-0.5 font-mono text-[9px] font-semibold text-[#F87171]">
                              failed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[#808495]">
                          {row.created_at.slice(0, 19).replace("T", " ")}
                        </td>
                      </tr>
                    );
                  })}

                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center text-xs text-[#666A76]">
                        No LLM calls recorded yet — the research assistant logs every call here once used.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* INSPECTION DETAIL PANEL */}
            <div className="flex flex-col bg-[#0F1117]/30 p-5" data-testid="audit-log-detail">
              {selected ? (
                <div className="flex h-full flex-col">
                  {/* Panel Header */}
                  <div className="mb-4 flex items-center justify-between border-b border-white/[0.06] pb-4">
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#808495]">Execution Payload</span>
                      <h3 className="font-mono text-sm font-semibold text-[#F5F5F7]">{selected.function_name}</h3>
                    </div>

                    <div className="flex rounded-xl border border-white/[0.08] bg-[#07080B] p-1">
                      <button
                        type="button"
                        onClick={() => setActiveTab("prompt")}
                        className={`rounded-lg px-3 py-1 font-mono text-xs font-semibold transition-colors ${
                          activeTab === "prompt" ? "bg-[#8E88C7] text-white" : "text-[#808495] hover:text-[#F5F5F7]"
                        }`}
                      >
                        Prompt
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("response")}
                        className={`rounded-lg px-3 py-1 font-mono text-xs font-semibold transition-colors ${
                          activeTab === "response" ? "bg-[#8E88C7] text-white" : "text-[#808495] hover:text-[#F5F5F7]"
                        }`}
                      >
                        Response
                      </button>
                    </div>
                  </div>

                  {/* Metadata Row */}
                  <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-[#07080B]/50 p-3 font-mono text-[11px]">
                    <div>
                      <span className="text-[#808495]">Model: </span>
                      <span className="text-[#F5F5F7]">{selected.model_used}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[#808495]">Called by: </span>
                      <span className="break-all text-[#F5F5F7]">{callerLabel(selected)}</span>
                    </div>
                  </div>

                  {/* Tab Body Content */}
                  <div className="relative flex-1 rounded-xl border border-white/[0.08] bg-[#07080B] p-4">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(activeTab === "prompt" ? selected.full_prompt : selected.full_response, activeTab)}
                      className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] text-[#808495] hover:bg-white/[0.08] hover:text-[#F5F5F7]"
                    >
                      {copied === activeTab ? (
                        <>
                          <Check className="h-3 w-3 text-[#34D399]" />
                          <span className="text-[#34D399]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    <div className="h-[320px] overflow-auto pr-2">
                      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-[#D8DADF]">
                        {activeTab === "prompt" ? selected.full_prompt : selected.full_response}
                      </pre>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[350px] flex-col items-center justify-center text-center">
                  <Terminal className="h-8 w-8 text-[#666A76]" />
                  <p className="mt-3 font-mono text-xs text-[#808495]">Select an audit record to inspect the full execution trace.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}