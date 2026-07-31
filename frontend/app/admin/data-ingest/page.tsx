"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
import { CsvUpload } from "@/components/data/csv-upload";
import { enqueueIngest, getJobStatus, getMarketSeries } from "@/lib/data";
import { INTERVALS, PROVIDERS, type JobStatus, type MarketBar } from "@/lib/data-types";

const TERMINAL = new Set(["done", "failed"]);

export default function DataIngestPage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2024-06-01");
  const [interval, setInterval_] = useState<string>("1d");
  const [provider, setProvider] = useState<string>("yfinance");

  const [job, setJob] = useState<JobStatus | null>(null);
  const [points, setPoints] = useState<MarketBar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
  };
  useEffect(() => stopPolling, []);

  const loadChart = useCallback(async (sym: string) => {
    try {
      const series = await getMarketSeries(sym);
      setPoints(series.points);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chart");
    }
  }, []);

  const poll = useCallback(
    async (jobId: string, sym: string) => {
      try {
        const status = await getJobStatus(jobId);
        setJob(status);
        if (TERMINAL.has(status.status)) {
          stopPolling();
          if (status.status === "done") await loadChart(sym);
          return;
        }
        pollRef.current = setTimeout(() => poll(jobId, sym), 2000);
      } catch (e) {
        stopPolling();
        setError(e instanceof Error ? e.message : "Polling failed");
      }
    },
    [loadChart],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPoints(null);
    setJob(null);
    setSubmitting(true);
    stopPolling();
    try {
      const enqueued = await enqueueIngest({
        symbol,
        start_date: startDate,
        end_date: endDate,
        interval,
        provider,
      });
      poll(enqueued.job_id, symbol.trim().toUpperCase());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start ingestion");
    } finally {
      setSubmitting(false);
    }
  }

  const chartData =
    points?.map((p) => ({ date: p.timestamp.slice(0, 10), close: p.close })) ?? [];

  return (
    <div className="mx-auto w-full flex max-w-3xl flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Data Ingest — internal test harness</CardTitle>
          <CardDescription>
            Ingest OHLCV via the provider abstraction, watch the async job, then plot
            the closes. (A real UI lands in Batch 12.)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Symbol</Label>
              <Input name="symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Start date</Label>
              <Input name="start_date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>End date</Label>
              <Input name="end_date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Interval</Label>
              <select
                name="interval"
                value={interval}
                onChange={(e) => setInterval_(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {INTERVALS.map((iv) => (
                  <option key={iv} value={iv}>{iv}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Provider</Label>
              <select
                name="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" data-testid="ingest-submit" disabled={submitting} className="w-full">
                {submitting ? "Starting…" : "Ingest"}
              </Button>
            </div>
          </form>

          {error && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {job && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-4 py-3 text-sm">
              <Badge variant={job.status === "done" ? "success" : job.status === "failed" ? "destructive" : "secondary"}>
                {job.status}
              </Badge>
              <span className="text-muted-foreground">
                rows: {job.rows_ingested} · features: {job.features_computed}
                {job.warnings.length > 0 && ` · warnings: ${job.warnings.length}`}
              </span>
              {job.error && <span className="text-destructive">{job.error}</span>}
            </div>
          )}

          {chartData.length > 0 && (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={32} />
                  <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} width={56} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke="var(--stellix-highlight)"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <CsvUpload />
    </div>
  );
}
