"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

import { ErrorState, Loading, SourceFooter, TD, TH, retryTerminal } from "@/components/terminal/widget-kit";
import { fmtBig, fmtPrice, terminalApi } from "@/lib/terminal";

export default function InsiderWidget({ symbol }: { symbol: string }) {
  const q = useQuery({ retry: retryTerminal, queryKey: ["terminal", "insider", symbol], queryFn: () => terminalApi.insider(symbol), staleTime: 3_600_000 });
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <Loading label="Reading SEC Form 4 filings…" />;
  const d = q.data!.data;
  const buys = d.transactions.filter((t) => t.code === "P").reduce((s, t) => s + (t.value ?? 0), 0);
  const sells = d.transactions.filter((t) => t.code === "S").reduce((s, t) => s + (t.value ?? 0), 0);
  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-4 border-b border-white/[0.04] px-2 py-1 font-mono text-[10px] text-[#9A9DA8]">
        <span>{d.company}</span>
        <span className="text-[#34D399]">open-market buys ${fmtBig(buys)}</span>
        <span className="text-[#F87171]">open-market sells ${fmtBig(sells)}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {d.transactions.length === 0 ? (
          <p className="p-3 text-xs text-[#808495]">No non-derivative Form 4 transactions in the latest filings.</p>
        ) : (
          <table className="w-full min-w-[600px]">
            <thead className="sticky top-0 bg-[#0B0D12]">
              <tr>
                <th className={TH}>Date</th>
                <th className={TH}>Insider</th>
                <th className={TH}>Type</th>
                <th className={`${TH} text-right`}>Shares</th>
                <th className={`${TH} text-right`}>Price</th>
                <th className={`${TH} text-right`}>Value</th>
                <th className={`${TH} text-right`}>Owned after</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {d.transactions.map((t, i) => (
                <tr key={`${t.filing_url}-${i}`} className="border-t border-white/[0.03]">
                  <td className={TD}>{t.transaction_date ?? t.filing_date}</td>
                  <td className={`${TD} max-w-[160px] truncate`} title={`${t.owner ?? ""} ${t.title ? `(${t.title})` : ""}`}>
                    {t.owner}
                    <span className="text-[#666A76]"> {t.title ?? (t.is_director ? "Director" : t.is_ten_percent_owner ? "10% owner" : "")}</span>
                  </td>
                  <td className={TD} style={{ color: t.code === "P" ? "#34D399" : t.code === "S" ? "#F87171" : undefined }}>
                    {t.code_label}
                  </td>
                  <td className={`${TD} text-right`}>
                    {t.acquired_disposed === "D" ? "−" : "+"}
                    {fmtBig(t.shares)}
                  </td>
                  <td className={`${TD} text-right`}>{fmtPrice(t.price)}</td>
                  <td className={`${TD} text-right`}>{t.value != null ? `$${fmtBig(t.value)}` : "—"}</td>
                  <td className={`${TD} text-right text-[#808495]`}>{fmtBig(t.shares_after)}</td>
                  <td className="px-1">
                    <a href={t.filing_url} target="_blank" rel="noopener noreferrer" aria-label="Open the SEC filing" className="text-[#4B4F5C] hover:text-[#F5F5F7]">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <SourceFooter env={q.data} />
    </div>
  );
}
