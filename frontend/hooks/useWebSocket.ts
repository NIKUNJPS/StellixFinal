"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAuthStore } from "@/store/auth-store";

/**
 * Realtime WebSocket (Batch 19) — ONE shared connection per authenticated session.
 *
 * Exposed as a provider + a consumer hook rather than a bare hook on purpose. The
 * Batch 19 sketch called useWebSocket() independently in RealtimeAlerts, the TopNav
 * status dot, the regime page, and the dashboard — four calls, and a bare hook opens
 * one socket each: four server connections, four 25s ping timers, four manager-dict
 * entries per user. The provider owns a single socket and every consumer multiplexes
 * over it by event type.
 *
 * Corrected against the real codebase (the sketch assumed a different store shape):
 *  - auth is `accessToken` / `user` on useAuthStore, not `token` / `user`.
 *  - the tenant field is `user.organization_id`, not `user.org_id`.
 *  - the keepalive interval is tracked and cleared on close/unmount; the sketch
 *    created it inside onopen and never cleared it, leaking a timer per reconnect.
 */

export type WSEvent = {
  type:
    | "regime_update"
    | "failure_alert"
    | "evolution_progress"
    | "backtest_progress"
    | "strategy_status"
    | "approval_request"
    // Batch 25: public delayed index quotes, delivered on the bridge's global scope.
    | "market_quotes"
    // Batch 26 Part B: a strategy's Buy/Sell/Hold research signal changed (org-scoped).
    | "strategy_signal"
    // Batch 28: public macro series (FRED) and market-screener refreshes, global scope.
    | "macro_update"
    | "screener_update";
  [key: string]: unknown;
};

type Handler = (event: WSEvent) => void;
type Unsubscribe = () => void;

interface WebSocketContextValue {
  subscribe: (eventType: string, handler: Handler) => Unsubscribe;
  connected: boolean;
}

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
const PING_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;

// Application close codes the backend uses for auth failures (app/api/routes/ws.py).
// Terminal: retrying a rejected token in a backoff loop just burns connections.
const WS_CLOSE_UNAUTHORIZED = 4001;
const WS_CLOSE_ORG_MISMATCH = 4003;

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<Handler>>>(new Map());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const pingTimer = useRef<ReturnType<typeof setInterval>>();
  const reconnectDelay = useRef(1000);
  const stopped = useRef(false);

  const [connected, setConnected] = useState(false);

  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const clearPing = useCallback(() => {
    if (pingTimer.current) {
      clearInterval(pingTimer.current);
      pingTimer.current = undefined;
    }
  }, []);

  const connect = useCallback(() => {
    if (!accessToken || !user || stopped.current) return;

    const url =
      `${WS_BASE}/ws/${user.organization_id}/${user.id}` +
      `?token=${encodeURIComponent(accessToken)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectDelay.current = 1000; // reset backoff on a successful connect
      setConnected(true);
      clearPing();
      // Application-level keepalive; the browser WebSocket API can't send protocol
      // ping frames, so the server answers a text "ping" with "pong".
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, PING_MS);
    };

    ws.onmessage = (event) => {
      if (event.data === "pong") return; // keepalive echo, not a domain event
      let data: WSEvent;
      try {
        data = JSON.parse(event.data) as WSEvent;
      } catch {
        return; // ignore non-JSON frames rather than throwing in the socket callback
      }
      handlersRef.current.get(data.type)?.forEach((h) => h(data));
      handlersRef.current.get("*")?.forEach((h) => h(data)); // wildcard subscribers
    };

    ws.onclose = (event) => {
      setConnected(false);
      clearPing();
      // Auth failures are terminal — the token/org won't fix itself on retry.
      if (
        event.code === WS_CLOSE_UNAUTHORIZED ||
        event.code === WS_CLOSE_ORG_MISMATCH ||
        stopped.current
      ) {
        return;
      }
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, MAX_BACKOFF_MS);
        connect();
      }, reconnectDelay.current);
    };

    // onerror precedes onclose; leave reconnection to onclose so it happens once.
    ws.onerror = () => {};
  }, [accessToken, user, clearPing]);

  const subscribe = useCallback((eventType: string, handler: Handler): Unsubscribe => {
    let set = handlersRef.current.get(eventType);
    if (!set) {
      set = new Set();
      handlersRef.current.set(eventType, set);
    }
    set.add(handler);
    return () => {
      handlersRef.current.get(eventType)?.delete(handler);
    };
  }, []);

  useEffect(() => {
    stopped.current = false;
    connect();
    return () => {
      stopped.current = true;
      clearTimeout(reconnectTimer.current);
      clearPing();
      wsRef.current?.close();
    };
  }, [connect, clearPing]);

  // createElement rather than JSX so this file stays .ts (no .tsx rename needed).
  return createElement(WebSocketContext.Provider, { value: { subscribe, connected } }, children);
}

/**
 * Consume the shared realtime connection. Returns a no-op subscribe + connected=false
 * when used outside the provider, so a component can call it unconditionally without
 * guarding for the unauthenticated (no-provider) tree.
 */
export function useWebSocket(): WebSocketContextValue {
  return useContext(WebSocketContext) ?? { subscribe: () => () => {}, connected: false };
}
