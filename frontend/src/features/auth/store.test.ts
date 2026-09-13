import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_REQUIRED_EVENT_NAME } from "../../shared/api/httpClient";
import { useAuthStore } from "./store";

function makeJwt(expEpochSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub: "1", exp: expEpochSeconds }));
  return `${header}.${payload}.signature`;
}

describe("useAuthStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    useAuthStore.setState({ isAuthenticated: false, isInitializing: true, user: null });
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
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

  it("bootstrap finishes initializing without a session when there is no stored token", async () => {
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().isInitializing).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("bootstrap restores the session from a valid stored token by fetching /auth/me", async () => {
    const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    window.localStorage.setItem("ESTOQUE_API_TOKEN", token);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: 1, name: "Ana", email: "ana@x.com", active: true, created_at: "2026-01-01T00:00:00Z" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await useAuthStore.getState().bootstrap();

    expect(useAuthStore.getState().isInitializing).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.email).toBe("ana@x.com");
  });
});
