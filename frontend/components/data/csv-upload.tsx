"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, UploadCloud } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { confirmCsv, validateCsv } from "@/lib/data";
import {
  CSV_FIELDS,
  INTERVALS,
  type CsvColumnMapping,
  type CsvConfirmResult,
  type CsvField,
  type CsvValidationReport,
} from "@/lib/data-types";
import { cn } from "@/lib/utils";

type Step = "upload" | "report" | "success";

const AUTO = ""; // "(auto-detect)" sentinel for a mapping dropdown

// Client-side best-guess so the mapping dropdowns pre-select sensible columns; the
// backend re-detects authoritatively for anything left on auto.
const FIELD_HINTS: Record<CsvField, string[]> = {
  date: ["date", "datetime", "timestamp", "time", "dt", "day"],
  open: ["open", "o"],
  high: ["high", "h"],
  low: ["low", "l"],
  close: ["close", "c", "adj close", "adj_close", "adjclose", "last"],
  volume: ["volume", "vol", "v"],
};

function autoMap(headers: string[]): CsvColumnMapping {
  const lower = new Map(headers.map((h) => [h.toLowerCase().trim(), h]));
  const mapping: CsvColumnMapping = {};
  for (const field of CSV_FIELDS) {
    for (const hint of FIELD_HINTS[field]) {
      const hit = lower.get(hint);
      if (hit) {
        mapping[field] = hit;
        break;
      }
    }
  }
  return mapping;
}

function parseHeaderLine(text: string): string[] {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";
  return firstLine.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function CsvUpload() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [symbol, setSymbol] = useState("");
  const [interval, setInterval_] = useState("1d");
  const [mapping, setMapping] = useState<CsvColumnMapping>({});
  const [dragActive, setDragActive] = useState(false);

  const [report, setReport] = useState<CsvValidationReport | null>(null);
  const [result, setResult] = useState<CsvConfirmResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFileChosen(f: File) {
    setFile(f);
    setError(null);
    const text = await f.text();
    const cols = parseHeaderLine(text);
    setHeaders(cols);
    setMapping(autoMap(cols));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void onFileChosen(f);
  }

  async function onValidate() {
    if (!file || !symbol.trim()) {
      setError("Choose a file and enter a symbol first.");
      return;
    }
    setValidating(true);
    setError(null);
    try {
      const { report: rep } = await validateCsv({
        file,
        symbol: symbol.trim().toUpperCase(),
        interval,
        mapping,
      });
      setReport(rep);
      setStep("report");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  }

  async function onImport() {
    if (!report?.upload_id) return;
    setImporting(true);
    setError(null);
    try {
      const res = await confirmCsv(report.upload_id);
      setResult(res);
      setStep("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setStep("upload");
    setFile(null);
    setHeaders([]);
    setMapping({});
    setReport(null);
    setResult(null);
    setError(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUp className="h-5 w-5 text-stellix-highlight" />
          Upload proprietary OHLCV (CSV)
        </CardTitle>
        <CardDescription>
          Import bars from your own data (not on public APIs). Validated before anything
          is written — the same checks the provider pipeline uses.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {error && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {step === "upload" && (
          <div className="flex flex-col gap-5">
            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
                dragActive
                  ? "border-stellix-highlight bg-stellix-highlight/5"
                  : "border-border hover:border-stellix-highlight/50",
              )}
              data-testid="csv-dropzone"
            >
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
              {file ? (
                <p className="text-sm">
                  <span className="font-medium">{file.name}</span>{" "}
                  <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Drag &amp; drop a .csv / .tsv, or click to choose
                </p>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.tsv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFileChosen(f);
                }}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Symbol</Label>
                <Input
                  placeholder="AAPL"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Interval</Label>
                <select
                  value={interval}
                  onChange={(e) => setInterval_(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {INTERVALS.map((iv) => (
                    <option key={iv} value={iv}>{iv}</option>
                  ))}
                </select>
              </div>
            </div>

            {headers.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label>Column mapping</Label>
                <p className="text-xs text-muted-foreground">
                  Auto-detected from the header — adjust any that are wrong.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {CSV_FIELDS.map((field) => (
                    <div key={field} className="flex flex-col gap-1">
                      <span className="text-xs font-medium capitalize text-muted-foreground">
                        {field}
                      </span>
                      <select
                        value={mapping[field] ?? AUTO}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [field]: e.target.value || undefined }))
                        }
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value={AUTO}>(auto-detect)</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={onValidate} disabled={validating || !file} className="sm:w-fit">
              {validating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validating…
                </>
              ) : (
                "Validate"
              )}
            </Button>
          </div>
        )}

        {step === "report" && report && (
          <div className="flex flex-col gap-5">
            {/* Summary */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {report.error_count > 0 ? (
                <Badge variant="destructive">{report.error_count} error rows</Badge>
              ) : (
                <Badge variant="success">{fmt(report.valid_rows)} valid rows</Badge>
              )}
              {report.warning_count > 0 && (
                <Badge variant="secondary">{report.warning_count} warnings</Badge>
              )}
              {report.date_range.start && (
                <span className="text-muted-foreground">
                  {report.date_range.start.slice(0, 10)} → {report.date_range.end?.slice(0, 10)}
                </span>
              )}
            </div>

            {report.errors.length > 0 && (
              <div className="rounded-md border border-destructive/40">
                <div className="border-b border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  Errors (first {report.errors.length}) — fix these and re-upload
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead className="w-24">Column</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.errors.map((err, i) => (
                        <TableRow key={i}>
                          <TableCell>{err.row}</TableCell>
                          <TableCell className="capitalize">{err.column}</TableCell>
                          <TableCell className="text-muted-foreground">{err.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {report.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-500">
                  <AlertTriangle className="h-4 w-4" /> Warnings (import can still proceed)
                </div>
                <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                  {report.warnings.map((w, i) => (
                    <li key={i}>
                      {w.message} ({w.count})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Preview */}
            <div className="flex flex-col gap-2">
              <Label>Preview (first {report.preview.length} rows)</Label>
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                      <TableHead className="text-right">High</TableHead>
                      <TableHead className="text-right">Low</TableHead>
                      <TableHead className="text-right">Close</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.preview.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {r.timestamp?.slice(0, 19).replace("T", " ") ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">{r.open ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.high ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.low ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.close ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.volume ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => setStep("upload")}>
                {report.error_count > 0 ? "Fix & re-upload" : "Back"}
              </Button>
              {report.upload_id && (
                <Button onClick={onImport} disabled={importing}>
                  {importing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…
                    </>
                  ) : (
                    `Import ${fmt(report.valid_rows)} rows`
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {step === "success" && result && (
          <div className="flex flex-col items-start gap-4 rounded-lg border border-emerald-600/40 bg-emerald-600/[0.06] p-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              <p className="text-lg font-semibold">
                {fmt(result.inserted)} bars imported for {result.symbol} ({result.interval})
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {result.features_computed > 0
                ? `${fmt(result.features_computed)} feature rows computed. `
                : "Too few bars to compute technical features yet. "}
              Your data is ready for regime detection.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/regimes"
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Go to Regime Monitor →
              </Link>
              <Button variant="outline" onClick={reset}>
                Upload another
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
