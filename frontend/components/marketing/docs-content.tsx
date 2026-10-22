"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";

import { CodePanel } from "@/components/marketing/artifacts";
import { API_BASE_URL } from "@/lib/api";
import { DOC_CATEGORIES, DOC_SECTIONS, type DocSection } from "@/lib/marketing/docs";
import { cn } from "@/lib/utils";

function sectionText(s: DocSection): string {
  return [s.title, ...s.paragraphs, ...(s.bullets ?? []), s.code?.content ?? ""].join(" ").toLowerCase();
}

type ApiEndpoint = { method: string; path: string; summary: string; tag: string };

const METHOD_STYLE: Record<string, string> = {
  GET: "bg-gain-tint text-gain",
  POST: "bg-brand-tint text-brand",
  PUT: "bg-signal-tint text-signal-text",
  PATCH: "bg-signal-tint text-signal-text",
  DELETE: "bg-loss-tint text-loss",
};

function ApiReference() {
  const [endpoints, setEndpoints] = useState<ApiEndpoint[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/openapi.json`);
        if (!res.ok) throw new Error("unreachable");
        const spec = await res.json();
        const out: ApiEndpoint[] = [];
        for (const [path, methods] of Object.entries(spec.paths ?? {})) {
          for (const [method, op] of Object.entries(methods as Record<string, unknown>)) {
            if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
            const o = op as { tags?: string[]; summary?: string };
            out.push({ method: method.toUpperCase(), path, summary: o.summary ?? "", tag: o.tags?.[0] ?? "other" });
          }
        }
        if (active) setEndpoints(out);
      } catch {
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <p className="rounded-xl border border-line bg-paper-sunken p-4 text-[14.5px] text-ink-2">
        The endpoint list is generated live from the running service&apos;s OpenAPI schema. Start the backend (it serves{" "}
        <code className="font-code text-[13px] text-ink">/openapi.json</code>) to render it here.
      </p>
    );
  }
  if (!endpoints) return <p className="text-[14.5px] text-ink-3">Loading the live API schema…</p>;

  const byTag = endpoints.reduce<Record<string, ApiEndpoint[]>>((acc, e) => {
    (acc[e.tag] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {Object.entries(byTag)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([tag, eps]) => (
          <div key={tag}>
            <h3 className="mb-3 text-[16px] font-semibold capitalize text-ink">{tag}</h3>
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper-raised">
              {eps.map((e) => (
                <div key={`${e.method}-${e.path}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[14px]">
                  <span className={cn("w-16 shrink-0 rounded-md py-0.5 text-center font-code text-[11px] font-semibold", METHOD_STYLE[e.method])}>
                    {e.method}
                  </span>
                  <code className="font-code text-[13px] text-ink">{e.path}</code>
                  {e.summary && <span className="text-ink-2">— {e.summary}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

export function DocsContent() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => (q ? DOC_SECTIONS.filter((s) => sectionText(s).includes(q)) : DOC_SECTIONS), [q]);
  const visibleIds = new Set(filtered.map((s) => s.id));
  const showApi = !q || "api reference".includes(q);

  return (
    <div className="grid gap-10 lg:grid-cols-[250px_1fr] lg:gap-16">
      <aside className="lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pb-10">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the docs…"
            className="h-11 w-full rounded-xl border border-line-strong bg-paper-raised pl-10 pr-3 text-[14.5px] text-ink outline-none transition-shadow placeholder:text-ink-3 focus:border-brand focus:ring-4 focus:ring-brand/15"
            aria-label="Search documentation"
          />
        </div>
        {q && (
          <p className="mt-2 text-[13px] text-ink-3">
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
          </p>
        )}
        <nav className="mt-7 space-y-7" aria-label="Documentation sections">
          {DOC_CATEGORIES.map((cat) => {
            if (cat === "API Reference") {
              if (!showApi) return null;
              return (
                <div key={cat}>
                  <p className="mb-2 font-code text-[11px] font-medium uppercase tracking-[0.16em] text-ink-3">{cat}</p>
                  <a href="#api-reference" className="block rounded-lg px-2.5 py-1.5 text-[14px] text-ink-2 hover:bg-ink/[0.05] hover:text-ink">
                    Live endpoints
                  </a>
                  <a href="/docs/api" className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[14px] text-ink-2 hover:bg-ink/[0.05] hover:text-ink">
                    Full reference <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              );
            }
            const items = DOC_SECTIONS.filter((s) => s.category === cat && (!q || visibleIds.has(s.id)));
            if (items.length === 0) return null;
            return (
              <div key={cat}>
                <p className="mb-2 font-code text-[11px] font-medium uppercase tracking-[0.16em] text-ink-3">{cat}</p>
                <ul className="space-y-0.5">
                  {items.map((s) => (
                    <li key={s.id}>
                      <a href={`#${s.id}`} className="block rounded-lg px-2.5 py-1.5 text-[14px] text-ink-2 hover:bg-ink/[0.05] hover:text-ink">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 space-y-16">
        {filtered.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-28 border-b border-line pb-16 last:border-0">
            <p className="font-code text-[11px] font-medium uppercase tracking-[0.16em] text-brand">{s.category}</p>
            <h2 className="mt-2 font-editorial text-[34px] leading-tight tracking-[-0.015em] text-ink">{s.title}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="mt-4 max-w-3xl text-[16px] leading-[1.75] text-ink-2">
                {p}
              </p>
            ))}
            {s.bullets && (
              <ol className="mt-5 max-w-3xl space-y-3">
                {s.bullets.map((b, i) => (
                  <li key={i} className="flex gap-3 text-[15.5px] leading-[1.7] text-ink-2">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-tint font-code text-[11px] font-semibold text-brand">
                      {i + 1}
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </ol>
            )}
            {s.code && (
              <div className="mt-6 max-w-2xl">
                <CodePanel code={s.code.content} language={s.code.language} filename={s.code.label} />
              </div>
            )}
          </section>
        ))}

        {showApi && (
          <section id="api-reference" className="scroll-mt-28">
            <p className="font-code text-[11px] font-medium uppercase tracking-[0.16em] text-brand">API Reference</p>
            <h2 className="mt-2 font-editorial text-[34px] leading-tight tracking-[-0.015em] text-ink">Live endpoints</h2>
            <p className="mt-4 max-w-3xl text-[16px] leading-[1.75] text-ink-2">
              Generated from <code className="font-code text-[14px] text-ink">{API_BASE_URL}/openapi.json</code>, so it is always in
              sync with the deployed API. For request and response schemas, open the{" "}
              <a href="/docs/api" className="font-semibold text-brand underline-offset-4 hover:underline">
                complete API reference
              </a>
              .
            </p>
            <div className="mt-6">
              <ApiReference />
            </div>
          </section>
        )}

        {q && filtered.length === 0 && !showApi && <p className="text-[15px] text-ink-2">No documentation matches “{query}”.</p>}
      </div>
    </div>
  );
}
