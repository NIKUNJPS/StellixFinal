import { apiFetch, errorMessage } from "@/lib/api-client";
import type {
  CsvColumnMapping,
  CsvConfirmResult,
  CsvValidationReport,
  IngestEnqueued,
  IngestRequestInput,
  JobStatus,
  MarketSeries,
} from "@/lib/data-types";
import { CSV_FIELDS } from "@/lib/data-types";

export async function enqueueIngest(input: IngestRequestInput): Promise<IngestEnqueued> {
  const res = await apiFetch("/data/ingest", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to enqueue ingestion"));
  return (await res.json()) as IngestEnqueued;
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await apiFetch(`/data/ingest/${jobId}/status`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to fetch job status"));
  return (await res.json()) as JobStatus;
}

export async function getMarketSeries(symbol: string): Promise<MarketSeries> {
  const res = await apiFetch(`/data/market/${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to fetch market data"));
  return (await res.json()) as MarketSeries;
}

// --- CSV upload (Batch 21) -------------------------------------------------- //
export interface CsvValidateResult {
  ok: boolean; // true => clean (has upload_id); false => blocking errors
  report: CsvValidationReport;
}

/**
 * Validate an OHLCV CSV without importing. Returns the report on both the clean
 * (200) and blocking-error (422 with a report body) paths; only genuinely malformed
 * requests (bad interval, unmappable columns, oversized file) throw.
 */
export async function validateCsv(input: {
  file: File;
  symbol: string;
  interval: string;
  mapping?: CsvColumnMapping;
}): Promise<CsvValidateResult> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("symbol", input.symbol);
  form.append("interval", input.interval);
  for (const field of CSV_FIELDS) {
    const col = input.mapping?.[field];
    if (col) form.append(`${field}_column`, col);
  }

  const res = await apiFetch("/data/upload-csv", { method: "POST", body: form });
  const data = (await res.json().catch(() => null)) as unknown;

  const isReport = !!data && typeof data === "object" && "error_count" in (data as object);
  if (res.status === 200 && isReport) {
    return { ok: true, report: data as CsvValidationReport };
  }
  if (res.status === 422 && isReport) {
    return { ok: false, report: data as CsvValidationReport };
  }
  // Non-report failure (unmapped columns, bad interval, too large, parse error).
  const detail = (data as { detail?: unknown } | null)?.detail;
  throw new Error(typeof detail === "string" ? detail : "CSV validation failed");
}

export async function confirmCsv(uploadId: string): Promise<CsvConfirmResult> {
  const res = await apiFetch("/data/upload-csv/confirm", {
    method: "POST",
    body: JSON.stringify({ upload_id: uploadId }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to import CSV"));
  return (await res.json()) as CsvConfirmResult;
}
