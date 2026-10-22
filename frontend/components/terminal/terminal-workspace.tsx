"use client";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { useQuery } from "@tanstack/react-query";
import { Keyboard, LayoutGrid, Plus, RotateCcw, Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";

import CommandPalette from "@/components/terminal/command-palette";
import { Loading, WidgetFrame, retryTerminal } from "@/components/terminal/widget-kit";
import { terminalApi, type WidgetType } from "@/lib/terminal";
import { SHORTCUT_WIDGETS, useTerminal, WIDGET_CATALOG } from "@/store/terminal-store";

const Grid = WidthProvider(Responsive);

// Every widget is its own chunk: a workspace only downloads the widgets it shows.
type WidgetProps = { symbol: string; onSelect: (s: string) => void; watchlist: string[] };
const load = (loader: () => Promise<{ default: ComponentType<never> }>) =>
  dynamic(loader as () => Promise<{ default: ComponentType<WidgetProps> }>, { ssr: false, loading: () => <Loading /> }) as ComponentType<WidgetProps>;
const WIDGETS: Record<WidgetType, ComponentType<WidgetProps>> = {
  chart: load(() => import("./widgets/chart-widget")),
  quote: load(() => import("./widgets/quote-widget")),
  watchlist: load(() => import("./widgets/watchlist-widget")),
  news: load(() => import("./widgets/news-widget")),
  screener: load(() => import("./widgets/screener-widget")),
  heatmap: load(() => import("./widgets/heatmap-widget")),
  options: load(() => import("./widgets/options-widget")),
  crypto: load(() => import("./widgets/crypto-widget")),
  macro: load(() => import("./widgets/macro-widget")),
  holdings: load(() => import("./widgets/holdings-widget")),
  calendar: load(() => import("./widgets/calendar-widget")),
  insider: load(() => import("./widgets/insider-widget")),
  recap: load(() => import("./widgets/recap-widget")),
  tv: load(() => import("./widgets/tv-widget")),
  ai: load(() => import("./widgets/ai-widget")),
  alerts: load(() => import("./widgets/alerts-widget")),
};
// Widgets that follow the active symbol show it in their title bar.
const SYMBOL_LINKED = new Set<WidgetType>(["chart", "quote", "news", "options", "insider", "ai", "alerts", "holdings"]);

export default function TerminalWorkspace() {
  const { loaded, widgets, layout, activeSymbol, saving, saveError, load: loadWs, setActiveSymbol, setLayout, addWidget, removeWidget, resetWorkspace } = useTerminal();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const lists = useQuery({ retry: retryTerminal, queryKey: ["terminal", "watchlists"], queryFn: terminalApi.watchlists, enabled: loaded });
  const watchlist = lists.data?.[0]?.symbols ?? [];

  useEffect(() => {
    loadWs().catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load your workspace"));
  }, [loadWs]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        // On the terminal, ⌘K is symbol search: take it before the app-wide search
        // (a document-level listener) sees it, so only one palette opens.
        e.preventDefault();
        e.stopPropagation();
        setPalette((p) => !p);
        return;
      }
      if (e.altKey && !typing && /^Digit[1-9]$/.test(e.code)) {
        e.preventDefault();
        const type = SHORTCUT_WIDGETS[Number(e.code.slice(5)) - 1];
        if (type) addWidget(type);
      }
      if (e.key === "?" && !typing) setHelp((h) => !h);
    },
    [addWidget],
  );
  useEffect(() => {
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onKey]);

  const layouts = useMemo(() => ({ lg: layout }), [layout]);
  const onLayoutChange = useCallback(
    (current: Layout[], all: Record<string, Layout[]>) => {
      // Persist only the full-width (lg) arrangement; narrower breakpoints are derived.
      setLayout((all.lg ?? current).map(({ i, x, y, w, h }) => ({ i, x, y, w, h })));
    },
    [setLayout],
  );

  if (loadError) return <p className="p-6 text-sm text-[#F87171]">{loadError}</p>;
  if (!loaded) return <Loading label="Loading your workspace…" />;

  return (
    <div className="relative min-h-full bg-[#07080B] text-[#F5F5F7]">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-[#0B0D12]/95 px-2 py-1.5 backdrop-blur">
        <LayoutGrid className="h-4 w-4 text-[#8E88C7]" />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#D4D5DB]">Terminal</span>
        <button
          type="button"
          onClick={() => setPalette(true)}
          className="ml-2 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/30 px-2 py-1 text-xs text-[#808495] hover:text-[#D4D5DB]"
          aria-label="Search symbols (Ctrl+K)"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="font-mono font-semibold text-[#F5F5F7]">{activeSymbol}</span>
          <span className="hidden sm:inline">Search…</span>
          <kbd className="rounded border border-white/[0.1] px-1 font-mono text-[9.5px]">⌘K</kbd>
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            className="flex items-center gap-1 rounded-lg border border-[#8E88C7]/30 bg-[#8E88C7]/10 px-2 py-1 text-xs text-[#B7B2E6] hover:bg-[#8E88C7]/20"
            aria-expanded={menu}
          >
            <Plus className="h-3.5 w-3.5" /> Add widget
          </button>
          {menu && (
            <div className="absolute left-0 top-full z-30 mt-1 grid w-[min(92vw,420px)] grid-cols-2 gap-1 rounded-xl border border-white/[0.1] bg-[#0D0F14] p-1.5 shadow-2xl" onMouseLeave={() => setMenu(false)}>
              {(Object.keys(WIDGET_CATALOG) as WidgetType[]).map((t) => {
                const n = SHORTCUT_WIDGETS.indexOf(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      addWidget(t);
                      setMenu(false);
                    }}
                    className="rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.05]"
                  >
                    <p className="flex items-center justify-between text-xs text-[#F5F5F7]">
                      {WIDGET_CATALOG[t].title}
                      {n >= 0 && <kbd className="font-mono text-[9px] text-[#666A76]">⌥{n + 1}</kbd>}
                    </p>
                    <p className="text-[10px] text-[#808495]">{WIDGET_CATALOG[t].hint}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={`font-mono text-[10px] ${saveError ? "text-[#F87171]" : "text-[#666A76]"}`} title={saveError ?? undefined}>
            {saveError ? "layout not saved" : saving ? "saving…" : "layout saved"}
          </span>
          <button type="button" onClick={() => setHelp((h) => !h)} className="text-[#666A76] hover:text-[#D4D5DB]" aria-label="Keyboard shortcuts">
            <Keyboard className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("Reset the workspace to the default layout?")) resetWorkspace();
            }}
            className="text-[#666A76] hover:text-[#D4D5DB]"
            aria-label="Reset layout"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {help && (
        <div className="mb-2 rounded-xl border border-white/[0.06] bg-[#0B0D12] p-3 font-mono text-[11px] text-[#9A9DA8]">
          <p>
            <kbd>⌘K / Ctrl+K</kbd> search symbols or add a widget · <kbd>⌥1–⌥9</kbd> add{" "}
            {SHORTCUT_WIDGETS.map((t, i) => `${i + 1} ${WIDGET_CATALOG[t].title}`).join(", ")} · <kbd>?</kbd> toggle this help
          </p>
          <p className="mt-1">Drag a widget by its grip, resize from its corner. Click a symbol anywhere to focus every linked widget on it.</p>
        </div>
      )}

      {widgets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-24 text-center text-sm text-[#808495]">
          Your workspace is empty.
          <button type="button" onClick={() => setMenu(true)} className="rounded-lg bg-[#8E88C7] px-3 py-1.5 text-xs font-semibold text-[#0B0B10]">
            Add a widget
          </button>
        </div>
      ) : (
        <Grid
          className="terminal-grid"
          layouts={layouts}
          breakpoints={{ lg: 1100, md: 760, sm: 0 }}
          cols={{ lg: 12, md: 6, sm: 1 }}
          rowHeight={30}
          margin={[8, 8]}
          containerPadding={[0, 0]}
          draggableHandle=".widget-drag"
          onLayoutChange={onLayoutChange}
          compactType="vertical"
        >
          {widgets.map((w) => {
            const Widget = WIDGETS[w.type];
            const spec = WIDGET_CATALOG[w.type];
            return (
              <div key={w.id}>
                <WidgetFrame id={w.id} title={spec.title} subtitle={SYMBOL_LINKED.has(w.type) ? activeSymbol : undefined} onClose={() => removeWidget(w.id)}>
                  <Widget symbol={activeSymbol} onSelect={setActiveSymbol} watchlist={watchlist} />
                </WidgetFrame>
              </div>
            );
          })}
        </Grid>
      )}

      <CommandPalette open={palette} onClose={() => setPalette(false)} onSymbol={setActiveSymbol} onWidget={addWidget} />
      <p className="mt-4 text-center text-[10.5px] text-[#4B4F5C]">
        Market data is delayed and indicative, from official or published sources named on each widget. Not investment advice.
      </p>
    </div>
  );
}
