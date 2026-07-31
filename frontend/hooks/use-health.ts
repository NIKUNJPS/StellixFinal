"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchHealth } from "@/lib/api";

/** TanStack Query hook for live backend health; refetches every 5s. */
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 5000,
    retry: false,
  });
}
