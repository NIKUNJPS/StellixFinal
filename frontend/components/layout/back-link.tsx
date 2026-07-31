import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Explicit "back to the parent list" affordance for detail pages.
 *
 * The breadcrumb in the top nav shows where you are, but on a deep page reached by
 * clicking a row (a strategy's validation or backtest results) the useful action is
 * a single obvious step back to the list you came from. A real <Link> — not
 * router.back() — so it behaves correctly when the page was opened directly from a
 * bookmark, a shared URL, or a new tab, where there is no history to go back to.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}
