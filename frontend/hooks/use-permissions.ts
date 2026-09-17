"use client";

import type { NavAccess } from "@/components/layout/nav-config";
import { useAuthStore } from "@/store/auth-store";

/**
 * Batch 26: UI permission checks, backed by the live permission set /auth/me resolved.
 * These only hide or show affordances — every action is enforced again by the backend.
 */
export function usePermissionsLoaded(): boolean {
  return useAuthStore((s) => s.permissions !== null);
}

export function useCan(key: string): boolean {
  return useAuthStore((s) => s.permissions?.has(key) ?? false);
}

export function useCanAny(...keys: string[]): boolean {
  return useAuthStore((s) => keys.some((k) => s.permissions?.has(k)));
}

/** The system role key ("researcher", ...) — null for custom roles or before load. */
export function useSystemRoleKey(): string | null {
  return useAuthStore((s) => s.effectiveRole?.system_key ?? null);
}

/** Batch 26: the access descriptor every nav consumer passes to navLinksForAccess. */
export function useNavAccess(): NavAccess {
  const legacyRole = useAuthStore((s) => s.user?.role);
  const effectiveRole = useAuthStore((s) => s.effectiveRole);
  const permissions = useAuthStore((s) => s.permissions);
  return {
    roleKey: effectiveRole ? effectiveRole.system_key : legacyRole,
    isCustomRole: effectiveRole !== null && effectiveRole.system_key === null,
    permissions,
  };
}
