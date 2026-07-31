import { create } from "zustand";

import type { OrganizationRead, UserRead } from "@/lib/auth-types";

/**
 * Auth state.
 *
 * SECURITY: the access token lives in memory ONLY — never localStorage/sessionStorage
 * (XSS risk). The refresh token is never held here at all; it is an httpOnly cookie
 * the browser manages and JS cannot read. On a hard refresh the access token is lost
 * and is silently re-minted from the refresh cookie (see lib/api-client.ts).
 */
interface AuthState {
  accessToken: string | null;
  user: UserRead | null;
  organization: OrganizationRead | null;
  isAuthenticated: boolean;
  setAccessToken: (token: string | null) => void;
  setSession: (user: UserRead, organization: OrganizationRead) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  organization: null,
  isAuthenticated: false,
  setAccessToken: (token) =>
    set({ accessToken: token, isAuthenticated: token !== null }),
  setSession: (user, organization) => set({ user, organization }),
  clear: () =>
    set({
      accessToken: null,
      user: null,
      organization: null,
      isAuthenticated: false,
    }),
}));
