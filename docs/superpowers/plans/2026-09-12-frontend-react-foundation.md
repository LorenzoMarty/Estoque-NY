# Frontend React Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vanilla-JS bootstrap of `frontend/` with a Vite + React + TypeScript + Mantine foundation (router, auth, shell, theme), with all 10 business screens left as placeholders for future specs.

**Architecture:** `frontend/src` reorganized by feature (`app/`, `features/`, `shared/`). React Router (browser history) replaces hash routing. A typed `httpClient` ports the auth/session/error logic of `frontend/js/api.js`. Zustand holds auth + shell UI state; TanStack Query provider is wired up (no queries yet — first real query lands in the Dashboard spec). Mantine provides the component/theme system, themed to match the existing dark/orange visual (`frontend/css/app.css`), reusing the existing CSS files as-is for the shell chrome rather than re-deriving every pixel.

**Tech Stack:** Vite (already present) + `@vitejs/plugin-react`, React 18, TypeScript, React Router, Mantine (`core`, `hooks`, `notifications`, `charts` + `recharts` peer), TanStack Query, TanStack Table, React Hook Form + Zod, Zustand, `lucide-react`, Vitest + Testing Library (new — justified below).

**Spec:** `docs/superpowers/specs/2026-09-12-frontend-react-foundation-design.md`

## Global Constraints

- All work happens inside `frontend/`; do not touch `app/`, `migrations/`, or other backend Python code except the deploy scripts explicitly listed in tasks.
- Route ids stay in Portuguese, matching the existing `ROUTES` in `frontend/js/state.js` (`dashboard`, `movimentacoes`, `produtos`, `variacoes`, `transferencias`, `contagem`, `relatorios`, `auditoria`, `cadastros`, `usuarios`, `login`) — these become React Router paths (`/dashboard`, `/movimentacoes`, ...).
- Visual preservation: reuse `frontend/css/app.css` and `frontend/css/responsive.css` unchanged (imported once in `main.tsx`), and reuse existing class names (`border-gradient`, `nav-link`, `placeholder-page`, `btn primary`, etc.) in the new JSX so no CSS rewrite is needed for the shell.
- `frontend/js/*.js`, `frontend/vendor/`, `frontend/src/main.js`, `frontend/src/bootstrap.js` are legacy. `main.js`/`bootstrap.js` are deleted in Task 8 (superseded by `main.tsx`); `js/*.js` and `vendor/` are left untouched and unimported (removed only when the last domain spec migrates its screen).
- New dependency **Vitest + Testing Library**: not in the original approved list. Justification — the repo has no test runner for JS/TS today (`scripts/test-frontend.mjs` only checks syntax via `node --check`); TDD on `httpClient`/store logic needs one, and Vitest is the zero-config companion to Vite already in the project. Flagged here per "no new dependency without justifying."
- New dependency **`recharts`**: required peer dependency of `@mantine/charts` (Mantine charts wrap Recharts) — not usable without it.
- New dependency **`lucide-react`**: replaces the current `window.lucide` + `data-lucide` + manual `refreshIcons()` DOM hack (`frontend/js/ui.js`) with idiomatic React icon components. Scoped to the shell only in this plan.
- Every task that touches `httpClient.ts`, the auth store, or routing must preserve current auth behavior byte-for-byte where the spec says so (token storage keys, `AUTH_REQUIRED_EVENT_NAME`, refresh-once-then-logout).

---

### Task 1: Toolchain — TypeScript + React + Vitest wired into the existing Vite setup

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.mjs`
- Create: `frontend/tsconfig.json`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/app/App.tsx` (trivial placeholder, replaced fully in Task 6)

**Interfaces:**
- Produces: `npm run typecheck`, `npm run test`, `npm run dev`, `npm run build` scripts that every later task relies on.

- [ ] **Step 1: Install dependencies**

Run from `frontend/`:

```bash
npm install react react-dom react-router @mantine/core @mantine/hooks @mantine/notifications @mantine/charts recharts @tanstack/react-query @tanstack/react-table react-hook-form zod @hookform/resolvers zustand lucide-react
npm install --save-dev typescript @vitejs/plugin-react @types/react @types/react-dom vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Update `frontend/vite.config.mjs`**

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 8080,
  },
  preview: {
    host: "127.0.0.1",
    port: 8080,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
```

- [ ] **Step 4: Create `frontend/src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Create trivial `frontend/src/app/App.tsx` (temporary, replaced in Task 6)**

```tsx
export function App() {
  return <div>Estoque NY</div>;
}
```

- [ ] **Step 6: Add `typecheck` script and update `test`/`build` in `frontend/package.json`**

```json
{
  "name": "estoque-ny-frontend",
  "version": "0.1.0",
  "private": true,
  "description": "Frontend do Estoque NY",
  "scripts": {
    "dev": "vite",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "npm run typecheck && npm run test && vite build",
    "serve:static": "node ./scripts/serve-static.mjs"
  }
}
```

(Keep `dependencies`/`devDependencies` as written by `npm install` in Step 1 — do not hand-edit versions.)

- [ ] **Step 7: Verify typecheck and test scripts run clean**

Run: `npm run typecheck` — Expected: no errors (only `App.tsx` exists under `src`, plus `test/setup.ts`).
Run: `npm run test` — Expected: "No test files found" is NOT acceptable long-term, but at this step there are no test files yet, so Vitest exits 0 with "No tests found" — acceptable for this step only, since Task 2 adds the first real test.

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.mjs frontend/tsconfig.json frontend/src/test/setup.ts frontend/src/app/App.tsx
git commit -m "chore(frontend): add React/TypeScript/Vitest toolchain to Vite setup"
```

---

### Task 2: Shared HTTP client — port of `frontend/js/api.js` auth/session/transport logic

**Files:**
- Create: `frontend/src/shared/types/api.ts`
- Create: `frontend/src/shared/api/httpClient.ts`
- Create: `frontend/src/shared/api/httpClient.test.ts`

**Interfaces:**
- Produces:
  - `AUTH_REQUIRED_EVENT_NAME: string`
  - `API_BASE_URL: string`
  - `resolveApiBaseUrl(): string`
  - `hasAuthToken(): boolean`
  - `clearAuthSession(): void`
  - `loginRequest(email: string, password: string): Promise<void>` (posts `/auth/login`, persists tokens; throws `ApiError` on failure)
  - `apiClient: { get<T>(path: string, options?: RequestOptions): Promise<T>; post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>; patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>; delete<T>(path: string, options?: RequestOptions): Promise<T>; }`
  - `class ApiError extends Error { status: number; path: string; payload: ApiErrorPayload | null; code: string | null; }`
