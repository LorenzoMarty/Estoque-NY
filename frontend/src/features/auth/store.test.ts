import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTH_REQUIRED_EVENT_NAME } from "../../shared/api/httpClient";
import { useAuthStore } from "./store";

describe("useAuthStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAuthStore.setState({ isAuthenticated: false, user: null });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("starts unauthenticated with no stored token", () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("setUser marks the session authenticated", () => {
    useAuthStore.getState().setUser({ id: 1, name: "Ana", email: "ana@x.com", active: true, created_at: "2026-01-01T00:00:00Z" });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.email).toBe("ana@x.com");
  });

  it("logout clears the session", () => {
    useAuthStore.getState().setUser({ id: 1, name: "Ana", email: "ana@x.com", active: true, created_at: "2026-01-01T00:00:00Z" });
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("reacts to AUTH_REQUIRED_EVENT_NAME by logging out", () => {
    useAuthStore.getState().setUser({ id: 1, name: "Ana", email: "ana@x.com", active: true, created_at: "2026-01-01T00:00:00Z" });
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT_NAME));
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
