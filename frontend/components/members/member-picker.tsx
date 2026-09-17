"use client";

import { Check, ChevronDown, User, X } from "lucide-react";
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";

import { formatRole, memberLabel, type OrganizationMember } from "@/lib/members";

/**
 * Batch 25: pick a person by name or email; the parent only ever receives their
 * user_id. Replaces the raw "Filter by user_id" text input so nobody has to look up
 * or type a UUID.
 */
export const MemberPicker = memo(function MemberPicker({
  members,
  value,
  onChange,
  placeholder = "Filter by person",
  loading = false,
  testId,
}: {
  members: OrganizationMember[];
  value: string | null;
  onChange: (userId: string | null) => void;
  placeholder?: string;
  loading?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = useMemo(() => members.find((m) => m.id === value) ?? null, [members, value]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.email.toLowerCase().includes(q) || (m.full_name ?? "").toLowerCase().includes(q),
    );
  }, [members, query]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function choose(member: OrganizationMember | null) {
    onChange(member?.id ?? null);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-72" data-testid={testId}>
      <div className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-3 focus-within:border-[#8E88C7]/60">
        <User className="h-3.5 w-3.5 shrink-0 text-[#808495]" />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={open ? query : selected ? memberLabel(selected) : ""}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setHighlight((h) => Math.min(h + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && open && matches[highlight]) {
              e.preventDefault();
              choose(matches[highlight]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={loading ? "Loading people…" : placeholder}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-xs text-[#F5F5F7] placeholder-[#666A76] outline-none"
        />
        {selected ? (
          <button
            type="button"
            aria-label="Clear person filter"
            onClick={() => choose(null)}
            className="rounded p-0.5 text-[#808495] hover:text-[#F5F5F7]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-[#808495]" />
        )}
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 top-12 z-40 max-h-72 w-full overflow-y-auto rounded-xl border border-white/[0.12] bg-[#0D0F14] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.8)]"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-xs text-[#808495]">No matching people</li>
          ) : (
            matches.map((member, i) => (
              <li
                key={member.id}
                role="option"
                aria-selected={member.id === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(member);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 ${
                  i === highlight ? "bg-[#8E88C7]/20" : "hover:bg-white/[0.04]"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-[#F5F5F7]">
                    {member.full_name ?? member.email}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-[#808495]">
                    {member.email} · {member.effective_role?.name ?? formatRole(member.role)}
                  </span>
                </span>
                {member.id === value && <Check className="h-3.5 w-3.5 shrink-0 text-[#8E88C7]" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
});