- Consumes: nothing (this is the lowest layer).

- [ ] **Step 1: Create `frontend/src/shared/types/api.ts`**

```ts
export interface ApiErrorPayload {
  detail?: string;
  message?: string;
  error?: { message?: string; code?: string };
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type?: string;
}

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  active: boolean;
  created_at: string;
}

export interface AuthRequiredDetail {
  path?: string;
  method?: string;
  status?: number;
  reason?: string;
}
```

- [ ] **Step 2: Write the failing tests for `httpClient.ts`**

```ts
// frontend/src/shared/api/httpClient.test.ts
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
        new Response(JSON.stringify({ id: 1, name: "Ana", email: "ana@x.com", active: true, created_at: "2026-01-01T00:00:00Z" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await loginRequest("user@example.com", "password123");
    await apiClient.get("/auth/me");

    const [, requestInit] = fetchMock.mock.calls[1];
    expect(requestInit.headers.Authorization).toBe(`Bearer ${token}`);
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- httpClient` (from `frontend/`)
Expected: FAIL — `Cannot find module './httpClient'` (file doesn't exist yet).

- [ ] **Step 4: Implement `frontend/src/shared/api/httpClient.ts`**

```ts
import type { ApiErrorPayload, AuthRequiredDetail, TokenPair } from "../types/api";

const AUTH_STORAGE_KEYS = ["ESTOQUE_API_TOKEN", "access_token", "token", "ESTOQUE_TOKEN", "auth_token"];
const AUTH_REFRESH_STORAGE_KEYS = ["ESTOQUE_API_REFRESH_TOKEN", "refresh_token"];
const AUTH_STORAGE_RECORD_KEYS = ["ESTOQUE_AUTH_SESSION", "auth_session"];
export const AUTH_REQUIRED_EVENT_NAME = "estoque:auth-required";

const DEFAULT_API_BASE_URL_LOCAL = "http://127.0.0.1:8000";
const REQUEST_TIMEOUT_MS = 9000;

export class ApiError extends Error {
  status: number;
  path: string;
  payload: ApiErrorPayload | null;
  code: string | null;

  constructor(
    message: string,
    opts: { status: number; path: string; payload?: ApiErrorPayload | null; code?: string | null }
  ) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.path = opts.path;
    this.payload = opts.payload ?? null;
    this.code = opts.code ?? null;
  }
}

function normalizeApiBaseUrl(rawValue: string): string {
  const value = rawValue.trim();
  if (!value) return "";
  return value.replace(/\/+$/, "");
}

function isLocalHostName(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function readEnvApiBaseUrl(): string {
  const viteValue = import.meta.env.VITE_API_URL ? String(import.meta.env.VITE_API_URL) : "";
  if (viteValue) return viteValue;
  const runtimeValue = typeof window !== "undefined" ? String((window as unknown as Record<string, unknown>).__API_BASE_URL__ || "") : "";
  return runtimeValue;
}

export function resolveApiBaseUrl(): string {
  const fromEnv = normalizeApiBaseUrl(readEnvApiBaseUrl());
  if (fromEnv) return fromEnv;

  const origin = typeof window !== "undefined" ? normalizeApiBaseUrl(window.location.origin) : "";
  const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  if (isLocalHostName(host)) {
    return normalizeApiBaseUrl(DEFAULT_API_BASE_URL_LOCAL);
  }
  if (origin) {
    return normalizeApiBaseUrl(`${origin}/api`);
  }
  return "/api";
}

export const API_BASE_URL = resolveApiBaseUrl();

function normalizeTokenValue(token: string | null | undefined): string {
  const raw = String(token || "").trim();
  if (!raw) return "";
  if (raw.startsWith("Bearer ")) return raw.slice("Bearer ".length).trim();
  return raw;
}

function decodeJwtPayload(tokenValue: string): { exp?: number } | null {
  try {
    const parts = tokenValue.split(".");
    if (parts.length !== 3) return null;
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadBase64.padEnd(Math.ceil(payloadBase64.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function normalizeValidToken(token: string | null): string | null {
  const tokenValue = normalizeTokenValue(token);
  if (!tokenValue) return null;
  if (tokenValue.split(".").length !== 3) return null;

  const payload = decodeJwtPayload(tokenValue);
  const exp = Number(payload?.exp || 0);
  if (Number.isFinite(exp) && exp > 0) {
    const nowEpochSeconds = Math.floor(Date.now() / 1000);
    if (nowEpochSeconds >= exp) return null;
  }
  return `Bearer ${tokenValue}`;
}

function resolveRawToken(): string | null {
  for (const key of AUTH_STORAGE_KEYS) {
    const value = normalizeTokenValue(window.localStorage.getItem(key));
    if (value) return value;
  }
  return null;
}

function resolveRawRefreshToken(): string | null {
  for (const key of AUTH_REFRESH_STORAGE_KEYS) {
    const value = normalizeTokenValue(window.localStorage.getItem(key));
    if (value) return value;
  }
  return null;
}

function persistAuthSession(tokens: TokenPair): void {
  const accessToken = normalizeTokenValue(tokens.access_token);
  const refreshToken = normalizeTokenValue(tokens.refresh_token);

  if (accessToken) {
    AUTH_STORAGE_KEYS.forEach((key) => window.localStorage.setItem(key, accessToken));
  }
  if (refreshToken) {
    AUTH_REFRESH_STORAGE_KEYS.forEach((key) => window.localStorage.setItem(key, refreshToken));
  }

  const serialized = JSON.stringify({
    access_token: accessToken || null,
    refresh_token: refreshToken || null,
    updated_at: new Date().toISOString(),
  });
  AUTH_STORAGE_RECORD_KEYS.forEach((key) => window.localStorage.setItem(key, serialized));
}

export function hasAuthToken(): boolean {
  return Boolean(normalizeValidToken(resolveRawToken()) || resolveRawRefreshToken());
}

export function clearAuthSession(): void {
  [...AUTH_STORAGE_KEYS, ...AUTH_REFRESH_STORAGE_KEYS, ...AUTH_STORAGE_RECORD_KEYS].forEach((key) =>
    window.localStorage.removeItem(key)
  );
}

function dispatchAuthRequired(detail: AuthRequiredDetail = {}): void {
  clearAuthSession();
  window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT_NAME, { detail }));
}

function isPublicPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return (
    !normalized ||
    normalized.startsWith("/auth/login") ||
    normalized.startsWith("/auth/register") ||
    normalized.startsWith("/auth/refresh") ||
    normalized.startsWith("/health") ||
    normalized.startsWith("/db")
  );
}

function buildAuthRequiredError(path: string, method: string): ApiError {
  return new ApiError("Faca login para continuar.", {
    status: 401,
    path,
    payload: { detail: "authentication required" },
    code: "AUTH_REQUIRED",
  });
}

function extractErrorMessageFromPayload(payload: ApiErrorPayload | null): string | null {
  if (payload?.detail) return payload.detail;
  if (payload?.message) return payload.message;
  if (payload?.error?.message) return payload.error.message;
  return null;
}

function buildHttpError(args: { path: string; method: string; status: number; payload: ApiErrorPayload | null }): ApiError {
  const messageFromPayload = extractErrorMessageFromPayload(args.payload);
  const normalizedMessage = String(messageFromPayload || "").trim().toLowerCase();
  let message = messageFromPayload || `${args.method} ${args.path} retornou status ${args.status}`;

  if (args.status === 404) {
    message = `Endpoint da API não encontrado (${args.path}). Verifique se o backend está rodando.`;
  } else if (args.status === 401 && normalizedMessage === "invalid credentials") {
    message = "E-mail ou senha inválidos.";
  } else if (args.status === 403 && normalizedMessage === "inactive user") {
    message = "Usuário inativo.";
  } else if (args.status >= 500) {
    message = "Falha interna da API. Tente novamente em instantes.";
  }

  return new ApiError(message, {
    status: args.status,
    path: args.path,
    payload: args.payload,
    code: args.payload?.error?.code || null,
  });
}

async function parseResponsePayload(response: Response): Promise<ApiErrorPayload | null> {
  try {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { message: text.slice(0, 240).replace(/\s+/g, " ").trim() };
    }
  } catch {
    return null;
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  auth?: "optional" | "required" | "none";
  allowRefresh?: boolean;
  retryOnUnauthorized?: boolean;
}

let refreshTokenPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshTokenPromise) return refreshTokenPromise;

  const refreshToken = resolveRawRefreshToken();
  if (!refreshToken) return null;

  refreshTokenPromise = (async () => {
    try {
      const refreshed = await requestJson<TokenPair>("/auth/refresh", {
        method: "POST",
        body: { refresh_token: refreshToken },
        auth: "none",
        timeoutMs: 7000,
        allowRefresh: false,
        retryOnUnauthorized: false,
      });
      const nextAccessToken = normalizeTokenValue(refreshed?.access_token);
      const nextRefreshToken = normalizeTokenValue(refreshed?.refresh_token) || refreshToken;
      if (!nextAccessToken) {
        clearAuthSession();
        return null;
      }
      persistAuthSession({ access_token: nextAccessToken, refresh_token: nextRefreshToken });
      return normalizeValidToken(nextAccessToken);
    } catch {
      clearAuthSession();
      return null;
    } finally {
      refreshTokenPromise = null;
    }
  })();

  return refreshTokenPromise;
}

export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = "GET",
    body = null,
    headers: customHeaders = {},
    timeoutMs = REQUEST_TIMEOUT_MS,
    auth = "optional",
    allowRefresh = true,
    retryOnUnauthorized = true,
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const effectiveAuth = auth === "optional" ? (isPublicPath(path) ? "none" : "required") : auth;
  const rawToken = effectiveAuth === "none" ? null : resolveRawToken();
  let token = effectiveAuth === "none" ? null : normalizeValidToken(rawToken);

  if (effectiveAuth === "required" && !token && allowRefresh) {
    token = await refreshAccessToken();
  }

  if (effectiveAuth === "required" && !token) {
    clearTimeout(timeout);
    if (rawToken) {
      dispatchAuthRequired({ path, method, status: 401, reason: "invalid_or_expired_token" });
    }
    throw buildAuthRequiredError(path, method);
  }

  const headers: Record<string, string> = { Accept: "application/json", ...customHeaders };
  if (token) headers.Authorization = token;
  if (body != null && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await parseResponsePayload(response);

      if (response.status === 401 && retryOnUnauthorized && effectiveAuth !== "none" && allowRefresh && !isPublicPath(path)) {
        const refreshedToken = await refreshAccessToken();
        if (refreshedToken) {
          return requestJson<T>(path, { ...options, allowRefresh: false, retryOnUnauthorized: false });
        }
      }

      if (response.status === 401 && !isPublicPath(path)) {
        dispatchAuthRequired({ path, method, status: 401 });
      }

      throw buildHttpError({ path, method, status: response.status, payload });
    }

    if (response.status === 204) return null as T;
    return (await parseResponsePayload(response)) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(`Timeout na chamada ${method} ${path}`, { status: 504, path });
    }
    if (error instanceof TypeError) {
      throw new ApiError(`Falha de rede ao acessar ${API_BASE_URL}${path}. Verifique a URL da API e o deploy publicado.`, {
        status: 0,
        path,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const apiClient = Object.freeze({
  get<T>(path: string, options: RequestOptions = {}) {
    return requestJson<T>(path, { ...options, method: "GET" });
  },
  post<T>(path: string, body: unknown = null, options: RequestOptions = {}) {
    return requestJson<T>(path, { ...options, method: "POST", body });
  },
  patch<T>(path: string, body: unknown = null, options: RequestOptions = {}) {
    return requestJson<T>(path, { ...options, method: "PATCH", body });
  },
  delete<T>(path: string, options: RequestOptions = {}) {
    return requestJson<T>(path, { ...options, method: "DELETE" });
  },
});

export async function loginRequest(email: string, password: string): Promise<void> {
  const payload = await requestJson<TokenPair>("/auth/login", {
    method: "POST",
    body: { email: email.trim().toLowerCase(), password },
    auth: "none",
    timeoutMs: 9000,
    allowRefresh: false,
    retryOnUnauthorized: false,
  });

  const accessToken = normalizeTokenValue(payload?.access_token);
  const refreshToken = normalizeTokenValue(payload?.refresh_token);
  if (!accessToken || !refreshToken) {
    throw new ApiError("Resposta de login sem tokens.", { status: 502, path: "/auth/login" });
  }

  persistAuthSession({ access_token: accessToken, refresh_token: refreshToken });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- httpClient`
Expected: PASS — all 6 tests green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/types/api.ts frontend/src/shared/api/httpClient.ts frontend/src/shared/api/httpClient.test.ts
git commit -m "feat(frontend): port api.js auth/session/transport logic to typed httpClient"
```

---

### Task 3: Zustand auth store

**Files:**
- Create: `frontend/src/features/auth/store.ts`
- Create: `frontend/src/features/auth/store.test.ts`
- Create: `frontend/src/features/auth/api.ts`

**Interfaces:**
- Consumes: `hasAuthToken`, `clearAuthSession`, `loginRequest`, `apiClient`, `AUTH_REQUIRED_EVENT_NAME` from `../../shared/api/httpClient`; `AuthenticatedUser` from `../../shared/types/api`.
- Produces:
  - `useAuthStore: () => { isAuthenticated: boolean; user: AuthenticatedUser | null; logout: () => void; setUser: (user: AuthenticatedUser | null) => void; }`
  - `login(email: string, password: string): Promise<AuthenticatedUser>` (in `features/auth/api.ts`)

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/features/auth/store.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- store.test`
Expected: FAIL — `Cannot find module './store'`.

- [ ] **Step 3: Implement `frontend/src/features/auth/store.ts`**

```ts
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
```

- [ ] **Step 4: Implement `frontend/src/features/auth/api.ts`**

```ts
import { apiClient, loginRequest } from "../../shared/api/httpClient";
import type { AuthenticatedUser } from "../../shared/types/api";

export async function login(email: string, password: string): Promise<AuthenticatedUser> {
  await loginRequest(email, password);
  return apiClient.get<AuthenticatedUser>("/auth/me", { timeoutMs: 7000 });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- store.test`
Expected: PASS — all 4 tests green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/auth/store.ts frontend/src/features/auth/store.test.ts frontend/src/features/auth/api.ts
git commit -m "feat(frontend): add Zustand auth store wired to httpClient auth-required event"
```

---

### Task 4: Mantine theme mapped from `app.css` tokens

**Files:**
- Create: `frontend/src/app/theme.ts`
- Create: `frontend/src/app/theme.test.ts`

**Interfaces:**
- Produces: `theme: MantineThemeOverride` (default export), consumed by `App.tsx` in Task 6.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/app/theme.test.ts
import { describe, expect, it } from "vitest";
import { theme } from "./theme";

describe("theme", () => {
  it("uses the app.css orange accent as the primary color", () => {
    expect(theme.primaryColor).toBe("orange");
    expect(theme.colors?.orange?.[6]).toBe("#f97316");
  });

  it("uses dark color scheme to match the current app background", () => {
    expect(theme.colors?.dark?.[7]).toBe("#18181b");
  });

  it("maps the app.css radius scale", () => {
    expect(theme.radius?.md).toBe("14px");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- theme.test`
Expected: FAIL — `Cannot find module './theme'`.

- [ ] **Step 3: Implement `frontend/src/app/theme.ts`**

Colors below are copied verbatim from `frontend/css/app.css:2-21` (the `:root` custom properties).

```ts
import { createTheme, type MantineColorsTuple } from "@mantine/core";

const zinc: MantineColorsTuple = [
  "#f4f4f5", // 0 — zinc-100
  "#e4e4e7", // 1 — zinc-200
  "#d4d4d8", // 2 — zinc-300
  "#a1a1aa", // 3 — zinc-400
  "#71717a", // 4 — zinc-500
  "#52525b", // 5 — zinc-650
  "#3f3f46", // 6 — zinc-700
  "#27272a", // 7 — zinc-800
  "#1f1f24", // 8 — zinc-850
  "#18181b", // 9 — zinc-900
];

const orange: MantineColorsTuple = [
  "#fff2e8",
  "#fdba74", // 1 — orange-200
  "#fb923c", // 2 — orange-400
  "#f97316", // 3
  "#f97316", // 4
  "#f97316", // 5
  "#f97316", // 6 — orange-500, primary shade
  "#ea580c", // 7 — orange-600
  "#c2410c", // 8 — orange-700
  "#431407", // 9 — orange-950
];

export const theme = createTheme({
  primaryColor: "orange",
  primaryShade: 6,
  fontFamily: "Inter, sans-serif",
  radius: {
    sm: "10px",
    md: "14px",
    lg: "18px",
    xl: "22px",
  },
  colors: {
    dark: [
      "#f4f4f5",
      "#e4e4e7",
      "#d4d4d8",
      "#a1a1aa",
      "#71717a",
      "#52525b",
      "#3f3f46",
      "#18181b", // dark[7] — Mantine's default "surface" shade, matches zinc-900
      "#1f1f24",
      "#09090b", // zinc-950 — app background
    ],
    zinc,
    orange,
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- theme.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/theme.ts frontend/src/app/theme.test.ts
git commit -m "feat(frontend): add Mantine theme mapped from app.css design tokens"
```

---

### Task 5: Route table and shared strings

**Files:**
- Create: `frontend/src/app/routes.ts`
- Create: `frontend/src/shared/strings.ts`

**Interfaces:**
- Produces:
  - `ROUTES: RouteDef[]` where `RouteDef = { id: string; icon: LucideIconName; navKey: string; section: "operation" | "cadastros" | "settings"; hidden?: boolean }`
  - `NAV_SECTIONS_ORDER: Array<"operation" | "cadastros" | "settings">`
  - `strings: { app_name: string; search_placeholder: string; nav: Record<string, string>; nav_sections: Record<string, string>; login: { title: string; subtitle: string; cta: string }; shell: { notifications_title: string; notifications_empty: string; demo_title: string }; actions: { page_under_construction: string } }`

- [ ] **Step 1: Create `frontend/src/app/routes.ts`**

Values copied verbatim from `frontend/js/state.js:1-12` (dropping `complete`, which is always `true` today and unused by the Foundation).

```ts
import type { strings } from "../shared/strings";

export type NavSection = "operation" | "cadastros" | "settings";

export interface RouteDef {
  id: string;
  icon: string;
  navKey: keyof typeof strings.nav;
  section: NavSection;
  hidden?: boolean;
}

export const ROUTES: RouteDef[] = [
  { id: "dashboard", icon: "layout-dashboard", navKey: "dashboard", section: "operation" },
  { id: "movimentacoes", icon: "shuffle", navKey: "movements", section: "operation" },
  { id: "produtos", icon: "package", navKey: "products", section: "operation" },
  { id: "variacoes", icon: "barcode", navKey: "variations", section: "operation" },
  { id: "transferencias", icon: "arrow-right-left", navKey: "transfers", section: "operation" },
  { id: "contagem", icon: "clipboard-check", navKey: "inventory_count", section: "operation" },
  { id: "relatorios", icon: "bar-chart-3", navKey: "reports", section: "operation" },
  { id: "auditoria", icon: "shield-check", navKey: "audit", section: "operation" },
  { id: "cadastros", icon: "folder", navKey: "cadastros", section: "cadastros" },
  { id: "usuarios", icon: "users", navKey: "users", section: "settings" },
  { id: "login", icon: "log-in", navKey: "login", section: "settings", hidden: true },
];

export const NAV_SECTIONS_ORDER: NavSection[] = ["operation", "cadastros", "settings"];
```

- [ ] **Step 2: Create `frontend/src/shared/strings.ts`**

Values copied verbatim from `frontend/js/i18n.js` (`app_name`, `search_placeholder`, `nav`, `nav_sections`, `login`, `shell.notifications_*`/`demo_title`, `actions.page_under_construction`). Only the subset used by the Foundation is ported; each domain spec adds its own section when it migrates a screen.

```ts
export const strings = {
  app_name: "Estoque FreeShop",
  search_placeholder: "Buscar produto ou código de barras",
  nav: {
    dashboard: "Visão geral",
    movements: "Movimentações",
    products: "Produtos",
    variations: "Variações",
    transfers: "Transferências",
    inventory_count: "Contagem de estoque",
    reports: "Relatórios",
    audit: "Auditoria",
    cadastros: "Cadastros",
    users: "Usuários & Permissões",
    login: "Login",
  },
  nav_sections: {
    operation: "Operação",
    cadastros: "Cadastros",
    settings: "Configurações",
  },
  login: {
    title: "Acesso ao sistema",
    subtitle: "Faça login para acessar dashboards, movimentações e cadastros administrativos.",
    cta: "Entrar com usuário e senha",
    email_label: "E-mail",
    password_label: "Senha",
    submit_label: "Entrar",
    invalid_email: "Informe um e-mail válido.",
    invalid_password: "Informe sua senha com pelo menos 8 caracteres.",
  },
  shell: {
    notifications_title: "Notificações",
    notifications_empty: "Sem novos alertas não lidos.",
    demo_title: "Modo demonstração",
  },
  actions: {
    page_under_construction: "Em breve",
  },
} as const;
```

- [ ] **Step 3: Verify typecheck passes (no test framework needed for static data)**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/routes.ts frontend/src/shared/strings.ts
git commit -m "feat(frontend): port route table and shell/login strings to TypeScript"
```

---

### Task 6: Router + RequireAuth guard

**Files:**
- Create: `frontend/src/app/router.tsx`
- Create: `frontend/src/app/shell/RequireAuth.tsx`
- Create: `frontend/src/app/shell/RequireAuth.test.tsx`
- Create: `frontend/src/features/placeholder/PlaceholderPage.tsx`

**Interfaces:**
- Consumes: `useAuthStore` from `../../features/auth/store`; `ROUTES` from `./routes`.
- Produces: `router: ReturnType<typeof createBrowserRouter>` (default export of `router.tsx`), used by `App.tsx` in Task 8.

- [ ] **Step 1: Write the failing test for `RequireAuth`**

```tsx
// frontend/src/app/shell/RequireAuth.test.tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "../../features/auth/store";
import { RequireAuth } from "./RequireAuth";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<div>Dashboard page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireAuth", () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
  });

  it("redirects to /login when not authenticated", () => {
    renderAt("/dashboard");
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("renders the protected route when authenticated", () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 1, name: "Ana", email: "ana@x.com", active: true, created_at: "2026-01-01T00:00:00Z" },
    });
    renderAt("/dashboard");
    expect(screen.getByText("Dashboard page")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- RequireAuth`
Expected: FAIL — `Cannot find module './RequireAuth'`.

- [ ] **Step 3: Implement `frontend/src/app/shell/RequireAuth.tsx`**

```tsx
import { Navigate, Outlet } from "react-router";
import { useAuthStore } from "../../features/auth/store";

export function RequireAuth() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
```

- [ ] **Step 4: Implement `frontend/src/features/placeholder/PlaceholderPage.tsx`**

Reuses the `placeholder-page`/`placeholder-card`/`border-gradient`/`reveal` classes already defined in `frontend/css/app.css` (see `frontend/js/render.js:1038-1063` for the markup this mirrors).

```tsx
import { strings } from "../../shared/strings";

interface PlaceholderPageProps {
  navKey: keyof typeof strings.nav;
}

export function PlaceholderPage({ navKey }: PlaceholderPageProps) {
  const label = strings.nav[navKey] ?? navKey;
  return (
    <section className="placeholder-page">
      <article className="placeholder-card border-gradient reveal">
        <h2>{label}</h2>
        <p>{strings.actions.page_under_construction}</p>
      </article>
    </section>
  );
}
```

- [ ] **Step 5: Implement `frontend/src/app/router.tsx`**

```tsx
import { createBrowserRouter } from "react-router";
import { LoginPage } from "../features/auth/LoginPage";
import { PlaceholderPage } from "../features/placeholder/PlaceholderPage";
import { AppShell } from "./shell/AppShell";
import { RequireAuth } from "./shell/RequireAuth";
import { ROUTES } from "./routes";

const domainRoutes = ROUTES.filter((route) => route.id !== "login").map((route) => ({
  path: `/${route.id}`,
  element: <PlaceholderPage navKey={route.navKey} />,
}));

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: domainRoutes,
      },
    ],
  },
]);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- RequireAuth`
Expected: PASS — 2 tests green. (`router.tsx` itself has no unit test — it is exercised end-to-end in Task 9's manual verification, since `AppShell` and `LoginPage` don't exist until Tasks 7-8.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/shell/RequireAuth.tsx frontend/src/app/shell/RequireAuth.test.tsx frontend/src/features/placeholder/PlaceholderPage.tsx frontend/src/app/router.tsx
git commit -m "feat(frontend): add browser router with RequireAuth guard and domain placeholders"
```

