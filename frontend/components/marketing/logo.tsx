"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * The Stellix Labs mark (Batch 16) — inline SVG so it's crisp at any size and
 * needs no network request. Gradient/filter ids are made unique per instance
 * (useId) so multiple marks on one page (nav + footer) don't collide.
 * The raster equivalents live at /public/logo.png and /public/logo-mark.png.
 */
export function LogoMark({ className }: { className?: string }) {
  const raw = useId().replace(/:/g, "");
  const grad = `sg${raw}`;
  const glow = `sf${raw}`;
  return (
    <svg viewBox="0 0 512 512" className={cn("shrink-0", className)} fill="none" role="img" aria-label="Stellix Labs">
      <defs>
        <linearGradient id={grad} x1="0.12" y1="0.92" x2="0.92" y2="0.10">
          <stop offset="0" stopColor="#b06cff" />
          <stop offset="0.5" stopColor="#3f74ff" />
          <stop offset="1" stopColor="#1fd8ff" />
        </linearGradient>
        <filter id={glow} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${glow})`} stroke={`url(#${grad})`} fill="none" strokeLinecap="round">
        <path d="M 78.0 289.9 A 182 182 0 1 1 224.3 431.3" strokeWidth="15" />
        <path d="M 138.6 277.0 A 120 120 0 1 1 235.1 370.2" strokeWidth="13" />
        <path d="M 191.5 265.7 A 66 66 0 1 1 244.5 317.0" strokeWidth="11" />
      </g>
      <rect
        x="357.3"
        y="287.0"
        width="22"
        height="22"
        rx="3"
        fill="#26f4ff"
        transform="rotate(45 367.3 297.0)"
        filter={`url(#${glow})`}
      />
    </svg>
  );
}
