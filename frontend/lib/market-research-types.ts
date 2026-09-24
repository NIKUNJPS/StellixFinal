/** Types mirroring backend app/schemas/market.py additions (Batch 28). */

export interface MacroSeriesPoint {
  date: string;
  value: number;
}

export type MacroSeriesStatus = "ok" | "not_configured" | "no_data" | "error";

export interface MacroSeries {
  series_id: string;
  label: string;
  group: "yield_curve" | "volatility";
  unit: string;
  status: MacroSeriesStatus;
  error: string | null;
  points: MacroSeriesPoint[];
  latest_value: number | null;
  latest_date: string | null;
}

export interface MacroResponse {
  configured: boolean;
  source: string;
  refresh_interval_seconds: number;
  data_delay_note: string;
  generated_at: string;
  series: MacroSeries[];
}

export type RowStatus = "ok" | "unavailable";

export interface ScreenerRow {
  symbol: string;
  name: string;
  sector: string;
  last_price: number | null;
  previous_close: number | null;
  change: number | null;
  change_pct: number | null;
  volume: number | null;
  dollar_volume: number | null;
  session_date: string | null;
  fetched_at: string | null;
  status: RowStatus;
  unavailable_reason: string | null;
}

export interface ScreenerResponse {
  provider: string;
  universe_size: number;
  universe_note: string;
  refresh_interval_seconds: number;
  data_delay_note: string;
  generated_at: string;
  rows: ScreenerRow[];
}

export interface HeatmapSymbol {
  symbol: string;
  name: string;
  change_pct: number | null;
  dollar_volume: number | null;
  status: RowStatus;
}

export interface HeatmapSector {
  sector: string;
  total_dollar_volume: number | null;
  avg_change_pct: number | null;
  symbol_count: number;
  available_count: number;
  symbols: HeatmapSymbol[];
}

export interface HeatmapResponse {
  universe_size: number;
  universe_note: string;
  generated_at: string;
  sectors: HeatmapSector[];
}

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorPoint {
  timestamp: string;
  value: number;
}

export interface ChartIndicators {
  sma_20: IndicatorPoint[];
  sma_50: IndicatorPoint[];
  ema_12: IndicatorPoint[];
  ema_26: IndicatorPoint[];
  rsi_14: IndicatorPoint[];
  macd: IndicatorPoint[];
  macd_signal: IndicatorPoint[];
  bollinger_upper: IndicatorPoint[];
  bollinger_lower: IndicatorPoint[];
  vwap_20: IndicatorPoint[];
}

export interface ChartResponse {
  symbol: string;
  interval: string;
  range: string;
  provider: string;
  data_delay_note: string;
  candles: Candle[];
  indicators: ChartIndicators;
}
