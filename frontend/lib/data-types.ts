/** Types mirroring backend app/schemas/data.py (identical field names). */

export type IngestionStatus = "pending" | "running" | "done" | "failed";

export interface IngestRequestInput {
  symbol: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  interval: string;
  provider: string;
}

export interface IngestEnqueued {
  job_id: string;
  status: IngestionStatus;
  message: string;
}

export interface JobStatus {
  job_id: string;
  symbol: string;
  status: IngestionStatus;
  rows_ingested: number;
  features_computed: number;
  warnings: Array<Record<string, unknown>>;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketSeries {
  symbol: string;
  count: number;
  points: MarketBar[];
}

export const INTERVALS = ["1d", "1h", "1wk", "1mo", "5m", "15m", "30m", "1m"] as const;
export const PROVIDERS = ["yfinance", "alphavantage"] as const;

// --- CSV upload (Batch 21) -------------------------------------------------- //
export const CSV_FIELDS = ["date", "open", "high", "low", "close", "volume"] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

export interface CsvValidationError {
  row: number;
  column: string;
  message: string;
}

export interface CsvValidationWarning {
  type: string;
  count: number;
  message: string;
}

export interface CsvPreviewRow {
  timestamp: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface CsvValidationReport {
  total_rows: number;
  valid_rows: number;
  error_count: number;
  warning_count: number;
  errors: CsvValidationError[];
  warnings: CsvValidationWarning[];
  date_range: { start: string | null; end: string | null };
  preview: CsvPreviewRow[];
  upload_id?: string; // present only when there are no blocking errors
}

export interface CsvConfirmResult {
  inserted: number;
  features_computed: number;
  symbol: string;
  interval: string;
  date_range: { start: string | null; end: string | null };
}

export type CsvColumnMapping = Partial<Record<CsvField, string>>;
