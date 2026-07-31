"use client";

import { useWebSocket } from "@/hooks/useWebSocket";

/**
 * Live-connection indicator (Batch 19). Green when the realtime socket is open,
 * amber while reconnecting. Reads the shared connection state from context, so it
 * reflects the one socket the whole app shares — it does not open its own.
 */
export function WsStatus() {
  const { connected } = useWebSocket();
  return (
    <span
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      title={connected ? "Live updates active" : "Reconnecting…"}
      aria-live="polite"
      data-testid="ws-status"
      data-connected={connected}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          connected ? "bg-green-400" : "animate-pulse bg-amber-400"
        }`}
      />
      <span className="hidden sm:inline">{connected ? "Live" : "Offline"}</span>
    </span>
  );
}
