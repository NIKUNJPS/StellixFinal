"use client";

import { GripVertical, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ageLabel, changeColor, TerminalError, type Envelope } from "@/lib/terminal";

/** A widget's chrome: drag handle (``.widget-drag``), title, actions, close, body. */
export function WidgetFrame({
  id,
  title,
  subtitle,
  actions,
  onClose,
  children,
}: {
  id: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section
      id={`widget-${id}`}
      className="flex h-full flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#0B0D12] shadow-[0_8px_30px_rgb(0,0,0,0.35)]"
      aria-label={title}
    >
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-2">
        <span className="widget-drag flex cursor-grab items-center text-[#4B4F5C] active:cursor-grabbing" title="Drag to move">
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <h2 className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#D4D5DB]">{title}</h2>
        {subtitle && <span className="truncate font-mono text-[10px] text-[#808495]">{subtitle}</span>}
        <div className="ml-auto flex items-center gap-1">
          {actions}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-[#4B4F5C] hover:bg-white/[0.06] hover:text-[#F5F5F7]"
            title="Remove widget"
            aria-label={`Remove ${title}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

/** Where the numbers came from and how old they are — on every widget, always. */
export function SourceFooter({ env, extra }: { env?: Pick<Envelope<unknown>, "source" | "delay_note" | "stale" | "age_seconds"> | null; extra?: ReactNode }) {
  if (!env) return null;
  return (
    <footer className="sticky bottom-0 flex flex-wrap items-center gap-x-2 border-t border-white/[0.05] bg-[#0B0D12]/95 px-2 py-1 font-mono text-[9.5px] text-[#666A76]">
      <span>{env.source}</span>
      <span>·</span>
      <span title={env.delay_note}>{env.delay_note}</span>
      <span>·</span>
      {env.stale ? (
        <span className="text-[#FBBF24]" title="The latest refresh failed; this is the last good data">
          stale, {ageLabel(env.age_seconds)}
        </span>
      ) : (
        <span>{ageLabel(env.age_seconds)}</span>
      )}
      {extra}
    </footer>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[80px] items-center justify-center gap-2 text-xs text-[#808495]">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

/** Errors say what happened: 503 = needs configuration, 502 = source down, 404 = unknown. */
export function ErrorState({ error }: { error: unknown }) {
  const status = error instanceof TerminalError ? error.status : 0;
  const message = error instanceof Error ? error.message : "Something went wrong";
  const tone =
    status === 503 ? "border-[#FBBF24]/25 bg-[#FBBF24]/5 text-[#FBBF24]" : "border-[#F87171]/25 bg-[#F87171]/5 text-[#F87171]";
  const label = status === 503 ? "Not configured" : status === 502 ? "Source unavailable" : status === 404 ? "Not found" : "Error";
  return (
    <div className={`m-2 rounded-lg border p-3 text-xs ${tone}`} role="alert">
      <p className="font-semibold">{label}</p>
      <p className="mt-1 opacity-90">{message}</p>
    </div>
  );
}

/** Briefly tints a value green/red when it changes (not on first render). */
export function useFlash(value: number | null | undefined): string {
  const prev = useRef(value);
  const [flash, setFlash] = useState("");
  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before == null || value == null || before === value) return;
    setFlash(value > before ? "flash-up" : "flash-down");
    const t = setTimeout(() => setFlash(""), 700);
    return () => clearTimeout(t);
  }, [value]);
  return flash;
}

export function Flash({ value, children, className = "" }: { value: number | null | undefined; children: ReactNode; className?: string }) {
  const flash = useFlash(value);
  return <span className={`rounded px-0.5 transition-colors duration-700 ${flash} ${className}`}>{children}</span>;
}

export function Change({ value, children }: { value: number | null | undefined; children: ReactNode }) {
  return (
    <span className="font-mono" style={{ color: changeColor(value) }}>
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md border border-white/[0.06] bg-white/[0.02] p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={o === value}
          onClick={() => onChange(o)}
          className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
            o === value ? "bg-white/[0.1] text-[#F5F5F7]" : "text-[#808495] hover:text-[#D4D5DB]"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** Retry only what can succeed on retry: never "not configured" (503), "not found"
 * (404), validation (422) or auth (401/403) — those just delay the honest message. */
export function retryTerminal(failureCount: number, error: unknown): boolean {
  if (error instanceof TerminalError && [401, 403, 404, 422, 503].includes(error.status)) return false;
  return failureCount < 2;
}

export const TH = "px-2 py-1 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.1em] text-[#666A76]";
export const TD = "px-2 py-1 font-mono text-[11px] text-[#D4D5DB]";
