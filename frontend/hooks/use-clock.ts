"use client";

import { useSyncExternalStore } from "react";

/**
 * One shared ticking clock for the whole app (Batch 25). Components that show a
 * relative time ("updated 42s ago") subscribe to this instead of each running its own
 * setInterval — a single timer, and only the subscribing leaf components re-render.
 */
const TICK_MS = 1000;
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useClock(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => now,
  );
}
