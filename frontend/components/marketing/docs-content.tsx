"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { CodeBlock } from "@/components/marketing/code-block";
import { API_BASE_URL } from "@/lib/api";
import { DOC_CATEGORIES, DOC_SECTIONS, type DocSection } from "@/lib/marketing/docs";
import { cn } from "@/lib/utils";

function sectionText(s: DocSection): string {
  return [s.title, ...s.paragraphs, ...(s.bullets ?? []), s.code?.content ?? ""].join(" ").toLowerCase();
}

type ApiEndpoint = { method: string; path: string; summary: string; tag: string };

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
            out.push({
              method: method.toUpperCase(),
              path,
              summary: o.summary ?? "",
              tag: o.tags?.[0] ?? "other",
            });
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
      <p className="rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
        The API reference is generated live from the running service&apos;s OpenAPI schema. Start the backend
        (its <code className="font-mono text-xs">/openapi.json</code>) to render the full endpoint list here.
      </p>
    );
  }
  if (!endpoints) {
    return <p className="text-sm text-muted-foreground">Loading the live API schema…</p>;
  }

  const byTag = endpoints.reduce<Record<string, ApiEndpoint[]>>((acc, e) => {
    (acc[e.tag] ??= []).push(e);
    return acc;
  }, {});
  const methodColor: Record<string, string> = {
    GET: "text-emerald-400",
    POST: "text-accent",
    PUT: "text-amber-400",
    PATCH: "text-amber-400",
    DELETE: "text-destructive",
  };

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Generated live from <code className="font-mono text-xs">{API_BASE_URL}/openapi.json</code> — always in sync
        with the deployed API.
      </p>
      {Object.entries(byTag)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([tag, eps]) => (
          <div key={tag}>
            <h3 className="mb-3 font-display text-lg font-semibold capitalize">{tag}</h3>
            <div className="overflow-hidden rounded-lg border border-border">
              {eps.map((e, i) => (
                <div
                  key={`${e.method}-${e.path}`}
                  className={cn(
                    "flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm",
                    i > 0 && "border-t border-border/50",
                  )}
                >
                  <span className={cn("w-16 shrink-0 font-mono text-xs font-semibold", methodColor[e.method])}>
                    {e.method}
                  </span>
                  <code className="font-mono text-xs text-foreground">{e.path}</code>
                  {e.summary && <span className="text-muted-foreground">— {e.summary}</span>}
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

  const filtered = useMemo(
    () => (q ? DOC_SECTIONS.filter((s) => sectionText(s).includes(q)) : DOC_SECTIONS),
    [q],
  );
  const visibleIds = new Set(filtered.map((s) => s.id));

  return (
    <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
      {/* Sidebar */}
      <aside className="lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)] lg:overflow-y-auto">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the docs…"
            className="w-full rounded-lg border border-border bg-card/40 py-2 pl-9 pr-3 text-sm outline-none focus:border-accent/60"
            aria-label="Search documentation"
          />
        </div>
        {q && (
          <p className="mt-2 text-xs text-muted-foreground">
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
          </p>
        )}
        <nav className="mt-6 space-y-6">
          {DOC_CATEGORIES.map((cat) => {
            const items = DOC_SECTIONS.filter((s) => s.category === cat && (!q || visibleIds.has(s.id)));
            if (cat === "API Reference") {
              if (q && !"api reference".includes(q)) return null;
              return (
                <div key={cat}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground/70">{cat}</p>
                  <a
                    href="#api-reference"
                    className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  >
                    Live endpoints
                  </a>
                </div>
              );
            }
            if (items.length === 0) return null;
            return (
              <div key={cat}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground/70">{cat}</p>
                <ul className="space-y-0.5">
                  {items.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground"
                      >
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

      {/* Content */}
      <div className="min-w-0 space-y-14">
        {filtered.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">{s.category}</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{s.title}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {p}
              </p>
            ))}
            {s.bullets && (
              <ul className="mt-4 max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                {s.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
            {s.code && (
              <div className="mt-5 max-w-2xl">
                <CodeBlock code={s.code.content} language={s.code.language} label={s.code.label} />
              </div>
            )}
          </section>
        ))}

        {(!q || "api reference".includes(q)) && (
          <section id="api-reference" className="scroll-mt-24">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">API Reference</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Live endpoints</h2>
            <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
              A quick overview is below. For the full interactive reference — request/response
              schemas, examples, and try-it — open the{" "}
              <a href="/docs/api" className="font-medium text-accent hover:underline">
                complete API reference (Redoc) →
              </a>
            </p>
            <div className="mt-6">
              <ApiReference />
            </div>
          </section>
        )}

        {q && filtered.length === 0 && !"api reference".includes(q) && (
          <p className="text-sm text-muted-foreground">No documentation matches “{query}”.</p>
        )}
      </div>
    </div>
  );
}
