import { create } from "zustand";
import { apiClient, AUTH_REQUIRED_EVENT_NAME, clearAuthSession, hasAuthToken } from "../../shared/api/httpClient";
import type { AuthenticatedUser } from "../../shared/types/api";

interface AuthState {
  isAuthenticated: boolean;
  isInitializing: boolean;
  user: AuthenticatedUser | null;
  setUser: (user: AuthenticatedUser | null) => void;
  logout: () => void;
  bootstrap: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isInitializing: true,
  user: null,
  setUser: (user) => set({ user, isAuthenticated: Boolean(user), isInitializing: false }),
  logout: () => {
    clearAuthSession();
    set({ user: null, isAuthenticated: false, isInitializing: false });
  },
  bootstrap: async () => {
    if (!hasAuthToken()) {
      set({ isInitializing: false });
      return;
    }
    try {
      const user = await apiClient.get<AuthenticatedUser>("/auth/me", { timeoutMs: 7000 });
      get().setUser(user);
    } catch {
      get().logout();
    }
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_REQUIRED_EVENT_NAME, () => {
    useAuthStore.getState().logout();
  });
}
