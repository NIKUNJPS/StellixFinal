"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { getNavLinks } from "@/components/layout/nav-config";
import { listStrategies } from "@/lib/strategy";
import type { StrategyListItem } from "@/lib/strategy-types";
import { useAuthStore } from "@/store/auth-store";

const PALETTE = {
  cardBg: "#0F1115",
  elevatedBg: "#14161B",
  borderSubtle: "rgba(255, 255, 255, 0.06)",
  borderHover: "rgba(255, 255, 255, 0.12)",
  textPrimary: "#F5F5F7",
  textSecondary: "#9A9DA8",
  textMuted: "#666A76",
  glowLavender: "#6F6B9B",
};

/** Cmd+K global search (Page 10, Batch 12): real nav destinations + a live
 * strategy lookup (no mock data — listStrategies() is the same call the
 * Strategy Explorer page uses). */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [strategies, setStrategies] = useState<StrategyListItem[]>([]);
  const user = useAuthStore((s) => s.user);
  const navLinks = getNavLinks(user?.role);

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
    if (user?.role === "compliance_officer") return;
    listStrategies()
      .then((res) => setStrategies(res.items))
      .catch(() => setStrategies([]));
  }, [open, user]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex h-9 w-64 items-center gap-2.5 rounded-xl border px-3 text-xs transition-all duration-150 active:scale-[0.99]"
        style={{
          backgroundColor: PALETTE.elevatedBg,
          borderColor: PALETTE.borderSubtle,
          color: PALETTE.textMuted,
        }}
        data-testid="global-search-trigger"
      >
        <Search
          className="h-3.5 w-3.5 shrink-0 transition-colors duration-150 group-hover:text-[#F5F5F7]"
          style={{ color: PALETTE.textMuted }}
        />
        <span className="flex-1 text-left tracking-tight transition-colors duration-150 group-hover:text-[#F5F5F7]">
          Search models, pages…
        </span>
        <kbd
          className="flex h-5 items-center rounded-md border px-1.5 font-mono text-[10px] font-semibold transition-colors duration-150"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            borderColor: PALETTE.borderSubtle,
            color: PALETTE.textSecondary,
          }}
        >
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <div
          className="overflow-hidden rounded-2xl border"
          style={{
            backgroundColor: PALETTE.cardBg,
            borderColor: PALETTE.borderHover,
            boxShadow: "0 24px 60px -10px rgba(0, 0, 0, 0.85)",
          }}
        >
          <CommandInput
            placeholder="Jump to a page or strategy…"
            className="border-b font-mono text-xs text-[#F5F5F7] placeholder:text-[#666A76]"
            style={{ borderColor: PALETTE.borderSubtle }}
          />
          <CommandList className="max-h-[340px] p-2 text-xs">
            <CommandEmpty
              className="py-8 text-center font-mono text-xs"
              style={{ color: PALETTE.textMuted }}
            >
              No results found.
            </CommandEmpty>

            <CommandGroup
              heading="Pages"
              className="font-mono text-[10px] uppercase tracking-wider text-[#666A76]"
            >
              {navLinks.map((link) => (
                <CommandItem
                  key={link.href}
                  value={link.label}
                  onSelect={() => go(link.href)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-[#F5F5F7] transition-colors duration-150 hover:bg-[#14161B] data-[selected=true]:bg-[#14161B] data-[selected=true]:text-white"
                >
                  <link.icon
                    className="h-4 w-4 shrink-0"
                    style={{ color: PALETTE.glowLavender }}
                  />
                  <span>{link.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            {strategies.length > 0 && (
              <>
                <CommandSeparator
                  className="my-1.5"
                  style={{ backgroundColor: PALETTE.borderSubtle }}
                />
                <CommandGroup
                  heading="Strategies"
                  className="font-mono text-[10px] uppercase tracking-wider text-[#666A76]"
                >
                  {strategies.map((s) => (
                    <CommandItem
                      key={s.id}
                      value={s.name}
                      onSelect={() =>
                        go(`/admin/strategies/${s.id}/backtest-results`)
                      }
                      className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-[#F5F5F7] transition-colors duration-150 hover:bg-[#14161B] data-[selected=true]:bg-[#14161B] data-[selected=true]:text-white"
                    >
                      <span className="truncate">{s.name}</span>
                      <span
                        className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide"
                        style={{
                          backgroundColor: "rgba(255, 255, 255, 0.03)",
                          borderColor: PALETTE.borderSubtle,
                          color: PALETTE.textSecondary,
                        }}
                      >
                        {s.status}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </div>
      </CommandDialog>
    </>
  );
}