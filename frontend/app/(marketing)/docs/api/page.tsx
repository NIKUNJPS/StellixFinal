"use client";

import Link from "next/link";
import Script from "next/script";
import { useRef, useState } from "react";

import { API_BASE_URL } from "@/lib/api";

// Redoc is loaded from its CDN bundle (no npm dependency added). It renders the
// PUBLIC OpenAPI schema — /superadmin/* is excluded server-side
// (include_in_schema=False), so the internal control plane never appears here.
const REDOC_CDN = "https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js";

declare global {
  interface Window {
    Redoc?: { init: (specUrl: string, options: unknown, element: HTMLElement | null) => void };
  }
}

export default function ApiReferencePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  function initRedoc() {
    if (!window.Redoc || !containerRef.current) {
      setFailed(true);
      return;
    }
    window.Redoc.init(
      `${API_BASE_URL}/openapi.json`,
      {
        // Theme matches the marketing site's real tokens: white surface, the
        // #0066FF electric-blue accent (globals.css .marketing --accent).
        theme: {
          colors: { primary: { main: "#0066FF" } },
          typography: {
            fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
            headings: { fontFamily: "var(--font-display, Georgia, serif)" },
            code: { fontFamily: "var(--font-mono, ui-monospace, monospace)" },
          },
          sidebar: { backgroundColor: "#F8FAFC" },
        },
        hideDownloadButton: false,
        expandResponses: "200,201",
      },
      containerRef.current,
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#0A0F1E]">
      <div className="container flex items-center justify-between py-6">
        <Link href="/docs" className="text-sm font-medium text-[#0066FF] hover:underline">
          ← Back to docs
        </Link>
        <a
          href={`${API_BASE_URL}/openapi.json`}
          className="text-sm text-[#64748B] hover:text-[#0A0F1E]"
          target="_blank"
          rel="noreferrer"
        >
          Raw OpenAPI JSON
        </a>
      </div>

      {failed && (
        <div className="container pb-10">
          <p className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-sm text-[#64748B]">
            The interactive reference could not load (the API or the Redoc bundle is
            unreachable). You can still fetch the schema directly at{" "}
            <a className="font-mono text-xs text-[#0066FF]" href={`${API_BASE_URL}/openapi.json`}>
              {API_BASE_URL}/openapi.json
            </a>
            , or read the concept guides on the{" "}
            <Link href="/docs" className="text-[#0066FF] hover:underline">
              docs page
            </Link>
            .
          </p>
        </div>
      )}

      <div ref={containerRef} />

      <Script src={REDOC_CDN} strategy="afterInteractive" onLoad={initRedoc} onError={() => setFailed(true)} />
    </div>
  );
}
