"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Layers } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCrossAssetRegime, type CrossAssetRegime } from "@/lib/regime";
import { REGIME_COLORS, type RegimeLabel } from "@/lib/regime-types";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

export function CrossAssetRegime() {
  const [data, setData] = useState<CrossAssetRegime | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCrossAssetRegime()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-stellix-highlight" />
          Cross-asset regimes
        </CardTitle>
        <CardDescription>
          The latest detected regime for each tracked asset, and any divergences between them.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {error && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {!data && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

        {data && data.insufficient_data && (
          <p className="rounded-md border border-border bg-background/40 px-4 py-6 text-center text-sm text-muted-foreground">
            Not enough stored regime data yet. Run detection on at least two symbols
            {data.requested_symbols.length > 0 && (
              <> (tried {data.requested_symbols.join(", ")})</>
            )}{" "}
            to compare them here.
          </p>
        )}

        {data && !data.insufficient_data && (
          <>
            {/* Asset cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(data.assets).map(([symbol, a]) => {
                const color = REGIME_COLORS[a.regime as RegimeLabel] ?? "hsl(var(--muted-foreground))";
                return (
                  <div key={symbol} className="rounded-lg border border-border bg-background/40 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{symbol}</span>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                    </div>
                    <p className="mt-2 text-lg font-medium" style={{ color }}>
                      {a.regime}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(a.confidence * 100).toFixed(0)}% confident · {relativeTime(a.detected_at)}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Synchronized note (not an alert) */}
            {data.synchronized && (
              <p className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-3 py-2 text-sm text-muted-foreground">
                <ArrowLeftRight className="h-4 w-4 shrink-0" />
                All tracked assets are in the same regime — markets are synchronized.
              </p>
            )}

            {/* Divergence alerts (only when there are real divergences) */}
            {data.divergences.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Divergences</p>
                {data.divergences.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div>
                      <Badge variant="secondary" className="mr-2 capitalize">
                        {d.type.replace("_", " ")}
                      </Badge>
                      <span className="text-muted-foreground">{d.message}</span>
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
