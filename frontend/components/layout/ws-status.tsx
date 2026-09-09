"use client";

import { useWebSocket } from "@/hooks/useWebSocket";

const PALETTE = {
  elevatedBg: "#14161B",
  borderSubtle: "rgba(255, 255, 255, 0.06)",
  textSecondary: "#9A9DA8",
  success: "#35C77A",
  warning: "#E5A84B",
};

/**
 * Live-connection indicator (Batch 19). Green when the realtime socket is open,
 * amber while reconnecting. Reads the shared connection state from context, so it
 * reflects the one socket the whole app shares — it does not open its own.
 */
export function WsStatus() {
  const { connected } = useWebSocket();

  return (
    <div
      className="flex items-center gap-2 rounded-xl border px-2.5 py-1 font-mono text-[11px] font-medium transition-all duration-150"
      style={{
        backgroundColor: PALETTE.elevatedBg,
        borderColor: PALETTE.borderSubtle,
        color: PALETTE.textSecondary,
      }}
      title={connected ? "Live updates active" : "Reconnecting…"}
      aria-live="polite"
      data-testid="ws-status"
      data-connected={connected}
    >
      <span className="relative flex h-2 w-2">
        {connected ? (
          <>
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              style={{ backgroundColor: PALETTE.success }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{
                backgroundColor: PALETTE.success,
                boxShadow: "0 0 8px rgba(53, 199, 122, 0.8)",
              }}
            />
          </>
        ) : (
          <span
            className="inline-block h-2 w-2 animate-pulse rounded-full"
            style={{
              backgroundColor: PALETTE.warning,
              boxShadow: "0 0 8px rgba(229, 168, 75, 0.6)",
            }}
          />
        )}
      </span>
      <span className="hidden tracking-tight sm:inline">
        {connected ? "Live" : "Offline"}
      </span>
    </div>
  );
}