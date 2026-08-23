"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Layers,
  Activity,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getCrossAssetRegime,
  type CrossAssetRegime,
} from "@/lib/regime";
import {
  REGIME_COLORS,
  type RegimeLabel,
} from "@/lib/regime-types";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);

  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);

  return months < 12
    ? `${months}mo ago`
    : `${Math.floor(months / 12)}y ago`;
}

type CrossAssetRegimeProps = {
  activeSymbol?: string;
  timelineLoaded?: boolean;
};

export function CrossAssetRegime({
  activeSymbol = "",
  timelineLoaded = false,
}: CrossAssetRegimeProps) {
  const [data, setData] = useState<CrossAssetRegime | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCrossAssetRegime()
      .then(setData)
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Failed to load",
        ),
      );
  }, []);

  const normalizedActiveSymbol = activeSymbol.trim().toUpperCase();

  const activeAsset = useMemo(() => {
    if (!data || !normalizedActiveSymbol || !timelineLoaded) {
      return null;
    }

    return data.assets[normalizedActiveSymbol] ?? null;
  }, [data, normalizedActiveSymbol, timelineLoaded]);

  return (
    <Card className="overflow-hidden border-[#d3dbdd]/10 bg-[#16232b]">
      <CardHeader className="pb-5">
        <CardTitle className="flex items-center gap-2 text-[#f2d17d]">
          <Layers className="h-5 w-5 text-[#f2d17d]" />
          Cross-asset regimes
        </CardTitle>

        <CardDescription className="max-w-2xl text-[#d3dbdd]/55">
          The latest detected regime for each tracked asset, and any
          divergences between them.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {error && (
          <p className="rounded-xl border border-[#c40707]/30 bg-[#c40707]/10 px-4 py-3 text-sm text-[#ff8b8b]">
            {error}
          </p>
        )}

        {!data && !error && (
          <p className="text-sm text-[#d3dbdd]/55">
            Loading…
          </p>
        )}

        {data && data.insufficient_data && (
          <div className="rounded-xl border border-[#d3dbdd]/10 bg-[#0f1b22] px-4 py-7 text-center">
            <p className="text-sm text-[#d3dbdd]/65">
              Not enough stored regime data yet. Run detection on
              at least two symbols
              {data.requested_symbols.length > 0 && (
                <> (tried {data.requested_symbols.join(", ")})</>
              )}{" "}
              to compare them here.
            </p>
          </div>
        )}

        {data && !data.insufficient_data && (
          <>
            {/* Asset cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(data.assets).map(([symbol, a]) => {
                const color =
                  REGIME_COLORS[
                    a.regime as RegimeLabel
                  ] ?? "#d3dbdd";

                const isActive =
                  timelineLoaded &&
                  normalizedActiveSymbol === symbol.toUpperCase();

                return (
                  <div
                    key={symbol}
                    className={`
                      relative rounded-xl border p-4
                      transition-all duration-500
                      ease-[cubic-bezier(0.22,1,0.36,1)]
                      ${
                        isActive
                          ? "z-10 scale-[1.035] border-[#074068] bg-[#042F34] shadow-[0_14px_40px_rgba(7,64,104,0.28)]"
                          : "border-[#d3dbdd]/10 bg-[#0f1b22] hover:border-[#d3dbdd]/20 hover:bg-[#11232a]"
                      }
                    `}
                  >
                    {/* Active top indicator */}
                    <div
                      className={`
                        absolute inset-x-4 -top-px h-[2px]
                        rounded-full transition-all duration-500
                        ${
                          isActive
                            ? "opacity-100"
                            : "opacity-0"
                        }
                      `}
                      style={{
                        backgroundColor: color,
                        boxShadow: isActive
                          ? `0 0 16px ${color}`
                          : "none",
                      }}
                    />

                    <div className="flex items-center justify-between">
                      <span
                        className={`
                          font-semibold text-[#d3dbdd]
                          transition-all duration-500
                          ${isActive ? "text-base" : "text-sm"}
                        `}
                      >
                        {symbol}
                      </span>

                      <span
                        className={`
                          rounded-full transition-all duration-500
                          ${
                            isActive
                              ? "h-3 w-3"
                              : "h-2.5 w-2.5"
                          }
                        `}
                        style={{
                          backgroundColor: color,
                          boxShadow: isActive
                            ? `0 0 12px ${color}`
                            : "none",
                        }}
                      />
                    </div>

                    <p
                      className={`
                        mt-2 font-medium
                        transition-all duration-500
                        ${
                          isActive
                            ? "text-xl"
                            : "text-lg"
                        }
                      `}
                      style={{ color }}
                    >
                      {a.regime}
                    </p>

                    <p className="text-xs text-[#d3dbdd]/45">
                      {(a.confidence * 100).toFixed(0)}%
                      confident · {relativeTime(a.detected_at)}
                    </p>

                    {/* Active timeline indicator */}
                    <div
                      className={`
                        grid transition-all duration-500
                        ${
                          isActive
                            ? "mt-3 grid-rows-[1fr] opacity-100"
                            : "mt-0 grid-rows-[0fr] opacity-0"
                        }
                      `}
                    >
                      <div className="overflow-hidden">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[#d3dbdd]/55">
                          <Activity className="h-3 w-3" />
                          Loaded timeline
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>


            {/* Divergence section */}
            {data.divergences.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div
                    className="
                      flex h-7 w-7 items-center justify-center
                      rounded-lg bg-[#fe5b05]/10
                      border border-[#fe5b05]/20
                    "
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-[#fe5b05]" />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-[#d3dbdd]">
                      Regime divergences
                    </p>

                    <p className="text-xs text-[#d3dbdd]/40">
                      Assets are behaving differently across the
                      current market environment.
                    </p>
                  </div>
                </div>

                {data.divergences.map((d, i) => (
                  <div
                    key={i}
                    className="
                      rounded-xl border
                      border-[#fe5b05]/20
                      bg-[#fe5b05]/[0.035]
                      px-4 py-3
                      transition-all duration-200
                      hover:border-[#fe5b05]/30
                      hover:bg-[#fe5b05]/[0.055]
                    "
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="
                          mt-0.5 flex h-7 w-7 shrink-0
                          items-center justify-center
                          rounded-lg
                          bg-[#fe5b05]/10
                        "
                      >
                        <AlertTriangle className="h-3.5 w-3.5 text-[#fe5b05]" />
                      </div>

                      <div className="min-w-0">
                        <div className="mb-1.5 flex items-center gap-2">
                          <Badge
                            className="
                              border-0 bg-[#fe5b05]/10
                              text-[#fe8a4d]
                              hover:bg-[#fe5b05]/10
                            "
                          >
                            {d.type.replace("_", " ")}
                          </Badge>
                        </div>

                        <p className="text-sm leading-relaxed text-[#d3dbdd]/60">
                          {d.message}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}