(`router.tsx` will fail to compile until Tasks 7-8 create `AppShell` and `LoginPage` — that's expected; `npm run typecheck` is only required to pass at the end of Task 9.)

---

### Task 7: Shell — Sidebar, Topbar, AppShell, UI store

**Files:**
- Create: `frontend/src/shared/ui/uiStore.ts`
- Create: `frontend/src/shared/ui/uiStore.test.ts`
- Create: `frontend/src/app/shell/Sidebar.tsx`
- Create: `frontend/src/app/shell/Sidebar.test.tsx`
- Create: `frontend/src/app/shell/Topbar.tsx`
- Create: `frontend/src/app/shell/AppShell.tsx`

**Interfaces:**
- Consumes: `ROUTES`, `NAV_SECTIONS_ORDER` from `../routes`; `strings` from `../../shared/strings`; `useAuthStore` from `../../features/auth/store`.
- Produces: `AppShell` (default layout with `<Outlet />`), consumed by `router.tsx` (Task 6).

- [ ] **Step 1: Write the failing test for the UI store**

```ts
// frontend/src/shared/ui/uiStore.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- uiStore`
Expected: FAIL — `Cannot find module './uiStore'`.

- [ ] **Step 3: Implement `frontend/src/shared/ui/uiStore.ts`**

Persists the collapse preference under the same key as the legacy app (`frontend/js/main.js:196`, `ESTOQUE_SIDEBAR_COLLAPSED`).

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- uiStore`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `Sidebar`**

```tsx
// frontend/src/app/shell/Sidebar.test.tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("renders one nav link per non-hidden route, grouped under their section label", () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getByText("Visão geral")).toBeInTheDocument();
    expect(screen.getByText("Usuários & Permissões")).toBeInTheDocument();
    expect(screen.queryByText("Login")).not.toBeInTheDocument();
    expect(screen.getByText("Operação")).toBeInTheDocument();
    expect(screen.getByText("Configurações")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test -- Sidebar`
Expected: FAIL — `Cannot find module './Sidebar'`.

- [ ] **Step 7: Implement `frontend/src/app/shell/Sidebar.tsx`**

Mirrors the markup/classes of `frontend/js/render.js:403-453` (`nav-section`, `nav-section-label`, `nav-link`, `is-active`, `nav-label`) so `app.css`/`responsive.css` style it unchanged, using `lucide-react` instead of the `data-lucide` + `refreshIcons()` hack.

```tsx
import type { ComponentType } from "react";
import * as Icons from "lucide-react";
import { NavLink } from "react-router";
import { NAV_SECTIONS_ORDER, ROUTES } from "../routes";
import { strings } from "../../shared/strings";

function iconComponent(iconName: string): ComponentType<{ size?: number }> {
  const pascalCase = iconName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("") as keyof typeof Icons;
  return (Icons[pascalCase] ?? Icons.HelpCircle) as ComponentType<{ size?: number }>;
}

export function Sidebar() {
  return (
    <nav className="sidebar-nav" id="sidebarNav" aria-label="Navegação principal">
      {NAV_SECTIONS_ORDER.map((sectionKey) => {
        const sectionRoutes = ROUTES.filter((route) => !route.hidden && route.section === sectionKey);
        if (!sectionRoutes.length) return null;

        return (
          <section className="nav-section" key={sectionKey} data-nav-section={sectionKey}>
            <p className="nav-section-label">{strings.nav_sections[sectionKey]}</p>
            {sectionRoutes.map((route) => {
              const Icon = iconComponent(route.icon);
              const label = strings.nav[route.navKey] ?? route.id;
              return (
                <NavLink
                  key={route.id}
                  to={`/${route.id}`}
                  className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
                  aria-label={label}
                >
                  <Icon size={18} />
                  <span className="nav-label">{label}</span>
                </NavLink>
              );
            })}
          </section>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test -- Sidebar`
Expected: PASS.

- [ ] **Step 9: Implement `frontend/src/app/shell/Topbar.tsx`**

Mirrors `frontend/index.html:37-68` markup/classes; notifications button uses `@mantine/notifications` instead of the legacy custom toast region.

```tsx
import { notifications } from "@mantine/notifications";
import { Bell, Menu, Search } from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "../../features/auth/store";
import { strings } from "../../shared/strings";
import { useUiStore } from "../../shared/ui/uiStore";

export function Topbar() {
  const setMobileSidebarOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [search, setSearch] = useState("");

  return (
    <header className="topbar border-gradient" id="topbar">
      <div className="topbar-left">
        <button
          className="icon-btn mobile-only"
          aria-label="Abrir menu lateral"
          onClick={() => setMobileSidebarOpen(true)}
        >
          <Menu size={18} />
        </button>
        <div className="topbar-brand mobile-only">{strings.app_name}</div>
        <label className="global-search" aria-label="Busca global">
          <Search size={16} />
          <input
            type="search"
            placeholder={strings.search_placeholder}
            aria-label={strings.search_placeholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span className="search-kbd">CTRL + K</span>
        </label>
      </div>

      <div className="topbar-actions">
        <button
          className="icon-btn"
          aria-label="Notificações"
          onClick={() =>
            notifications.show({ title: strings.shell.notifications_title, message: strings.shell.notifications_empty })
          }
        >
          <Bell size={18} />
          <span className="dot" />
        </button>
        <button className="profile-chip" aria-label="Perfil do usuário" onClick={logout}>
          <span className="avatar">{(user?.name ?? "??").slice(0, 2).toUpperCase()}</span>
          <span className="profile-meta">
            <strong>{user?.name ?? "Sem sessão"}</strong>
            <small>{user?.email ?? ""}</small>
          </span>
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 10: Implement `frontend/src/app/shell/AppShell.tsx`**

Mirrors `frontend/index.html:14-75` markup/classes.

```tsx
import { Outlet } from "react-router";
import { useUiStore } from "../../shared/ui/uiStore";
import { PanelLeftClose } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { strings } from "../../shared/strings";

export function AppShell() {
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const mobileSidebarOpen = useUiStore((state) => state.mobileSidebarOpen);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const setMobileSidebarOpen = useUiStore((state) => state.setMobileSidebarOpen);

  return (
    <div className={`app-shell${sidebarCollapsed ? " is-collapsed" : ""}${mobileSidebarOpen ? " mobile-open" : ""}`} id="appShell">
      <aside className="sidebar border-gradient" id="sidebar" aria-label="Menu lateral">
        <div className="sidebar-header">
          <a className="brand" href="/dashboard" aria-label="Ir para Visão geral">
            <span className="brand-mark">📦</span>
            <span className="brand-text">{strings.app_name}</span>
          </a>
          <button className="icon-btn desktop-only" aria-label="Recolher menu lateral" onClick={toggleSidebarCollapsed}>
            <PanelLeftClose size={18} />
          </button>
        </div>
        <Sidebar />
        <div className="sidebar-footer border-gradient">
          <span className="sidebar-footer-label">Sistema</span>
          <p className="sidebar-footer-text">Painel operacional de estoque</p>
        </div>
      </aside>

      <button
        className="mobile-overlay"
        aria-label="Fechar menu"
        onClick={() => setMobileSidebarOpen(false)}
        style={{ display: mobileSidebarOpen ? "block" : "none" }}
      />

      <div className="layout-main">
        <Topbar />
        <main className="page-content" id="pageContent" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

Note: the brand icon (`data-lucide="boxes"` in the legacy markup) is rendered as an emoji placeholder here to avoid an extra import cycle; swap it for `<Boxes size={20} />` from `lucide-react` in the first domain-screen task that touches the shell, since it's a one-line change and not worth a dedicated task.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/shared/ui/uiStore.ts frontend/src/shared/ui/uiStore.test.ts frontend/src/app/shell/Sidebar.tsx frontend/src/app/shell/Sidebar.test.tsx frontend/src/app/shell/Topbar.tsx frontend/src/app/shell/AppShell.tsx
git commit -m "feat(frontend): rebuild sidebar/topbar/app shell in React, reusing existing app.css"
```

---

### Task 8: Login page (React Hook Form + Zod)

**Files:**
- Create: `frontend/src/features/auth/LoginPage.tsx`
- Create: `frontend/src/features/auth/LoginPage.test.tsx`
- Delete: `frontend/src/main.js`
- Delete: `frontend/src/bootstrap.js`

**Interfaces:**
- Consumes: `login` from `./api`; `useAuthStore` from `./store`; `strings` from `../../shared/strings`.
- Produces: `LoginPage` component, consumed by `router.tsx` (Task 6).

Note on scope: the legacy app shows a splash screen with a "Entrar" button that opens a login *drawer* (`frontend/js/render.js:1038-1063` + `frontend/js/main.js:81-151`). This plan replaces that two-step splash+drawer with a direct login form on `/login`, since React Hook Form + Zod was chosen specifically for screens like this one. This is a disclosed UX simplification, not a silent one.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/features/auth/LoginPage.test.tsx
import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "./store";
import { LoginPage } from "./LoginPage";

vi.mock("./api", () => ({
  login: vi.fn(),
}));

import { login } from "./api";

function renderLoginPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </MantineProvider>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    vi.mocked(login).mockReset();
  });

  it("shows a validation error for an invalid email without calling the API", async () => {
    renderLoginPage();

    await userEvent.type(screen.getByLabelText("E-mail"), "not-an-email");
    await userEvent.type(screen.getByLabelText("Senha"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Informe um e-mail válido.")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("logs in and marks the store authenticated on valid credentials", async () => {
    vi.mocked(login).mockResolvedValue({
      id: 1,
      name: "Ana",
      email: "ana@x.com",
      active: true,
      created_at: "2026-01-01T00:00:00Z",
    });

    renderLoginPage();

    await userEvent.type(screen.getByLabelText("E-mail"), "ana@x.com");
    await userEvent.type(screen.getByLabelText("Senha"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true));
    expect(useAuthStore.getState().user?.email).toBe("ana@x.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- LoginPage`
Expected: FAIL — `Cannot find module './LoginPage'`.

- [ ] **Step 3: Implement `frontend/src/features/auth/LoginPage.tsx`**

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, PasswordInput, TextInput } from "@mantine/core";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { z } from "zod";
import { strings } from "../../shared/strings";
import { login } from "./api";
import { useAuthStore } from "./store";

const loginSchema = z.object({
  email: z.string().email(strings.login.invalid_email),
  password: z.string().min(8, strings.login.invalid_password),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginFormValues) {
    setApiError(null);
    try {
      const user = await login(values.email, values.password);
      setUser(user);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Nao foi possivel concluir o login.");
    }
  }

  return (
    <section className="placeholder-page">
      <article className="placeholder-card border-gradient reveal" style={{ maxWidth: 380 }}>
        <h2>{strings.login.title}</h2>
        <p>{strings.login.subtitle}</p>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <TextInput
            label={strings.login.email_label}
            autoComplete="username"
            error={errors.email?.message}
            {...register("email")}
          />
          <PasswordInput
            label={strings.login.password_label}
            autoComplete="current-password"
            error={errors.password?.message}
            mt="sm"
            {...register("password")}
          />
          {apiError && (
            <Alert color="red" mt="sm">
              {apiError}
            </Alert>
          )}
          <Button type="submit" fullWidth mt="md" loading={isSubmitting}>
            {strings.login.submit_label}
          </Button>
        </form>
      </article>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- LoginPage`
Expected: PASS — both tests green.

- [ ] **Step 5: Delete superseded legacy entry files**

```bash
git rm frontend/src/main.js frontend/src/bootstrap.js
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/auth/LoginPage.tsx frontend/src/features/auth/LoginPage.test.tsx
git commit -m "feat(frontend): add React Hook Form + Zod login page, remove legacy JS entry point"
```

---

### Task 9: App entry point, providers, and end-to-end runtime verification

**Files:**
- Modify: `frontend/src/app/App.tsx`
- Create: `frontend/src/main.tsx`
- Modify: `frontend/index.html`

**Interfaces:**
- Consumes: `router` from `./router`; `theme` from `./theme`.
- Produces: the mounted app — nothing downstream consumes this.

- [ ] **Step 1: Implement `frontend/src/app/App.tsx`**

```tsx
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { router } from "./router";
import { theme } from "./theme";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} defaultColorScheme="dark">
        <Notifications position="top-right" />
        <RouterProvider router={router} />
      </MantineProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Create `frontend/src/main.tsx`**

```tsx
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/charts/styles.css";
import "../css/app.css";
import "../css/responsive.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Elemento #root nao encontrado em index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 3: Update `frontend/index.html`**

Replace the hand-built shell markup with a single mount point (React now owns the shell via `AppShell`), and point the entry script at `main.tsx`.

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#f6f8fb" />
  <title>Estoque FreeShop | Operação</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body class="scrollbar">
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 4: Run full verification suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm run test` — Expected: all suites pass (httpClient, store, theme, RequireAuth, uiStore, Sidebar, LoginPage).
Run: `npm run build` — Expected: succeeds, produces `frontend/dist/`.

- [ ] **Step 5: Manual runtime verification (required — do not skip; reading the code is not verification)**

```bash
npm run dev
```

With the backend running locally (`uv run uvicorn app.main:app --reload` from the repo root, or rely on the demo/error path if it isn't), open `http://127.0.0.1:8080` and confirm:
- Not authenticated → redirected to `/login`.
- `/login` renders the form; submitting an invalid email shows "Informe um e-mail válido." inline, no network call.
- Submitting valid credentials against a running local API logs in, redirects to `/dashboard`, and the placeholder "Visão geral" card renders inside the shell.
- Sidebar shows all 10 non-hidden routes grouped under "Operação" / "Cadastros" / "Configurações"; clicking each one navigates and shows its placeholder page with "Em breve".
- Collapsing the sidebar (desktop button) toggles the layout and survives a page reload (localStorage `ESTOQUE_SIDEBAR_COLLAPSED`).
- Clicking the profile chip logs out and redirects to `/login`.
- `npm run preview` (serving the `dist/` build) reproduces the same behavior — confirms the production build isn't broken.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/App.tsx frontend/src/main.tsx frontend/index.html
git commit -m "feat(frontend): mount React app with Mantine/Query/Router providers"
```

---

### Task 10: Deploy configuration — Vercel, Render, Docker

**Files:**
- Modify: `scripts/prepare_vercel_static.py`
- Modify: `vercel.json`
- Modify: `frontend/Dockerfile`
- Create: `frontend/public/_redirects`
- Modify: `README.md` (Render static-site section)

**Interfaces:** none — this task only affects build/deploy tooling, no application code.

- [ ] **Step 1: Update `scripts/prepare_vercel_static.py`**

Copies the Vite build output instead of raw static files (the `npm ci && npm run build` step itself is moved into `vercel.json`'s `buildCommand`, run before this script).

```python
#!/usr/bin/env python
"""Prepare static assets for Vercel by copying the Vite build output into public/."""

from __future__ import annotations

import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = PROJECT_ROOT / "frontend" / "dist"
PUBLIC_DIR = PROJECT_ROOT / "public"


def main() -> None:
    if not DIST_DIR.exists():
        raise FileNotFoundError(
            f"Missing frontend build output: {DIST_DIR}. Run `npm run build` in frontend/ first."
        )

    if PUBLIC_DIR.exists():
        shutil.rmtree(PUBLIC_DIR)

    shutil.copytree(DIST_DIR, PUBLIC_DIR)

    print(f"Prepared Vercel static assets in {PUBLIC_DIR}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Update `vercel.json`**

Adds the frontend build step ahead of the copy script, and a SPA rewrite so deep-linked/refreshed React Router paths resolve to `index.html`. Vercel serves any real static file (including `/api/*` Python Functions and Vite's hashed `/assets/*` files) before falling back to `rewrites`, so this does not break the existing `/api/*` functions.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "buildCommand": "cd frontend && npm ci && npm run build && cd .. && python scripts/prepare_vercel_static.py",
  "functions": {
    "api/**/*.py": {
      "maxDuration": 10
    }
  },
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

- [ ] **Step 3: Create `frontend/public/_redirects`**

Vite copies everything under `frontend/public/` into `frontend/dist/` verbatim, so this ships to the Render static-site publish directory automatically. Needed for React Router paths to survive a hard refresh/deep link on Render.

```
/* /index.html 200
```

- [ ] **Step 4: Update `frontend/Dockerfile`**

Adds a build stage instead of copying raw `js/css/vendor` and running `npm run dev` (which was never meant for production use).

```dockerfile
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/vite.config.mjs ./vite.config.mjs
COPY --from=build /app/package.json ./package.json

ENV HOST=0.0.0.0 \
    PORT=8080

EXPOSE 8080

CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "8080"]
```

`node_modules` from the build stage is reused as-is (`vite.config.mjs` imports `@vitejs/plugin-react` at load time, so `vite preview` needs it present even though it only serves static files) — no second install needed.

- [ ] **Step 5: Update the Render section of `README.md`**

In the "Deploy do frontend no Render (Static Site)" section, change:

```markdown
1. No Render: **New +** -> **Static Site**.
2. Selecione o mesmo repo.
3. Configure:
   - Root Directory: `frontend`
   - Build Command: `npm ci && npm run build`
   - Publish Directory: `dist`
4. Antes de publicar, ajuste `frontend/src/shared/api/httpClient.ts` para apontar para a API do Render, ou defina a variável de build `VITE_API_URL`:

```env
VITE_API_URL=https://<nome-da-sua-api>.onrender.com
```

5. Deploy.
```

(Replaces the old `Publish Directory: .` and the old instruction to edit `frontend/js/api.js`.)

- [ ] **Step 6: Verify the Vercel build command locally**

Run from the repo root:

```bash
cd frontend && npm ci && npm run build && cd ..
python scripts/prepare_vercel_static.py
```

Expected: `public/` is created containing `index.html` and Vite's hashed `assets/` directory (no `js/`, `css/`, `vendor/` folders — those are gone from the output since `main.tsx` bundles the CSS imports).

- [ ] **Step 7: Commit**

```bash
git add scripts/prepare_vercel_static.py vercel.json frontend/Dockerfile frontend/public/_redirects README.md
git commit -m "chore(deploy): adapt Vercel/Render/Docker configs to the Vite React build output"
```

---

## Post-plan verification checklist (run once, after Task 10)

- [ ] `cd frontend && npm run typecheck && npm run test && npm run build` — all green.
- [ ] `npm run dev`, walk the manual checklist in Task 9 Step 5 again against the final state of the tree.
- [ ] `npm run preview` after `npm run build` — confirm the production bundle behaves the same as dev.
- [ ] `cd .. && python scripts/prepare_vercel_static.py` after a fresh `frontend` build — confirm `public/` populates correctly.
- [ ] Per this repo's global rule ("Doc sincronizada"): after this plan lands, invoke the `claude-obsidian` skill to record the frontend architecture change in the Estoque hub (`02 - Projetos/New York/Estoque/` in the E_Mind vault) — new stack, deploy changes, and the sub-project decomposition for the remaining domain screens.
