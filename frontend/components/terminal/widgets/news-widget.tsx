"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useState } from "react";

import { ErrorState, Loading, Segmented, SourceFooter, retryTerminal } from "@/components/terminal/widget-kit";
import { terminalApi } from "@/lib/terminal";

function when(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

export default function NewsWidget({ symbol }: { symbol: string }) {
  const [scope, setScope] = useState<"Symbol" | "Market">("Symbol");
  const target = scope === "Symbol" ? symbol : undefined;
  const q = useQuery({ retry: retryTerminal, queryKey: ["terminal", "news", target ?? "market"], queryFn: () => terminalApi.news(target), refetchInterval: 300_000 });
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.04] px-2 py-1">
        <Segmented label="News scope" options={["Symbol", "Market"] as const} value={scope} onChange={setScope} />
        {scope === "Symbol" && <span className="font-mono text-[10px] text-[#808495]">{symbol}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {q.error ? (
          <ErrorState error={q.error} />
        ) : !q.data ? (
          <Loading />
        ) : q.data!.data.length === 0 ? (
          <p className="p-3 text-xs text-[#808495]">No recent headlines.</p>
        ) : (
          <ul>
            {q.data!.data.map((n) => (
              <li key={n.link} className="border-b border-white/[0.03] px-2 py-1.5 hover:bg-white/[0.02]">
                <a href={n.link} target="_blank" rel="noopener noreferrer nofollow" className="group block">
                  <p className="text-[11.5px] leading-snug text-[#D4D5DB] group-hover:text-[#F5F5F7]">
                    {n.title}
                    <ExternalLink className="ml-1 inline h-2.5 w-2.5 text-[#4B4F5C]" />
                  </p>
                  <p className="mt-0.5 font-mono text-[9.5px] text-[#666A76]">
                    {n.publisher} · {when(n.published_at)}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <SourceFooter env={q.data} />
    </div>
  );
}
