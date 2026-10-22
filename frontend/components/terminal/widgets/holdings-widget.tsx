"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Change, ErrorState, Loading, Segmented, TD, TH, retryTerminal } from "@/components/terminal/widget-kit";
import { fmtNum, fmtPct, fmtPrice, terminalApi } from "@/lib/terminal";

function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function HoldingsWidget({ symbol, onSelect }: { symbol: string; onSelect: (s: string) => void }) {
  const qc = useQueryClient();
  const portfolios = useQuery({ retry: retryTerminal, queryKey: ["terminal", "portfolios"], queryFn: terminalApi.portfolios });
  const [pid, setPid] = useState<string | null>(null);
  const [tab, setTab] = useState<"Positions" | "Ledger">("Positions");
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState({ symbol, side: "buy" as "buy" | "sell", quantity: "", price: "", fee: "0", executed_at: nowLocal() });

  useEffect(() => {
    const first = portfolios.data?.[0];
    if (!pid && first) setPid(first.id);
  }, [pid, portfolios.data]);
  useEffect(() => {
    setTx((t) => ({ ...t, symbol }));
  }, [symbol]);

  const positions = useQuery({ retry: retryTerminal, queryKey: ["terminal", "positions", pid], queryFn: () => terminalApi.positions(pid!), enabled: !!pid, refetchInterval: 30_000 });
  const ledger = useQuery({ retry: retryTerminal, queryKey: ["terminal", "ledger", pid], queryFn: () => terminalApi.transactions(pid!), enabled: !!pid && tab === "Ledger" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["terminal"] });

  const createPortfolio = useMutation({
    mutationFn: () => terminalApi.createPortfolio({ name: "My portfolio", base_currency: "USD" }),
    onSuccess: (p) => {
      setPid(p.id);
      void refresh();
    },
  });
  const addTx = useMutation({
    mutationFn: () =>
      terminalApi.addTransaction(pid!, {
        symbol: tx.symbol.trim().toUpperCase(),
        side: tx.side,
        quantity: Number(tx.quantity),
        price: Number(tx.price),
        fee: Number(tx.fee || 0),
        executed_at: new Date(tx.executed_at).toISOString(),
        note: null,
      }),
    onSuccess: () => {
      setError(null);
      setTx((t) => ({ ...t, quantity: "", price: "" }));
      void refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not add the transaction"),
  });
  const delTx = useMutation({
    mutationFn: (id: string) => terminalApi.deleteTransaction(pid!, id),
    onSuccess: () => {
      setError(null);
      void refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not delete"),
  });

  if (portfolios.error) return <ErrorState error={portfolios.error} />;
  if (!portfolios.data) return <Loading />;
  if (!portfolios.data!.length)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="text-xs text-[#9A9DA8]">Track your holdings: average cost, realised and unrealised P&amp;L — and hand the book to the Agent Desk.</p>
        <button type="button" onClick={() => createPortfolio.mutate()} className="rounded bg-[#8E88C7] px-3 py-1 text-xs font-semibold text-[#0B0B10]">
          Create a portfolio
        </button>
      </div>
    );

  const p = positions.data;
  const input = "rounded border border-white/[0.08] bg-black/30 px-1.5 py-1 font-mono text-[10.5px] outline-none focus:border-[#8E88C7]/60";
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.04] px-2 py-1">
        <select aria-label="Portfolio" value={pid ?? ""} onChange={(e) => setPid(e.target.value)} className={input}>
          {portfolios.data!.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} ({x.base_currency})
            </option>
          ))}
        </select>
        <Segmented label="View" options={["Positions", "Ledger"] as const} value={tab} onChange={setTab} />
        <Link href={`/agents?holdings=${pid}`} className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-[#B7B2E6] hover:underline" title="Run the Agent Desk against this book">
          <Bot className="h-3 w-3" /> Agent Desk
        </Link>
      </div>
      {p && (
        <div className="flex flex-wrap gap-x-4 px-2 py-1 font-mono text-[10.5px] text-[#9A9DA8]">
          <span>Value {p.totals.market_value == null ? "—" : fmtPrice(p.totals.market_value)}</span>
          <span>
            Unrealised <Change value={p.totals.unrealized_pnl}>{fmtPrice(p.totals.unrealized_pnl)}</Change>
          </span>
          <span>
            Realised <Change value={p.totals.realized_pnl}>{fmtPrice(p.totals.realized_pnl)}</Change>
          </span>
          {!p.totals.complete && <span className="text-[#FBBF24]">some prices unavailable</span>}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!(Number(tx.quantity) > 0 && Number(tx.price) > 0)) return setError("Quantity and price must be positive");
          addTx.mutate();
        }}
        className="flex flex-wrap gap-1 border-y border-white/[0.04] px-2 py-1"
      >
        <select aria-label="Side" value={tx.side} onChange={(e) => setTx({ ...tx, side: e.target.value as "buy" | "sell" })} className={input}>
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </select>
        <input aria-label="Symbol" value={tx.symbol} onChange={(e) => setTx({ ...tx, symbol: e.target.value })} className={`${input} w-16 uppercase`} />
        <input aria-label="Quantity" value={tx.quantity} onChange={(e) => setTx({ ...tx, quantity: e.target.value })} placeholder="qty" inputMode="decimal" className={`${input} w-14`} />
        <input aria-label="Price" value={tx.price} onChange={(e) => setTx({ ...tx, price: e.target.value })} placeholder="price" inputMode="decimal" className={`${input} w-16`} />
        <input aria-label="Fee" value={tx.fee} onChange={(e) => setTx({ ...tx, fee: e.target.value })} placeholder="fee" inputMode="decimal" className={`${input} w-12`} />
        <input aria-label="Executed at" type="datetime-local" value={tx.executed_at} onChange={(e) => setTx({ ...tx, executed_at: e.target.value })} className={`${input} [color-scheme:dark]`} />
        <button type="submit" disabled={addTx.isPending} className="rounded bg-[#8E88C7] px-2 text-[10.5px] font-semibold text-[#0B0B10] disabled:opacity-50">
          Add
        </button>
      </form>
      {error && <p className="px-2 py-1 text-[10px] text-[#F87171]">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "Positions" ? (
          positions.error ? (
            <ErrorState error={positions.error} />
          ) : !positions.data ? (
            <Loading />
          ) : p!.positions.length === 0 ? (
            <p className="p-3 text-xs text-[#808495]">No transactions yet.</p>
          ) : (
            <table className="w-full min-w-[520px]">
              <thead className="sticky top-0 bg-[#0B0D12]">
                <tr>
                  <th className={TH}>Symbol</th>
                  <th className={`${TH} text-right`}>Qty</th>
                  <th className={`${TH} text-right`}>Avg cost</th>
                  <th className={`${TH} text-right`}>Last</th>
                  <th className={`${TH} text-right`}>Unrealised</th>
                  <th className={`${TH} text-right`}>Realised</th>
                </tr>
              </thead>
              <tbody>
                {p!.positions.map((r) => (
                  <tr key={r.symbol} onClick={() => onSelect(r.symbol)} className={`cursor-pointer border-t border-white/[0.03] hover:bg-white/[0.03] ${r.open ? "" : "opacity-60"}`}>
                    <td className={`${TD} font-semibold`}>{r.symbol}</td>
                    <td className={`${TD} text-right`}>{fmtNum(r.quantity, 4).replace(/\.?0+$/, "")}</td>
                    <td className={`${TD} text-right`}>{fmtPrice(r.average_cost)}</td>
                    <td className={`${TD} text-right`}>{fmtPrice(r.last_price)}</td>
                    <td className={`${TD} text-right`}>
                      <Change value={r.unrealized_pnl}>
                        {fmtPrice(r.unrealized_pnl)} {r.unrealized_pnl_pct != null && <span className="text-[9.5px]">({fmtPct(r.unrealized_pnl_pct)})</span>}
                      </Change>
                    </td>
                    <td className={`${TD} text-right`}>
                      <Change value={r.realized_pnl}>{fmtPrice(r.realized_pnl)}</Change>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : ledger.error ? (
          <ErrorState error={ledger.error} />
        ) : !ledger.data ? (
          <Loading />
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-[#0B0D12]">
              <tr>
                <th className={TH}>When</th>
                <th className={TH}>Side</th>
                <th className={TH}>Symbol</th>
                <th className={`${TH} text-right`}>Qty</th>
                <th className={`${TH} text-right`}>Price</th>
                <th className={`${TH} text-right`}>Fee</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {(ledger.data ?? []).map((t) => (
                <tr key={t.id} className="border-t border-white/[0.03]">
                  <td className={TD}>{new Date(t.executed_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className={TD} style={{ color: t.side === "buy" ? "#34D399" : "#F87171" }}>
                    {t.side}
                  </td>
                  <td className={`${TD} font-semibold`}>{t.symbol}</td>
                  <td className={`${TD} text-right`}>{t.quantity}</td>
                  <td className={`${TD} text-right`}>{fmtPrice(t.price)}</td>
                  <td className={`${TD} text-right`}>{fmtPrice(t.fee)}</td>
                  <td className="w-5 pr-1">
                    <button type="button" onClick={() => delTx.mutate(t.id)} aria-label="Delete transaction" className="text-[#4B4F5C] hover:text-[#F87171]">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <footer className="border-t border-white/[0.05] px-2 py-1 font-mono text-[9.5px] text-[#666A76]">
        Average-cost method · fees included in cost · unrealised uses delayed quotes · private to you
      </footer>
    </div>
  );
}
