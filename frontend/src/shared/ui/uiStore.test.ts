import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./uiStore";

describe("useUiStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState({ sidebarCollapsed: false, mobileSidebarOpen: false });
  });

  it("toggleSidebarCollapsed flips the flag and persists it", () => {
    useUiStore.getState().toggleSidebarCollapsed();
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    expect(window.localStorage.getItem("ESTOQUE_SIDEBAR_COLLAPSED")).toBe("true");
  });

  it("setMobileSidebarOpen sets the flag", () => {
    useUiStore.getState().setMobileSidebarOpen(true);
    expect(useUiStore.getState().mobileSidebarOpen).toBe(true);
  });
});
