import { create } from "zustand";

const SIDEBAR_COLLAPSED_KEY = "ESTOQUE_SIDEBAR_COLLAPSED";

function readPersistedCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
}

interface UiState {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  toggleSidebarCollapsed: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarCollapsed: readPersistedCollapsed(),
  mobileSidebarOpen: false,
  toggleSidebarCollapsed: () => {
    const next = !get().sidebarCollapsed;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    set({ sidebarCollapsed: next });
  },
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
}));
