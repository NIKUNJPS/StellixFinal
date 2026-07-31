"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { BREADCRUMB_LABELS, NON_NAVIGABLE_SEGMENTS } from "@/components/layout/nav-config";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="Breadcrumb">
      {segments.map((segment, i) => {
        const href = `/${segments.slice(0, i + 1).join("/")}`;
        const isLast = i === segments.length - 1;
        return (
          <span key={href} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
            {isLast || !isNavigable(segment) ? (
              <span className={isLast ? "font-medium text-foreground" : undefined}>
                {labelFor(segment)}
              </span>
            ) : (
              <Link href={href} className="hover:text-foreground">
                {labelFor(segment)}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
