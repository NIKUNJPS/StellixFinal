"use client";

import Link from "next/link";
import Script from "next/script";
import { useRef, useState } from "react";

import { API_BASE_URL } from "@/lib/api";

const REDOC_CDN =
  "https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js";

declare global {
  interface Window {
    Redoc?: {
      init: (
        specUrl: string,
        options: unknown,
        element: HTMLElement | null,
      ) => void;
    };
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
        theme: {
          colors: {
            tonalOffset: 0.2,

            primary: {
              main: "#8B7CFF",
            },

            success: {
              main: "#61D9A5",
            },

            warning: {
              main: "#F4C95D",
            },

            error: {
              main: "#FF6B7A",
            },

            text: {
              primary: "#F5F5F7",
              secondary: "#9CA3AF",
            },

            border: {
              dark: "#252530",
              light: "#1C1C25",
            },

            http: {
              get: "#61D9A5",
              post: "#8B7CFF",
              put: "#F4C95D",
              delete: "#FF6B7A",
              patch: "#A79CFF",
              options: "#6EA8FF",
              head: "#9CA3AF",
            },
          },

          typography: {
            fontSize: "15px",
            lineHeight: "1.7em",

            fontFamily:
              "var(--font-sans), Inter, ui-sans-serif, system-ui, sans-serif",

            headings: {
              fontFamily:
                "var(--font-display), Inter, ui-sans-serif, system-ui, sans-serif",

              fontWeight: "600",

              lineHeight: "1.25em",

              color: "#F5F5F7",
            },

            links: {
              color: "#A79CFF",
              visited: "#A79CFF",
              hover: "#C0B8FF",
            },

            code: {
              fontSize: "13px",

              fontFamily:
                "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace",

              color: "#C9C4FF",

              backgroundColor: "#111119",
            },
          },

          sidebar: {
            width: "300px",

            backgroundColor: "#0B0B12",

            textColor: "#9CA3AF",

            activeTextColor: "#FFFFFF",
          },

          rightPanel: {
            backgroundColor: "#0D0D15",

            textColor: "#E5E7EB",
          },

          spacing: {
            unit: 6,

            sectionHorizontal: 48,

            sectionVertical: 36,
          },

          schema: {
            nestedBackground: "#111119",

            linesColor: "#2A2A36",

            labelsTextSize: "0.8em",

            nestingSpacing: "1em",
          },

          shape: {
            borderRadius: "10px",
          },
        },

        hideDownloadButton: false,

        expandResponses: "200,201",

        pathInMiddlePanel: true,

        requiredPropsFirst: true,

        sortPropsAlphabetically: false,

        hideHostname: false,

        jsonSampleExpandLevel: 2,

        nativeScrollbars: false,

        scrollYOffset: 100,
      },
      containerRef.current,
    );
  }

  return (
    <div className="min-h-screen bg-[#07070B] text-white">
      {/* TOP BAR */}

      <div className="border-b border-white/[0.08] bg-[#07070B]">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-7 sm:px-10 lg:px-14">
          <Link
            href="/docs"
            className="text-[15px] font-medium text-white/60 transition-colors hover:text-[#A79CFF]"
          >
            ← Back to Documentation
          </Link>

          <a
            href={`${API_BASE_URL}/openapi.json`}
            target="_blank"
            rel="noreferrer"
            className="text-[14px] text-white/45 transition-colors hover:text-white"
          >
            View Raw OpenAPI JSON
          </a>
        </div>
      </div>

      {/* HEADER */}

      <section className="border-b border-white/[0.07]">
        <div className="mx-auto max-w-[1600px] px-6 py-16 sm:px-10 lg:px-14 lg:py-20">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#A79CFF]">
            Developers
          </p>

          <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">
            API Reference
          </h1>

          <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-white/55">
            Complete reference for the Stellix Labs public API. Explore
            endpoints, request parameters, responses, and schemas generated
            directly from the running service.
          </p>
        </div>
      </section>

      {/* ERROR */}

      {failed && (
        <div className="mx-auto max-w-[1600px] px-6 py-10 sm:px-10 lg:px-14">
          <div className="border border-[#8B7CFF]/20 bg-[#8B7CFF]/[0.05] p-6">
            <p className="text-[15px] leading-relaxed text-white/60">
              The interactive API reference could not load. You can still
              access the OpenAPI schema directly.
            </p>

            <a
              href={`${API_BASE_URL}/openapi.json`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block font-mono text-sm text-[#A79CFF] hover:text-white"
            >
              {API_BASE_URL}/openapi.json
            </a>
          </div>
        </div>
      )}

      {/* REDOC */}

      <div className="stellix-redoc">
        <div ref={containerRef} />
      </div>

      <Script
        src={REDOC_CDN}
        strategy="afterInteractive"
        onLoad={initRedoc}
        onError={() => setFailed(true)}
      />

      {/* REDOC DARK THEME OVERRIDES */}

      <style jsx global>{`
        .stellix-redoc {
          background: #07070b;
        }

        .stellix-redoc .redoc-wrap {
          background: #07070b !important;
        }

        /* LEFT SIDEBAR */

        .stellix-redoc .menu-content {
          background: #0b0b12 !important;
          border-right: 1px solid rgba(255, 255, 255, 0.07) !important;
        }

        .stellix-redoc .menu-content label,
        .stellix-redoc .menu-content span,
        .stellix-redoc .menu-content a {
          color: rgba(255, 255, 255, 0.58) !important;
        }

        .stellix-redoc .menu-content a:hover,
        .stellix-redoc .menu-content a.active {
          color: #a79cff !important;
        }

        /* MIDDLE CONTENT */

        .stellix-redoc .api-content {
          background: #07070b !important;
        }

        .stellix-redoc h1,
        .stellix-redoc h2,
        .stellix-redoc h3,
        .stellix-redoc h4,
        .stellix-redoc h5 {
          color: #f5f5f7 !important;
        }

        .stellix-redoc p,
        .stellix-redoc li {
          color: rgba(255, 255, 255, 0.58) !important;
        }

        /* API ENDPOINT ROWS */

        .stellix-redoc [role="button"] {
          color: #e5e7eb !important;
        }

        /* Prevent nearly-black text */

        .stellix-redoc span,
        .stellix-redoc div {
          text-shadow: none;
        }

        /* HTTP PATH TEXT */

        .stellix-redoc code {
          color: #c9c4ff !important;
          background: #111119 !important;
        }

        /* BORDERS */

        .stellix-redoc table,
        .stellix-redoc td,
        .stellix-redoc th {
          border-color: rgba(255, 255, 255, 0.1) !important;
        }

        /* RIGHT CODE PANEL */

        .stellix-redoc .right-panel {
          background: #0d0d15 !important;
        }

        .stellix-redoc pre {
          background: #0d0d15 !important;
        }

        /* RESPONSE / ENDPOINT BOXES */

        .stellix-redoc button {
          border-color: rgba(255, 255, 255, 0.12);
        }

        /* SCROLLBAR */

        .stellix-redoc ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }

        .stellix-redoc ::-webkit-scrollbar-track {
          background: transparent;
        }

        .stellix-redoc ::-webkit-scrollbar-thumb {
          background: rgba(139, 124, 255, 0.3);
          border-radius: 999px;
        }

        .stellix-redoc ::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 124, 255, 0.55);
        }

        /* REMOVE LIGHT SURFACES */

        .stellix-redoc [style*="background-color: rgb(255, 255, 255)"] {
          background-color: #07070b !important;
        }

        /* MOBILE */

        @media (max-width: 768px) {
          .stellix-redoc .menu-content {
            width: 260px !important;
          }
        }
      `}</style>
    </div>
  );
}