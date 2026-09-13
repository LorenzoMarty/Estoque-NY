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
  const runtimeValue =
    typeof window !== "undefined" ? String((window as unknown as Record<string, unknown>).__API_BASE_URL__ || "") : "";
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

function buildAuthRequiredError(path: string): ApiError {
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
    throw buildAuthRequiredError(path);
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
