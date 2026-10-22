"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ErrorState, Loading, TD, TH, retryTerminal } from "@/components/terminal/widget-kit";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";
import { fmtPrice, terminalApi } from "@/lib/terminal";

export default function AlertsWidget({ symbol }: { symbol: string }) {
  const qc = useQueryClient();
  const { subscribe } = useWebSocket();
  const alerts = useQuery({ retry: retryTerminal, queryKey: ["terminal", "alerts"], queryFn: terminalApi.alerts });
  const [form, setForm] = useState({ symbol, condition: "above" as "above" | "below", price: "" });
  const [error, setError] = useState<string | null>(null);
  const [fired, setFired] = useState<string | null>(null);

  useEffect(() => {
    setForm((f) => ({ ...f, symbol }));
  }, [symbol]);
  useEffect(
    () =>
      subscribe("price_alert", (ev: WSEvent) => {
        setFired(`${ev.symbol} ${ev.condition === "above" ? "rose to" : "fell to"} ${fmtPrice(ev.price as number)}`);
        void qc.invalidateQueries({ queryKey: ["terminal", "alerts"] });
      }),
    [subscribe, qc],
  );

  const create = useMutation({
    mutationFn: () => terminalApi.createAlert({ symbol: form.symbol, condition: form.condition, target_price: Number(form.price) }),
    onSuccess: () => {
      setForm((f) => ({ ...f, price: "" }));
      setError(null);
      void qc.invalidateQueries({ queryKey: ["terminal", "alerts"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not create the alert"),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => terminalApi.cancelAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["terminal", "alerts"] }),
  });

  const input = "rounded border border-white/[0.08] bg-black/30 px-1.5 py-1 font-mono text-[11px] outline-none focus:border-[#8E88C7]/60";
  return (
    <div className="flex h-full flex-col">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!(Number(form.price) > 0)) return setError("Enter a positive price");
          create.mutate();
        }}
        className="flex flex-wrap gap-1 border-b border-white/[0.04] p-1.5"
      >
        <input aria-label="Symbol" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} className={`${input} w-20 uppercase`} />
        <select aria-label="Condition" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value as "above" | "below" })} className={input}>
          <option value="above">rises to ≥</option>
          <option value="below">falls to ≤</option>
        </select>
        <input aria-label="Target price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="price" inputMode="decimal" className={`${input} w-20`} />
        <button type="submit" disabled={create.isPending} className="rounded bg-[#8E88C7] px-2 text-[11px] font-semibold text-[#0B0B10] disabled:opacity-50">
          Add
        </button>
      </form>
      {error && <p className="px-2 py-1 text-[10px] text-[#F87171]">{error}</p>}
      {fired && (
        <p className="flex items-center gap-1 bg-[#FBBF24]/10 px-2 py-1 text-[11px] text-[#FBBF24]" role="status">
          <BellRing className="h-3.5 w-3.5" /> {fired}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {alerts.error ? (
          <ErrorState error={alerts.error} />
        ) : !alerts.data ? (
          <Loading />
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-[#0B0D12]">
              <tr>
                <th className={TH}>Symbol</th>
                <th className={TH}>When</th>
                <th className={TH}>Status</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {alerts.data!.map((a) => (
                <tr key={a.id} className={`border-t border-white/[0.03] ${a.status !== "active" ? "opacity-60" : ""}`}>
                  <td className={`${TD} font-semibold`}>{a.symbol}</td>
                  <td className={TD}>
                    {a.condition === "above" ? "≥" : "≤"} {fmtPrice(a.target_price)}
                  </td>
                  <td className={TD}>
                    {a.status === "triggered" ? (
                      <span className="text-[#FBBF24]">hit {fmtPrice(a.triggered_price)}</span>
                    ) : (
                      a.status
                    )}
                  </td>
                  <td className="w-5 pr-1">
                    {a.status === "active" && (
                      <button type="button" onClick={() => cancel.mutate(a.id)} aria-label={`Cancel ${a.symbol} alert`} className="text-[#4B4F5C] hover:text-[#F87171]">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <footer className="border-t border-white/[0.05] px-2 py-1 font-mono text-[9.5px] text-[#666A76]">
        Checked every minute against delayed quotes · you are notified in-app when one fires
      </footer>
    </div>
  );
}
