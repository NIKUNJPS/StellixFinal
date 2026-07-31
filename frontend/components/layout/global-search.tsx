"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { NAV_LINKS } from "@/components/layout/nav-config";
import { listStrategies } from "@/lib/strategy";
import type { StrategyListItem } from "@/lib/strategy-types";

/** Cmd+K global search (Page 10, Batch 12): real nav destinations + a live
 * strategy lookup (no mock data — listStrategies() is the same call the
 * Strategy Explorer page uses). */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [strategies, setStrategies] = useState<StrategyListItem[]>([]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    listStrategies()
      .then((res) => setStrategies(res.items))
      .catch(() => setStrategies([]));
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-64 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-secondary"
        data-testid="global-search-trigger"
      >
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Jump to a page or strategy…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Pages">
            {NAV_LINKS.map((link) => (
              <CommandItem key={link.href} value={link.label} onSelect={() => go(link.href)}>
                <link.icon className="mr-2 h-4 w-4" />
                {link.label}
              </CommandItem>
            ))}
          </CommandGroup>
          {strategies.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Strategies">
                {strategies.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.name}
                    onSelect={() => go(`/admin/strategies/${s.id}/backtest-results`)}
                  >
                    {s.name}
                    <span className="ml-auto text-xs text-muted-foreground">{s.status}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
