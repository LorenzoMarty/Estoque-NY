import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeJwt(expEpochSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub: "1", exp: expEpochSeconds }));
  return `${header}.${payload}.signature`;
}

describe("httpClient", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolveApiBaseUrl falls back to the local API when running on localhost with no env override", async () => {
    const { resolveApiBaseUrl } = await import("./httpClient");
    expect(resolveApiBaseUrl()).toBe("http://127.0.0.1:8000");
  });

  it("hasAuthToken is false with no stored session", async () => {
    const { hasAuthToken } = await import("./httpClient");
    expect(hasAuthToken()).toBe(false);
  });

  it("hasAuthToken is false for an expired access token with no refresh token", async () => {
    const { hasAuthToken } = await import("./httpClient");
    window.localStorage.setItem("ESTOQUE_API_TOKEN", makeJwt(Math.floor(Date.now() / 1000) - 60));
    expect(hasAuthToken()).toBe(false);
  });

  it("loginRequest persists tokens under the legacy storage keys on success", async () => {
    const { loginRequest } = await import("./httpClient");
    const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: token, refresh_token: "refresh-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await loginRequest("user@example.com", "password123");

    expect(window.localStorage.getItem("ESTOQUE_API_TOKEN")).toBe(token);
    expect(window.localStorage.getItem("ESTOQUE_API_REFRESH_TOKEN")).toBe("refresh-1");
  });

  it("apiClient.get attaches the Bearer token for authenticated requests", async () => {
    const { apiClient, loginRequest } = await import("./httpClient");
    const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: token, refresh_token: "refresh-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 1, name: "Ana", email: "ana@x.com", active: true, created_at: "2026-01-01T00:00:00Z" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    await loginRequest("user@example.com", "password123");
    await apiClient.get("/auth/me");

    const [, requestInit] = fetchMock.mock.calls[1];
    expect(requestInit.headers.Authorization).toBe(`Bearer ${token}`);
  });

  it("apiClient.put sends a PUT request with the given body", async () => {
    const { apiClient, loginRequest } = await import("./httpClient");
    const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: token, refresh_token: "refresh-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 1, name: "Matriz" }), { status: 200, headers: { "Content-Type": "application/json" } })
      );
    vi.stubGlobal("fetch", fetchMock);

    await loginRequest("user@example.com", "password123");
    await apiClient.put("/branches/1", { name: "Matriz" });

    const [, requestInit] = fetchMock.mock.calls[1];
    expect(requestInit.method).toBe("PUT");
    expect(JSON.parse(requestInit.body)).toEqual({ name: "Matriz" });
  });

  it("dispatches AUTH_REQUIRED_EVENT_NAME and clears the session when a protected call has no usable token", async () => {
    const { apiClient, AUTH_REQUIRED_EVENT_NAME } = await import("./httpClient");
    const listener = vi.fn();
    window.addEventListener(AUTH_REQUIRED_EVENT_NAME, listener);
    window.localStorage.setItem("ESTOQUE_API_TOKEN", makeJwt(Math.floor(Date.now() / 1000) - 60));

    await expect(apiClient.get("/auth/me")).rejects.toThrow();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("ESTOQUE_API_TOKEN")).toBeNull();
    window.removeEventListener(AUTH_REQUIRED_EVENT_NAME, listener);
  });
});
