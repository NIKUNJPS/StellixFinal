"use client";

import { useCallback, useRef, useState } from "react";

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
import { streamChat } from "@/lib/llm";
import type { ChatStakes } from "@/lib/llm-types";

/**
 * Research Assistant (Batch 18) — streaming chat over SSE.
 *
 * The model badge is not decoration: the backend cost router picks a provider per
 * request (Gemini for routine chat, Claude when stakes are high), at a ~6x cost
 * difference. Showing which model actually answered keeps that choice visible to
 * the researcher rather than hidden in the audit log.
 */

const MODEL_STYLES: Record<string, string> = {
  // Keyed by prefix of the concrete model id the backend reports.
  gemini: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  claude: "bg-purple-500/15 text-purple-300 border-purple-500/30",
};

const FALLBACK_BADGE = "bg-muted text-muted-foreground border-border";

function modelBadgeClass(model: string): string {
  const key = Object.keys(MODEL_STYLES).find((k) => model.startsWith(k));
  return (key && MODEL_STYLES[key]) || FALLBACK_BADGE;
}

function modelLabel(model: string): string {
  if (model.startsWith("gemini-2.5-flash")) return "Gemini 2.5 Flash";
  if (model.startsWith("claude-sonnet")) return "Claude Sonnet";
  return model;
}

const STAKES: ChatStakes[] = ["low", "medium", "high"];

export default function ResearchAssistantPage() {
  const [input, setInput] = useState("");
  const [stakes, setStakes] = useState<ChatStakes>("low");
  const [response, setResponse] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async () => {
    const message = input.trim();
    if (!message || streaming) return;

    setStreaming(true);
    setError(null);
    setResponse("");
    setModel(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for await (const event of streamChat({ message, stakes }, controller.signal)) {
        if (event.error) {
          // A mid-stream failure: HTTP 200 was already committed, so the backend
          // reports it in-band rather than as a status code.
          setError(event.error);
          break;
        }
        // The badge appears on the first chunk (that's when the serving model is
        // first known) and stays after completion.
        if (event.model) setModel((prev) => prev ?? event.model!);
        if (event.chunk) setResponse((prev) => prev + event.chunk);
        if (event.done) break;
      }
    } catch (err) {
      // A rejected prompt (Safeguard 1) lands here as a real 400 from the backend,
      // before the stream ever opened.
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, stakes, streaming]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Research Assistant</h1>
        <p className="text-sm text-muted-foreground">
          Ask about strategy design, regimes, backtesting methodology, and risk. The
          assistant cannot forecast prices and has no authority to create or modify
          strategies — every answer is analysis for you to act on.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Ask a question
            {model && (
              <Badge variant="outline" className={modelBadgeClass(model)}>
                {modelLabel(model)}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Routine questions are answered by Gemini; marking a question high-stakes
            routes it to Claude, which costs roughly 6x more per call.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {STAKES.map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={stakes === s ? "default" : "outline"}
                disabled={streaming}
                onClick={() => setStakes(s)}
              >
                {s}
              </Button>
            ))}
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. How should position sizing adapt across volatility regimes?"
              disabled={streaming}
              maxLength={4000}
              aria-label="Question for the research assistant"
            />
            <Button type="submit" disabled={streaming || input.trim().length === 0}>
              {streaming ? "Streaming…" : "Send"}
            </Button>
            {streaming && (
              <Button type="button" variant="outline" onClick={stop}>
                Stop
              </Button>
            )}
          </form>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {(response || streaming) && (
            <div className="rounded-md border border-border bg-muted/30 p-4">
              <p
                data-testid="assistant-response"
                className={`whitespace-pre-wrap text-sm leading-relaxed ${
                  streaming ? "after:ml-0.5 after:animate-blink after:content-['|']" : ""
                }`}
              >
                {response}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
