"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { retryTerminal } from "@/components/terminal/widget-kit";
import { terminalApi, type WidgetType } from "@/lib/terminal";
import { WIDGET_CATALOG } from "@/store/terminal-store";

/** ⌘K / Ctrl+K: jump to any stock, ETF, index or crypto; or add a widget. */
export default function CommandPalette({
  open,
  onClose,
  onSymbol,
  onWidget,
}: {
  open: boolean;
  onClose: () => void;
  onSymbol: (s: string) => void;
  onWidget: (t: WidgetType) => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const results = useQuery({ retry: retryTerminal, queryKey: ["terminal", "search", debounced], queryFn: () => terminalApi.search(debounced), enabled: open && debounced.length > 0 });
  const widgets = (Object.keys(WIDGET_CATALOG) as WidgetType[]).filter(
    (t) => !q || WIDGET_CATALOG[t].title.toLowerCase().includes(q.toLowerCase()) || t.includes(q.toLowerCase()),
  );
  const symbols = results.data?.data ?? [];
  const typed = q.trim().toUpperCase();
  // Real matches first; the typed text as a raw symbol is only a fallback (it may be a
  // company name like "nvidia", not a ticker).
  const rawTyped =
    typed && /^[A-Z0-9.\-=^]{1,20}$/.test(typed) && !symbols.some((s) => s.symbol === typed)
      ? [{ kind: "symbol" as const, key: `raw-${typed}`, label: typed, detail: "Open as a ticker", run: () => onSymbol(typed) }]
      : [];
  const items: { kind: "symbol" | "widget"; key: string; label: string; detail: string; run: () => void }[] = [
    ...symbols.map((s) => ({ kind: "symbol" as const, key: s.symbol, label: s.symbol, detail: `${s.name}${s.exchange ? ` · ${s.exchange}` : ""}`, run: () => onSymbol(s.symbol) })),
    ...rawTyped,
    ...widgets.map((t) => ({ kind: "widget" as const, key: `w-${t}`, label: `Add ${WIDGET_CATALOG[t].title}`, detail: WIDGET_CATALOG[t].hint, run: () => onWidget(t) })),
  ];

  if (!open) return null;
  const choose = (i: number) => {
    items[i]?.run();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onMouseDown={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-xl border border-white/[0.1] bg-[#0D0F14] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-3">
          <Search className="h-4 w-4 text-[#808495]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(active);
              } else if (e.key === "Escape") onClose();
            }}
            placeholder="Search stocks, ETFs, indices, crypto — or a widget"
            aria-label="Search"
            className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-[#4B4F5C]"
          />
          <kbd className="rounded border border-white/[0.1] px-1 font-mono text-[10px] text-[#666A76]">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-auto py-1" role="listbox">
          {results.isFetching && <li className="px-3 py-1 text-[11px] text-[#666A76]">Searching…</li>}
          {items.map((it, i) => (
            <li
              key={it.key}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-1.5 ${i === active ? "bg-white/[0.06]" : ""}`}
            >
              <span className={`w-24 shrink-0 truncate font-mono text-xs ${it.kind === "symbol" ? "font-semibold text-[#F5F5F7]" : "text-[#B7B2E6]"}`}>{it.label}</span>
              <span className="truncate text-[11px] text-[#808495]">{it.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
