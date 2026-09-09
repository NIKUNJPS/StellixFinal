"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/notification";
import { NOTIFICATION_TYPE_LABELS, type NotificationRead } from "@/lib/notification-types";

const POLL_MS = 30_000;

const PALETTE = {
  cardBg: "#0F1115",
  elevatedBg: "#14161B",
  borderSubtle: "rgba(255, 255, 255, 0.06)",
  borderHover: "rgba(255, 255, 255, 0.12)",
  textPrimary: "#F5F5F7",
  textSecondary: "#9A9DA8",
  textMuted: "#666A76",
  glowLavender: "#6F6B9B",
  danger: "#E45B5B",
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const [items, setItems] = useState<NotificationRead[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await listNotifications({ limit: 20 });
      setItems(data.items);
      setUnreadCount(data.unread_count);
    } catch {
      // Bell degrades to "no notifications" rather than crashing the top nav.
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) await refresh();
  }

  async function onItemClick(n: NotificationRead) {
    if (!n.read_at) {
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)));
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await markNotificationRead(n.id);
      } catch {
        // Non-fatal — the item is still visible; a later refresh will reconcile.
      }
    }
    setOpen(false);
  }

  async function onMarkAllRead() {
    setItems((prev) => prev.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      await refresh();
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-xl border transition-all duration-150 hover:bg-[#14161B] hover:text-[#F5F5F7] active:scale-95"
          style={{
            backgroundColor: PALETTE.elevatedBg,
            borderColor: PALETTE.borderSubtle,
            color: PALETTE.textSecondary,
          }}
          aria-label="Notifications"
          data-testid="notification-bell"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9px] font-semibold text-white shadow-sm"
              style={{
                backgroundColor: PALETTE.danger,
                boxShadow: "0 0 8px rgba(228, 91, 91, 0.6)",
              }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 overflow-hidden rounded-2xl border p-0 backdrop-blur-xl"
        style={{
          backgroundColor: PALETTE.cardBg,
          borderColor: PALETTE.borderSubtle,
          boxShadow: "0 24px 60px -10px rgba(0, 0, 0, 0.85)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-3.5 py-3"
          style={{ borderColor: PALETTE.borderSubtle }}
        >
          <span
            className="text-xs font-semibold tracking-tight"
            style={{ color: PALETTE.textPrimary }}
          >
            Notifications
          </span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="flex items-center gap-1 font-mono text-[11px] transition-colors hover:text-white"
              style={{ color: PALETTE.textSecondary }}
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p
              className="px-3 py-8 text-center font-mono text-xs"
              style={{ color: PALETTE.textMuted }}
            >
              No notifications yet.
            </p>
          ) : (
            items.map((n) => {
              const row = (
                <div
                  className="flex gap-2.5 border-b px-3.5 py-3 text-xs transition-colors duration-150 last:border-b-0 hover:bg-[#14161B]"
                  style={{
                    borderColor: "rgba(255, 255, 255, 0.03)",
                    backgroundColor: n.read_at ? "transparent" : "rgba(111, 107, 155, 0.06)",
                  }}
                >
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition-colors"
                    style={{
                      backgroundColor: n.read_at ? "transparent" : PALETTE.glowLavender,
                      boxShadow: n.read_at ? "none" : "0 0 6px rgba(111, 107, 155, 0.8)",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="font-mono text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: PALETTE.textMuted }}
                    >
                      {NOTIFICATION_TYPE_LABELS[n.type]}
                    </p>
                    <p
                      className="truncate font-medium"
                      style={{ color: PALETTE.textPrimary }}
                    >
                      {n.message}
                    </p>
                    <p
                      className="mt-0.5 font-mono text-[10px]"
                      style={{ color: PALETTE.textSecondary }}
                    >
                      {relativeTime(n.created_at)}
                    </p>
                  </div>
                </div>
              );
              return n.link ? (
                <Link key={n.id} href={n.link} onClick={() => onItemClick(n)}>
                  {row}
                </Link>
              ) : (
                <button key={n.id} type="button" className="block w-full text-left" onClick={() => onItemClick(n)}>
                  {row}
                </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}