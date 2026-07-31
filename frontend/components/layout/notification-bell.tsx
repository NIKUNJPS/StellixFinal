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
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications" data-testid="notification-bell">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            items.map((n) => {
              const row = (
                <div
                  className={`flex gap-2 border-b border-border px-3 py-2.5 text-sm last:border-b-0 hover:bg-secondary ${
                    n.read_at ? "" : "bg-accent/10"
                  }`}
                >
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-accent"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {NOTIFICATION_TYPE_LABELS[n.type]}
                    </p>
                    <p className="truncate">{n.message}</p>
                    <p className="text-xs text-muted-foreground">{relativeTime(n.created_at)}</p>
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
