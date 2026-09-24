"use client";

import { LineChart as LineChartIcon, TrendingUp } from "lucide-react";
import { useState } from "react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ChartPanel } from "@/components/market-research/chart-panel";
import { MacroPanel } from "@/components/market-research/macro-panel";
import { ScreenerTable } from "@/components/market-research/screener-table";
import { SectorHeatmap } from "@/components/market-research/sector-heatmap";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function MarketResearchPage() {
  const [chartSymbol, setChartSymbol] = useState("SPY");
  const [tab, setTab] = useState("macro");

  function openChartFor(symbol: string) {
    setChartSymbol(symbol);
    setTab("chart");
  }

  return (
    <DashboardShell>
      <div className="relative min-h-full bg-[#07080B] px-1 py-1 text-[#F5F5F7]">
        <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-[#5C568E]/10 blur-[120px]" />
        <div className="pointer-events-none absolute top-40 right-10 h-72 w-72 rounded-full bg-[#38BDF8]/5 blur-[100px]" />

        <div className="mb-8">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#38BDF8] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#38BDF8]" />
            </span>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#808495]">
              Market Research • Research Mode
            </p>
          </div>
          <h1 className="mt-1.5 flex items-center gap-2 text-3xl font-extrabold tracking-tight text-[#F5F5F7]">
            <TrendingUp className="h-7 w-7 text-[#38BDF8]" /> Market Research
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-[#9A9DA8]">
            Macro indicators, a bounded equity screener, sector heatmap, and candlestick charting — every widget
            labeled with its real source and refresh cadence, never presented as real-time or full-market.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="macro">Macro</TabsTrigger>
            <TabsTrigger value="screener">Screener</TabsTrigger>
            <TabsTrigger value="heatmap">Sector Heatmap</TabsTrigger>
            <TabsTrigger value="chart">
              <span className="inline-flex items-center gap-1">
                <LineChartIcon className="h-3.5 w-3.5" /> Chart
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="macro" className="mt-5">
            <MacroPanel />
          </TabsContent>
          <TabsContent value="screener" className="mt-5">
            <ScreenerTable onSelectSymbol={openChartFor} />
          </TabsContent>
          <TabsContent value="heatmap" className="mt-5">
            <SectorHeatmap />
          </TabsContent>
          <TabsContent value="chart" className="mt-5">
            <ChartPanel initialSymbol={chartSymbol} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}
