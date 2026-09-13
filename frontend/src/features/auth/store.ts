import { create } from "zustand";
import { AUTH_REQUIRED_EVENT_NAME, clearAuthSession } from "../../shared/api/httpClient";
import type { AuthenticatedUser } from "../../shared/types/api";

interface AuthState {
  isAuthenticated: boolean;
  user: AuthenticatedUser | null;
  setUser: (user: AuthenticatedUser | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  setUser: (user) => set({ user, isAuthenticated: Boolean(user) }),
  logout: () => {
    clearAuthSession();
    set({ user: null, isAuthenticated: false });
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_REQUIRED_EVENT_NAME, () => {
    useAuthStore.getState().logout();
  });
}
