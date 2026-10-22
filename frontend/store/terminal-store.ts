"use client";

import { create } from "zustand";

import { terminalApi, type LayoutItem, type WidgetInstance, type WidgetType, type Workspace } from "@/lib/terminal";

/** Default size and title of each widget type when added to the grid. */
export const WIDGET_CATALOG: Record<WidgetType, { title: string; w: number; h: number; hint: string }> = {
  chart: { title: "Chart", w: 8, h: 11, hint: "Candles, bars, line, area · 1D to MAX · indicators" },
  quote: { title: "Quote", w: 4, h: 11, hint: "Bid/ask, OHLC, fundamentals, short volume" },
  watchlist: { title: "Watchlist", w: 4, h: 9, hint: "Your symbols with live changes" },
  news: { title: "News", w: 4, h: 9, hint: "Headlines for the active symbol or the market" },
  screener: { title: "Screener", w: 8, h: 10, hint: "Filter and sort the tracked universe" },
  heatmap: { title: "Heatmap", w: 12, h: 10, hint: "Sectors sized by market cap" },
  options: { title: "Options", w: 8, h: 12, hint: "Chain with Black-Scholes Greeks" },
  crypto: { title: "Crypto", w: 6, h: 10, hint: "Board, candles and order book" },
  macro: { title: "Macro", w: 4, h: 9, hint: "Rates, FX, commodities, ECB" },
  holdings: { title: "Holdings", w: 6, h: 11, hint: "Transactions, average cost, P&L" },
  calendar: { title: "Calendar", w: 6, h: 10, hint: "Economic releases and earnings" },
  insider: { title: "Insiders", w: 6, h: 10, hint: "SEC Form 4 transactions" },
  recap: { title: "Market recap", w: 6, h: 11, hint: "Movers, sectors, headlines" },
  tv: { title: "Live TV", w: 6, h: 9, hint: "Official broadcaster streams" },
  ai: { title: "AI assistant", w: 4, h: 11, hint: "Ask about the active symbol" },
  alerts: { title: "Price alerts", w: 4, h: 9, hint: "Notify when a level is crossed" },
};

/** ⌥1–⌥9 add these widget types, in this order. */
export const SHORTCUT_WIDGETS: WidgetType[] = ["chart", "quote", "watchlist", "news", "options", "heatmap", "crypto", "holdings", "ai"];

interface TerminalState {
  loaded: boolean;
  saving: boolean;
  saveError: string | null;
  widgets: WidgetInstance[];
  layout: LayoutItem[];
  activeSymbol: string;
  load: () => Promise<void>;
  setActiveSymbol: (symbol: string) => void;
  setLayout: (layout: LayoutItem[]) => void;
  addWidget: (type: WidgetType) => void;
  removeWidget: (id: string) => void;
  resetWorkspace: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function sameLayout(a: LayoutItem[], b: LayoutItem[]): boolean {
  if (a.length !== b.length) return false;
  const key = (l: LayoutItem) => `${l.i}:${l.x}:${l.y}:${l.w}:${l.h}`;
  const as = new Set(a.map(key));
  return b.every((l) => as.has(key(l)));
}

export const useTerminal = create<TerminalState>((set, get) => {
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const { widgets, layout, activeSymbol } = get();
      set({ saving: true });
      try {
        await terminalApi.saveWorkspace({ widgets, layout, active_symbol: activeSymbol });
        set({ saving: false, saveError: null });
      } catch (e) {
        set({ saving: false, saveError: e instanceof Error ? e.message : "Could not save the layout" });
      }
    }, 800);
  };

  return {
    loaded: false,
    saving: false,
    saveError: null,
    widgets: [],
    layout: [],
    activeSymbol: "SPY",

    load: async () => {
      const ws: Workspace = await terminalApi.workspace();
      set({ widgets: ws.widgets, layout: ws.layout, activeSymbol: ws.active_symbol, loaded: true });
    },

    setActiveSymbol: (symbol) => {
      const s = symbol.trim().toUpperCase();
      if (!s || s === get().activeSymbol) return;
      set({ activeSymbol: s });
      scheduleSave();
    },

    setLayout: (layout) => {
      const clean = layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
      if (sameLayout(clean, get().layout)) return;
      set({ layout: clean });
      scheduleSave();
    },

    addWidget: (type) => {
      const spec = WIDGET_CATALOG[type];
      const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
      const bottom = get().layout.reduce((m, l) => Math.max(m, l.y + l.h), 0);
      set((s) => ({
        widgets: [...s.widgets, { id, type, config: {} }],
        layout: [...s.layout, { i: id, x: 0, y: bottom, w: spec.w, h: spec.h }],
      }));
      scheduleSave();
      // Bring the new widget into view once the grid has rendered it.
      setTimeout(() => document.getElementById(`widget-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    },

    removeWidget: (id) => {
      set((s) => ({ widgets: s.widgets.filter((w) => w.id !== id), layout: s.layout.filter((l) => l.i !== id) }));
      scheduleSave();
    },

    resetWorkspace: () => {
      const defaults: WidgetType[] = ["chart", "quote", "watchlist", "news", "macro", "heatmap"];
      const widgets = defaults.map((type) => ({ id: `${type}-1`, type, config: {} }));
      const layout: LayoutItem[] = [
        { i: "chart-1", x: 0, y: 0, w: 8, h: 11 },
        { i: "quote-1", x: 8, y: 0, w: 4, h: 11 },
        { i: "watchlist-1", x: 0, y: 11, w: 4, h: 9 },
        { i: "news-1", x: 4, y: 11, w: 4, h: 9 },
        { i: "macro-1", x: 8, y: 11, w: 4, h: 9 },
        { i: "heatmap-1", x: 0, y: 20, w: 12, h: 10 },
      ];
      set({ widgets, layout });
      scheduleSave();
    },
  };
});
