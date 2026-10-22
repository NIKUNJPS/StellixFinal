"use client";

import Link from "next/link";
import Script from "next/script";
import { useRef, useState } from "react";
import { ArrowLeft, FileJson } from "lucide-react";

import { Container, Display, Eyebrow, Lede } from "@/components/marketing/site";
import { API_BASE_URL } from "@/lib/api";

const REDOC_CDN = "https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js";

declare global {
  interface Window {
    Redoc?: {
      init: (specUrl: string, options: unknown, element: HTMLElement | null) => void;
    };
  }
}

// Redoc themed to the public site's light "paper & ink" palette. The right
// (sample) panel stays ink-dark for code legibility.
const REDOC_THEME = {
  colors: {
    tonalOffset: 0.2,
    primary: { main: "#4B3FD1" },
    success: { main: "#0F7A4A" },
    warning: { main: "#8A5300" },
    error: { main: "#C2362B" },
    text: { primary: "#0E1220", secondary: "#3D4356" },
    border: { dark: "#CFCBC0", light: "#E4E1D9" },
    http: {
      get: "#0F7A4A",
      post: "#4B3FD1",
      put: "#8A5300",
      delete: "#C2362B",
      patch: "#8A5300",
      options: "#2F86D6",
      head: "#5E6679",
    },
  },
  typography: {
    fontSize: "15px",
    lineHeight: "1.7em",
    fontFamily: "var(--font-site-sans), ui-sans-serif, system-ui, sans-serif",
    headings: { fontFamily: "var(--font-manrope), ui-sans-serif, system-ui, sans-serif", fontWeight: "700", lineHeight: "1.25em" },
    links: { color: "#4B3FD1", visited: "#4B3FD1", hover: "#3A2FB8" },
    code: {
      fontSize: "13px",
      fontFamily: "var(--font-jetbrains), ui-monospace, SFMono-Regular, Menlo, monospace",
      color: "#3A2FB8",
      backgroundColor: "#EFEDFF",
    },
  },
  sidebar: { width: "280px", backgroundColor: "#F1EFEA", textColor: "#3D4356", activeTextColor: "#4B3FD1" },
  rightPanel: { backgroundColor: "#141A2B", textColor: "#F5F4EF" },
  schema: { nestedBackground: "#F8F7F4", linesColor: "#CFCBC0" },
  shape: { borderRadius: "10px" },
};

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
        theme: REDOC_THEME,
        expandResponses: "200,201",
        pathInMiddlePanel: true,
        requiredPropsFirst: true,
        jsonSampleExpandLevel: 2,
        scrollYOffset: 72,
      },
      containerRef.current,
    );
  }

  return (
    <>
      <section className="border-b border-line">
        <Container className="py-12 sm:py-16">
          <Link href="/docs" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-2 hover:text-brand">
            <ArrowLeft className="h-4 w-4" /> Documentation
          </Link>
          <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <Eyebrow>Developers</Eyebrow>
              <Display as="h1" size="lg" className="mt-5">
                API <em>reference</em>
              </Display>
              <Lede className="mt-5">
                Every endpoint, parameter, response and schema — rendered directly from the running service&apos;s OpenAPI document.
              </Lede>
            </div>
            <a
              href={`${API_BASE_URL}/openapi.json`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-paper-raised px-4 py-2 text-[14px] font-semibold text-ink hover:border-ink"
            >
              <FileJson className="h-4 w-4 text-brand" /> Raw OpenAPI JSON
            </a>
          </div>
        </Container>
      </section>

      {failed && (
        <Container className="py-10">
          <div className="rounded-2xl border border-line bg-paper-sunken p-6">
            <p className="text-[15px] leading-relaxed text-ink-2">
              The interactive reference couldn&apos;t load. Make sure the backend is running, or open the schema directly:
            </p>
            <a href={`${API_BASE_URL}/openapi.json`} target="_blank" rel="noreferrer" className="mt-3 inline-block font-code text-[14px] text-brand hover:underline">
              {API_BASE_URL}/openapi.json
            </a>
          </div>
        </Container>
      )}

      <div className="bg-paper-raised">
        <div ref={containerRef} />
      </div>

      <Script src={REDOC_CDN} strategy="afterInteractive" onLoad={initRedoc} onError={() => setFailed(true)} />
    </>
  );
}
