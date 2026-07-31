import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Minimal, dependency-free syntax highlighter for the handful of real code
 * artifacts shown on the public site — the Strategy JSON DSL and a real Cypher
 * query (Batch 15). Deliberately not a full highlighter library: keeping shiki /
 * react-syntax-highlighter out of the bundle protects the landing page's
 * Lighthouse score, and these two grammars are small and fixed.
 */

type Token = { text: string; cls?: string };

const CYPHER_KEYWORDS = new Set([
  "MATCH", "WHERE", "RETURN", "ORDER", "BY", "AS", "AND", "OR", "WITH",
  "MERGE", "CREATE", "COUNT", "DESC", "ASC", "LIMIT", "OPTIONAL",
]);

function highlightJson(src: string): Token[] {
  const tokens: Token[] = [];
  // key · string · number · punctuation · comment
  const re = /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+\.?\d*)|([{}[\],:])|(\/\/[^\n]*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) tokens.push({ text: src.slice(last, m.index) });
    if (m[1]) tokens.push({ text: m[1], cls: "text-accent" });
    else if (m[2]) tokens.push({ text: m[2], cls: "text-emerald-700" });
    else if (m[3]) tokens.push({ text: m[3], cls: "text-[#003399]" });
    else if (m[4]) tokens.push({ text: m[4], cls: "text-muted-foreground" });
    else if (m[5]) tokens.push({ text: m[5], cls: "text-slate-500 italic" });
    last = re.lastIndex;
  }
  if (last < src.length) tokens.push({ text: src.slice(last) });
  return tokens;
}

function highlightCypher(src: string): Token[] {
  const tokens: Token[] = [];
  const re = /(\/\/[^\n]*)|(\$\w+)|(:\w+)|("(?:[^"\\]|\\.)*")|(\b[A-Za-z_]\w*\b)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) tokens.push({ text: src.slice(last, m.index) });
    if (m[1]) tokens.push({ text: m[1], cls: "text-slate-500 italic" });
    else if (m[2]) tokens.push({ text: m[2], cls: "text-[#003399]" });
    else if (m[3]) tokens.push({ text: m[3], cls: "text-[#0066FF]" });
    else if (m[4]) tokens.push({ text: m[4], cls: "text-emerald-700" });
    else if (m[5]) {
      tokens.push(
        CYPHER_KEYWORDS.has(m[5].toUpperCase())
          ? { text: m[5], cls: "font-semibold text-accent" }
          : { text: m[5] },
      );
    }
    last = re.lastIndex;
  }
  if (last < src.length) tokens.push({ text: src.slice(last) });
  return tokens;
}

export function CodeBlock({
  code,
  language = "json",
  label,
  className,
}: {
  code: string;
  language?: "json" | "cypher" | "text";
  label?: ReactNode;
  className?: string;
}) {
  const tokens =
    language === "json" ? highlightJson(code) : language === "cypher" ? highlightCypher(code) : [{ text: code }];

  return (
    <figure
      className={cn(
        "overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#F7F9FC]",
        className,
      )}
    >
      {label && (
        <figcaption className="flex items-center gap-2 border-b border-[#E2E8F0] bg-white px-4 py-2.5 text-xs font-medium text-muted-foreground">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
          </span>
          <span className="ml-2">{label}</span>
        </figcaption>
      )}
      <div className="overflow-x-auto">
        <pre className="px-4 py-4 text-[13px] leading-relaxed">
          <code className="font-code">
            {tokens.map((t, i) => (
              <span key={i} className={t.cls}>
                {t.text}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </figure>
  );
}
