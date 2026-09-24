"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, LineChart as LineChartIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";
import { getScreener } from "@/lib/market-research";
import type { ScreenerResponse, ScreenerRow } from "@/lib/market-research-types";

type SortKey = "symbol" | "sector" | "last_price" | "change_pct" | "volume" | "dollar_volume";

function SortableHeader({
  label,
  sortKey,
  active,
  direction,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  direction: "asc" | "desc";
  onClick: (key: SortKey) => void;
}) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      onClick={() => onClick(sortKey)}
      className="cursor-pointer select-none whitespace-nowrap hover:text-[#F5F5F7]"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className={`h-3 w-3 ${active ? "text-[#8E88C7]" : "text-[#666A76]"}`} />
      </span>
    </TableHead>
  );
}

export function ScreenerTable({ onSelectSymbol }: { onSelectSymbol?: (symbol: string) => void }) {
  const [data, setData] = useState<ScreenerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("dollar_volume");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const { subscribe } = useWebSocket();

  useEffect(() => {
    let active = true;
    getScreener()
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Failed to load screener"));
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      subscribe("screener_update", (event: WSEvent) => {
        const rows = event.rows as ScreenerRow[] | undefined;
        if (!Array.isArray(rows)) return;
        setData((prev) =>
          prev
            ? { ...prev, rows, generated_at: String(event.timestamp ?? new Date().toISOString()) }
            : prev,
        );
      }),
    [subscribe],
  );

  function sortBy(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sectors = useMemo(() => Array.from(new Set((data?.rows ?? []).map((r) => r.sector))).sort(), [data]);

  const rows = useMemo(() => {
    let items = data?.rows ?? [];
    if (sectorFilter !== "all") items = items.filter((r) => r.sector === sectorFilter);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      const av = a[sortKey as keyof ScreenerRow];
      const bv = b[sortKey as keyof ScreenerRow];
      if (typeof av === "string" && typeof bv === "string") return dir * av.localeCompare(bv);
      const an = typeof av === "number" ? av : -Infinity;
      const bn = typeof bv === "number" ? bv : -Infinity;
      return dir * (an - bn);
    });
  }, [data, sectorFilter, sortKey, sortDir]);

  if (error && !data) {
    return <p className="rounded-2xl border border-[#F87171]/25 bg-[#F87171]/[0.08] p-4 text-xs text-[#F87171]">{error}</p>;
  }
  if (!data) {
    return <div className="h-[340px] animate-pulse rounded-2xl border border-white/[0.06] bg-[#0F1117]/70" />;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-[#666A76]">{data.universe_note}</p>
        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="rounded-lg border border-white/[0.08] bg-[#0F1117] px-2.5 py-1.5 text-xs text-[#F5F5F7]"
        >
          <option value="all">All sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader label="Symbol" sortKey="symbol" active={sortKey === "symbol"} direction={sortDir} onClick={sortBy} />
              <SortableHeader label="Sector" sortKey="sector" active={sortKey === "sector"} direction={sortDir} onClick={sortBy} />
              <SortableHeader label="Price" sortKey="last_price" active={sortKey === "last_price"} direction={sortDir} onClick={sortBy} />
              <SortableHeader label="% Chg" sortKey="change_pct" active={sortKey === "change_pct"} direction={sortDir} onClick={sortBy} />
              <SortableHeader label="Volume" sortKey="volume" active={sortKey === "volume"} direction={sortDir} onClick={sortBy} />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.symbol}>
                <TableCell className="font-mono font-semibold text-[#F5F5F7]">{row.symbol}</TableCell>
                <TableCell className="text-xs text-[#9A9DA8]">{row.sector}</TableCell>
                {row.status === "ok" ? (
                  <>
                    <TableCell className="font-mono">{row.last_price?.toFixed(2)}</TableCell>
                    <TableCell
                      className="font-mono"
                      style={{ color: (row.change_pct ?? 0) >= 0 ? "#34D399" : "#F87171" }}
                    >
                      {(row.change_pct ?? 0) >= 0 ? "+" : ""}
                      {row.change_pct?.toFixed(2)}%
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#9A9DA8]">
                      {row.volume ? Math.round(row.volume).toLocaleString() : "—"}
                    </TableCell>
                  </>
                ) : (
                  <TableCell colSpan={3} className="text-xs text-[#666A76]" title={row.unavailable_reason ?? undefined}>
                    unavailable
                  </TableCell>
                )}
                <TableCell>
                  {onSelectSymbol && (
                    <button
                      onClick={() => onSelectSymbol(row.symbol)}
                      className="rounded-lg border border-white/[0.08] p-1.5 text-[#8E88C7] hover:bg-white/[0.04]"
                      title="View chart"
                    >
                      <LineChartIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
