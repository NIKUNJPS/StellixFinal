"use client";

/**
 * CodeBlock — a simple syntax-highlighted (monospace) code display used in
 * the Docs and Architecture pages. Uses no external syntax highlighter to
 * keep the bundle lean; relies on the JetBrains Mono font loaded by the
 * marketing layout for a premium monospace appearance.
 */

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

type CodeBlockProps = {
  code: string;
  language?: string;
  label?: string;
  className?: string;
};

export function CodeBlock({ code, language, label, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  return (
    <figure
      className={cn(
        "overflow-hidden rounded-xl border border-white/[0.08] bg-[#0D0D13]",
        className,
      )}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2.5">
        <div className="flex items-center gap-2">
          {/* Traffic-light dots */}
          <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          {label && (
            <span className="ml-2 text-[11px] font-medium text-white/30">{label}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {language && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/20">
              {language}
            </span>
          )}
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy code"
            className="flex h-6 w-6 items-center justify-center rounded-md text-white/30 transition-colors hover:text-white/60"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Code body */}
      <pre className="overflow-x-auto p-5 font-[family-name:var(--font-jetbrains,monospace)] text-[12.5px] leading-relaxed text-white/60">
        <code>{code}</code>
      </pre>
    </figure>
  );
}
