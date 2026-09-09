"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { BREADCRUMB_LABELS, NON_NAVIGABLE_SEGMENTS } from "@/components/layout/nav-config";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PALETTE = {
  textPrimary: "#F5F5F7",
  textSecondary: "#9A9DA8",
  textMuted: "#666A76",
};

function labelFor(segment: string): string {
  if (BREADCRUMB_LABELS[segment]) return BREADCRUMB_LABELS[segment];
  if (UUID_RE.test(segment)) return segment.slice(0, 8);
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

/**
 * Not every path prefix is a real page. Linking one produced a 404 from the
 * breadcrumb itself — the exact opposite of what a breadcrumb is for. Two cases:
 * declared namespaces (/admin), and record ids (/admin/strategies/<uuid>), which
 * have no detail route of their own.
 */
function isNavigable(segment: string): boolean {
  return !NON_NAVIGABLE_SEGMENTS.has(segment) && !UUID_RE.test(segment);
}

export function Breadcrumb() {
  const pathname = usePathname() || "/dashboard";
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav
      className="flex items-center gap-1.5 text-xs font-medium tracking-tight"
      aria-label="Breadcrumb"
      style={{ color: PALETTE.textSecondary }}
    >
      {segments.map((segment, i) => {
        const href = `/${segments.slice(0, i + 1).join("/")}`;
        const isLast = i === segments.length - 1;
        return (
          <span key={href} className="flex items-center gap-1.5">
            {i > 0 && (
              <ChevronRight
                className="h-3 w-3 shrink-0"
                style={{ color: PALETTE.textMuted }}
              />
            )}
            {isLast || !isNavigable(segment) ? (
              <span
                className={isLast ? "font-semibold" : undefined}
                style={{
                  color: isLast ? PALETTE.textPrimary : PALETTE.textSecondary,
                }}
              >
                {labelFor(segment)}
              </span>
            ) : (
              <Link
                href={href}
                className="transition-colors duration-150 hover:text-white"
                style={{ color: PALETTE.textSecondary }}
              >
                {labelFor(segment)}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}