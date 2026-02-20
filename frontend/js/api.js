function normalizeSingleProduct(product) {
  const normalized = normalizeProducts([product])[0];
  if (!normalized) return null;
  return {
    ...normalized,
    variations: [],
    variation_count: 0,
    branch_stock: {},
    branch_ids: [],
  };
}

function normalizeSingleVariation(variation) {
  const normalized = normalizeSkusForProducts([variation])[0];
  return normalized || null;
}

export async function createProduct(payload) {
  const created = await requestJson("/products", {
    method: "POST",
    body: {
      name: payload.name,
      description: payload.description || null,
      category_id: payload.category_id == null ? null : Number(payload.category_id),
      brand_id: payload.brand_id == null ? null : Number(payload.brand_id),
      brand: payload.brand || null,
      active: payload.active !== false,
    },
  });
  return normalizeSingleProduct(created);
}

export async function updateProduct(productId, payload = {}) {
  const body = {};

  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    body.name = payload.name;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "description")) {
    body.description = payload.description;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "category_id")) {
    body.category_id = payload.category_id == null ? null : Number(payload.category_id);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "brand_id")) {
    body.brand_id = payload.brand_id == null ? null : Number(payload.brand_id);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "brand")) {
    body.brand = payload.brand;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "active")) {
    body.active = payload.active;
  }

  const updated = await requestJson(`/products/${productId}`, {
    method: "PATCH",
    body,
  });
  return normalizeSingleProduct(updated);
}

export async function createProductCategory(name) {
  const created = await requestJson("/categories", {
    method: "POST",
    body: { name },
  });
  const normalized = normalizeCatalogRows([created])[0];
  return normalized || null;
}

export async function createProductBrand(name) {
  const created = await requestJson("/brands", {
    method: "POST",
    body: { name },
  });
  const normalized = normalizeCatalogRows([created])[0];
  return normalized || null;
}

export async function createVariation(payload) {
  const created = await requestJson("/skus", {
    method: "POST",
    body: {
      product_id: Number(payload.product_id),
      name: payload.name,
      sku_code: payload.sku_code || null,
      barcode: payload.barcode || null,
      cost: payload.cost == null ? null : Number(payload.cost),
      price: payload.price == null ? null : Number(payload.price),
      active: payload.active !== false,
      attributes: payload.attributes || {},
    },
  });
  return normalizeSingleVariation(created);
}

export async function updateVariation(variationId, payload) {
  const updated = await requestJson(`/skus/${variationId}`, {
    method: "PATCH",
    body: payload,
  });
  return normalizeSingleVariation(updated);
}

function normalizeSingleRole(role) {
  const normalized = normalizeRoles([role])[0];
  return normalized || null;
}

function normalizeSingleUser(user) {
  const role = normalizeSingleRole(user?.role || {}) || null;
  const roleList = role ? [role] : normalizeRoles([]);
  const normalized = normalizeUsers([user], roleList)[0];
  return normalized || null;
}

export async function createUser(payload) {
  const created = await requestJson("/users", {
    method: "POST",
    body: {
      name: payload.name,
      email: payload.email,
      role_id: payload.role_id == null ? null : Number(payload.role_id),
      is_active: payload.is_active !== false,
      password: payload.password || null,
    },
  });
  return normalizeSingleUser(created);
}

export async function updateUser(userId, payload) {
  const updated = await requestJson(`/users/${userId}`, {
    method: "PATCH",
    body: payload,
  });
  return normalizeSingleUser(updated);
}

export async function createRole(payload) {
  const created = await requestJson("/roles", {
    method: "POST",
    body: {
      name: payload.name,
    },
  });
  return normalizeSingleRole(created);
}

export async function updateRole(roleId, payload) {
  const updated = await requestJson(`/roles/${roleId}`, {
    method: "PATCH",
    body: payload,
  });
  return normalizeSingleRole(updated);
}

export async function updateRolePermissions(roleId, permissions) {
  const updated = await requestJson(`/roles/${roleId}/permissions`, {
    method: "PATCH",
    body: {
      permissions: normalizeRolePermissions(permissions),
    },
  });
  if (updated && typeof updated === "object") {
    return normalizeSingleRole(updated);
  }
  return {
    id: Number(roleId),
    permissions: normalizeRolePermissions(permissions),
  };
}
import { generateMockDataset, generateMockProductsDataset } from "./mock_data.js";
import { resolvePeriodRange } from "./utils.js";

const { DateTime } = window.luxon;

const DEFAULT_API_BASE_URL = "https://estoque-ny.onrender.com";
const AUTH_STORAGE_KEYS = ["ESTOQUE_API_TOKEN", "access_token"];
const AUTH_REQUIRED_EVENT = "estoque:auth-required";
export const AUTH_REQUIRED_EVENT_NAME = AUTH_REQUIRED_EVENT;

function normalizeApiBaseUrl(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  return value.replace(/\/+$/, "");
}

function readEnvApiBaseUrl() {
  const viteValue =
    typeof import.meta !== "undefined" && import.meta?.env?.VITE_API_URL
      ? String(import.meta.env.VITE_API_URL)
      : "";
  if (viteValue) return viteValue;

  const nextValue =
    typeof process !== "undefined" && process?.env?.NEXT_PUBLIC_API_URL
      ? String(process.env.NEXT_PUBLIC_API_URL)
      : "";
  if (nextValue) return nextValue;

  const runtimeValue =
    (typeof window !== "undefined" && window.__API_BASE_URL__) ||
    (typeof window !== "undefined" && window.VITE_API_URL) ||
    (typeof window !== "undefined" && window.NEXT_PUBLIC_API_URL) ||
    "";
  return String(runtimeValue);
}

function resolveApiBaseUrl() {
  const fromEnv = normalizeApiBaseUrl(readEnvApiBaseUrl());
  if (fromEnv) return fromEnv;
  return normalizeApiBaseUrl(DEFAULT_API_BASE_URL);
}

export const API_BASE_URL = resolveApiBaseUrl();

const MIN_LOADING_MS = 600;
const REQUEST_TIMEOUT_MS = 9000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unwrapCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

function resolveRawToken() {
  const tokenCandidates = AUTH_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).filter(Boolean);
  const first = tokenCandidates[0];
  return first || null;
}

export function hasAuthToken() {
  return Boolean(normalizeValidToken(resolveRawToken()));
}

export function clearAuthSession() {
  AUTH_STORAGE_KEYS.forEach((key) => {
    window.localStorage.removeItem(key);
  });
}

function dispatchAuthRequired(detail = {}) {
  clearAuthSession();
  window.dispatchEvent(
    new CustomEvent(AUTH_REQUIRED_EVENT, {
      detail,
    })
  );
}

function buildAuthRequiredError(path, method = "GET", message = "Faca login para continuar.") {
  const error = new Error(message);
  error.status = 401;
  error.path = path;
  error.code = "AUTH_REQUIRED";
  error.payload = { detail: "authentication required", source: "frontend" };
  error.method = method;
  return error;
}

function shouldHandleUnauthorized(path) {
  const normalizedPath = String(path || "").toLowerCase();
  return !isPublicPath(normalizedPath);
}

function isPublicPath(path) {
  const normalizedPath = String(path || "").toLowerCase();
  return (
    !normalizedPath ||
    normalizedPath.startsWith("/auth/login") ||
    normalizedPath.startsWith("/auth/register") ||
    normalizedPath.startsWith("/auth/refresh") ||
    normalizedPath.startsWith("/health") ||
    normalizedPath.startsWith("/db")
  );
}

function normalizeTokenValue(token) {
  const raw = String(token || "").trim();
  if (!raw) return "";
  if (raw.startsWith("Bearer ")) {
    return raw.slice("Bearer ".length).trim();
  }
  return raw;
}

function decodeJwtPayload(tokenValue) {
  try {
    const parts = String(tokenValue || "").split(".");
    if (parts.length !== 3) return null;
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = payloadBase64.padEnd(Math.ceil(payloadBase64.length / 4) * 4, "=");
    const jsonPayload = atob(paddedPayload);
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function normalizeValidToken(token) {
  const tokenValue = normalizeTokenValue(token);
  if (!tokenValue) return null;

  const parts = tokenValue.split(".");
  if (parts.length !== 3) return null;

  const payload = decodeJwtPayload(tokenValue);
  const exp = Number(payload?.exp || 0);
  if (Number.isFinite(exp) && exp > 0) {
    const nowEpochSeconds = Math.floor(Date.now() / 1000);
    if (nowEpochSeconds >= exp) {
      return null;
    }
  }

  return `Bearer ${tokenValue}`;
}

function isAbortError(error) {
  return error instanceof Error && error.name === "AbortError";
}

function buildHttpError({ path, method, status, payload }) {
  const messageFromPayload =
    typeof payload?.detail === "string"
      ? payload.detail
      : typeof payload?.message === "string"
      ? payload.message
      : null;
  const error = new Error(messageFromPayload || `${method} ${path} retornou status ${status}`);
  error.status = status;
  error.path = path;
  error.payload = payload || null;
  return error;
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson(path, options = {}) {
  const {
    method = "GET",
    body = null,
    headers: customHeaders = {},
    timeoutMs = REQUEST_TIMEOUT_MS,
    auth = "optional",
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const effectiveAuth = auth === "optional" ? (isPublicPath(path) ? "none" : "required") : auth;
  const rawToken = effectiveAuth === "none" ? null : resolveRawToken();
  const token = effectiveAuth === "none" ? null : normalizeValidToken(rawToken);

  if (effectiveAuth === "required" && !token) {
    if (rawToken) {
      dispatchAuthRequired({
        path,
        method,
        status: 401,
        reason: "invalid_or_expired_token",
      });
    }
    clearTimeout(timeout);
    throw buildAuthRequiredError(path, method);
  }
  const headers = {
    Accept: "application/json",
    ...customHeaders,
  };

  if (token) {
    headers.Authorization = token;
  }

  if (body != null && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      credentials: "include",
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await parseJsonSafe(response);
      if (response.status === 401 && shouldHandleUnauthorized(path)) {
        dispatchAuthRequired({
          path,
          method,
          status: 401,
        });
      }
      throw buildHttpError({
        path,
        method,
        status: response.status,
        payload,
      });
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  } catch (error) {
    if (isAbortError(error)) {
      const timeoutError = new Error(`Timeout na chamada ${method} ${path}`);
      timeoutError.status = 504;
      timeoutError.path = path;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function optionalJson(path, options = {}) {
  try {
    return await requestJson(path, options);
  } catch {
    return null;
  }
}

export const apiClient = Object.freeze({
  request: requestJson,
  get(path, options = {}) {
    return requestJson(path, { ...options, method: "GET" });
  },
  post(path, body = null, options = {}) {
    return requestJson(path, { ...options, method: "POST", body });
  },
  patch(path, body = null, options = {}) {
    return requestJson(path, { ...options, method: "PATCH", body });
  },
  delete(path, options = {}) {
    return requestJson(path, { ...options, method: "DELETE" });
  },
});

async function loadDbHealthPayload() {
  const directPayload = await optionalJson("/db", {
    auth: "none",
    timeoutMs: 5000,
  });
  if (directPayload && typeof directPayload === "object") {
    return directPayload;
  }
  return optionalJson("/health/db", {
    auth: "none",
    timeoutMs: 5000,
  });
}

async function loadSystemStatusSnapshot() {
  const [healthPayload, healthDbPayload] = await Promise.all([
    optionalJson("/health", {
      auth: "none",
      timeoutMs: 5000,
    }),
    loadDbHealthPayload(),
  ]);

  return {
    healthPayload,
    healthDbPayload,
    apiOnline: healthPayload?.status === "ok",
    dbOnline: healthDbPayload?.status === "ok",
  };
}

export async function checkSystemStatus() {
  const snapshot = await loadSystemStatusSnapshot();
  return {
    apiOnline: snapshot.apiOnline,
    dbOnline: snapshot.dbOnline,
  };
}

async function ensureAuthenticatedSession() {
  if (!hasAuthToken()) {
    throw buildAuthRequiredError("/auth/me", "GET", "Faca login para continuar.");
  }

  await requestJson("/auth/me", {
    auth: "required",
    timeoutMs: 5000,
  });
}

function inferModeFromEnv(env) {
  const normalized = String(env || "").toLowerCase();
  if (["prod", "production", "staging"].includes(normalized)) {
    return "production";
  }
  return "demo";
}

function buildItemsFromApi({ skus, balances, moves }) {
  const itemMap = new Map();

  unwrapCollection(skus).forEach((sku) => {
    itemMap.set(sku.id, {
      id: sku.id,
      sku_code: sku.sku_code || `VAR-${String(sku.id).padStart(4, "0")}`,
      name: sku.name || `Variação ${sku.id}`,
      barcode: sku.barcode || "",
      active: sku.active !== false,
      reorder_point: 12,
    });
  });

  [...unwrapCollection(balances), ...unwrapCollection(moves)].forEach((row) => {
    if (!row || itemMap.has(row.sku_id)) return;
    itemMap.set(row.sku_id, {
      id: row.sku_id,
      sku_code: `VAR-${String(row.sku_id).padStart(4, "0")}`,
      name: `Variação ${row.sku_id}`,
      barcode: "",
      active: true,
      reorder_point: 12,
    });
  });

  return Array.from(itemMap.values());
}

function deriveAlertsFromApi({ balances, items, transfers, counts }) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const alerts = [];
  let id = 1;

  unwrapCollection(balances).forEach((balance) => {
    const item = itemById.get(balance.sku_id);
    if (!item) return;

    if (balance.on_hand <= 0) {
      alerts.push({
        id,
        severity: "critical",
        type: "stockout",
        item_id: balance.sku_id,
        branch_id: balance.branch_id,
        note: "Sem saldo disponível para retirada.",
      });
      id += 1;
      return;
    }

    if (balance.on_hand <= item.reorder_point) {
      alerts.push({
        id,
        severity: "warning",
        type: "low_stock",
        item_id: balance.sku_id,
        branch_id: balance.branch_id,
        note: "Saldo abaixo do ponto de reposição.",
      });
      id += 1;
    }
  });

  unwrapCollection(transfers)
    .filter((transfer) => ["DRAFT", "SHIPPED"].includes(String(transfer.status || "")))
    .slice(0, 10)
    .forEach((transfer) => {
      alerts.push({
        id,
        severity: "warning",
        type: "delayed_transfer",
        item_id: transfer.items?.[0]?.sku_id || transfer.item_id || null,
        branch_id: transfer.to_branch_id,
        note: "Transferência pendente de conclusão.",
      });
      id += 1;
    });

  unwrapCollection(counts)
    .filter((count) => String(count.status || "") === "OPEN")
    .slice(0, 6)
    .forEach((count) => {
      alerts.push({
        id,
        severity: "normal",
        type: "divergence",
        item_id: count.lines?.[0]?.sku_id || null,
        branch_id: count.branch_id,
        note: "Contagem aberta com possível divergência.",
      });
      id += 1;
    });

  return alerts;
}

function normalizeMoves(moves) {
  return unwrapCollection(moves)
    .map((move) => ({
      id: move.id,
      branch_id: move.branch_id,
      sku_id: move.sku_id,
      location_id: move.location_id,
      move_type: move.move_type,
      qty: move.qty,
      occurred_at: move.occurred_at,
      created_by: move.created_by,
      user_name: move.user_name || `Usuário ${move.created_by || "-"}`,
      reason: move.reason || "",
      reference_id: move.reference_id || "",
      balance_after:
        typeof move.balance_after === "number" ? move.balance_after : move.balance_after || null,
      transfer_id: move.transfer_id || null,
      inventory_count_id: move.inventory_count_id || null,
    }))
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
}

function normalizeBranches(branches) {
  return unwrapCollection(branches).map((branch) => ({
    id: branch.id,
    name: branch.name,
    created_at: branch.created_at,
  }));
}

function normalizeLocations(locations) {
  return unwrapCollection(locations).map((location) => ({
    id: location.id,
    branch_id: location.branch_id,
    name: location.name,
    type: location.type,
  }));
}

function normalizeUsersFromMoves(moves) {
  const userMap = new Map();
  moves.forEach((move) => {
    const key = String(move.created_by || move.user_name || "");
    if (!key || userMap.has(key)) return;
    userMap.set(key, {
      id: move.created_by || key,
      name: move.user_name || `Usuário ${move.created_by || "-"}`,
    });
  });
  return Array.from(userMap.values());
}

function normalizeProducts(products) {
  return unwrapCollection(products).map((product) => ({
    id: product.id,
    name: String(product.name || "").trim(),
    description: String(product.description || "").trim(),
    category_id: product.category_id ?? null,
    brand_id: product.brand_id ?? null,
    brand: product.brand ?? null,
    active: product.active !== false,
    created_at: product.created_at || DateTime.now().toISO(),
    updated_at: product.updated_at || product.created_at || DateTime.now().toISO(),
  }));
}

function normalizeCatalogRows(rows) {
  return unwrapCollection(rows).map((row) => ({
    id: row.id,
    name: String(row.name || `Cadastro ${row.id}`),
    active: row.active !== false,
  }));
}

function normalizeSkusForProducts(skus) {
  return unwrapCollection(skus).map((sku) => ({
    id: sku.id,
    product_id: sku.product_id,
    sku_code: sku.sku_code || `VAR-${String(sku.id).padStart(5, "0")}`,
    name: sku.name || `Variação ${sku.id}`,
    barcode: sku.barcode || "",
    cost: typeof sku.cost === "number" ? sku.cost : null,
    price: typeof sku.price === "number" ? sku.price : null,
    active: sku.active !== false,
    created_at: sku.created_at || DateTime.now().toISO(),
  }));
}

function ensureCatalogFromProducts(products, categories, brands) {
  const categoryMap = new Map((categories || []).map((category) => [Number(category.id), category]));
  const brandMap = new Map((brands || []).map((brand) => [Number(brand.id), brand]));

  products.forEach((product) => {
    if (product.category_id != null && !categoryMap.has(Number(product.category_id))) {
      categoryMap.set(Number(product.category_id), {
        id: Number(product.category_id),
        name: `Categoria ${product.category_id}`,
        active: true,
      });
    }

    if (product.brand_id != null && !brandMap.has(Number(product.brand_id))) {
      brandMap.set(Number(product.brand_id), {
        id: Number(product.brand_id),
        name: String(product.brand || `Marca ${product.brand_id}`),
        active: true,
      });
    }
  });

  return {
    categories: Array.from(categoryMap.values()).sort((a, b) =>
      String(a.name).localeCompare(String(b.name), "pt-BR")
    ),
    brands: Array.from(brandMap.values()).sort((a, b) =>
      String(a.name).localeCompare(String(b.name), "pt-BR")
    ),
  };
}

function buildProductBranchStock({ products, skus, balances }) {
  const skuById = new Map((skus || []).map((sku) => [Number(sku.id), sku]));
  const stockByProduct = new Map();

  unwrapCollection(balances).forEach((balance) => {
    const sku = skuById.get(Number(balance.sku_id));
    if (!sku) return;

    const productId = Number(sku.product_id);
    if (!Number.isFinite(productId)) return;

    if (!stockByProduct.has(productId)) {
      stockByProduct.set(productId, {});
    }

    const byBranch = stockByProduct.get(productId);
    const branchKey = String(balance.branch_id);
    byBranch[branchKey] = Number(byBranch[branchKey] || 0) + Number(balance.on_hand || 0);
  });

  products.forEach((product) => {
    if (!stockByProduct.has(Number(product.id))) {
      stockByProduct.set(Number(product.id), {});
    }
  });

  return stockByProduct;
}

function enrichProductsDataset({ products, categories, brands, skus, balances }) {
  const skuRows = normalizeSkusForProducts(skus);
  const byProduct = new Map();

  skuRows.forEach((sku) => {
    const productId = Number(sku.product_id);
    if (!byProduct.has(productId)) {
      byProduct.set(productId, []);
    }
    byProduct.get(productId).push(sku);
  });

  byProduct.forEach((rows) => {
    rows.sort((left, right) => String(left.name).localeCompare(String(right.name), "pt-BR"));
  });

  const resolvedCatalog = ensureCatalogFromProducts(products, categories, brands);
  const categoryById = new Map(
    (resolvedCatalog.categories || []).map((category) => [Number(category.id), category])
  );
  const brandById = new Map((resolvedCatalog.brands || []).map((brand) => [Number(brand.id), brand]));
  const stockByProduct = buildProductBranchStock({
    products,
    skus: skuRows,
    balances,
  });

  const enrichedProducts = products.map((product) => {
    const productId = Number(product.id);
    const variations = byProduct.get(productId) || [];
    const branchStock = stockByProduct.get(productId) || {};

    return {
      ...product,
      category_name:
        product.category_id == null
          ? null
          : categoryById.get(Number(product.category_id))?.name || `Categoria ${product.category_id}`,
      brand_name:
        product.brand_id == null
          ? product.brand || null
          : brandById.get(Number(product.brand_id))?.name || product.brand || `Marca ${product.brand_id}`,
      variations,
      variation_count: variations.length,
      branch_stock: branchStock,
      branch_ids: Object.keys(branchStock).map((id) => Number(id)),
    };
  });

  return {
    categories: resolvedCatalog.categories,
    brands: resolvedCatalog.brands,
    skus: skuRows,
    products: enrichedProducts,
  };
}

async function loadPagedCollection(path, options = {}) {
  const pageSize = Math.max(1, Number(options.pageSize || 200));
  const maxPages = Math.max(1, Number(options.maxPages || 8));
  const sort = options.sort || "id";
  const order = options.order || "asc";
  const extraParams = options.params || {};
  const required = options.required === true;
  const rows = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const query = new URLSearchParams();
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value == null || value === "") return;
      query.set(String(key), String(value));
    });
    query.set("page", String(page));
    query.set("page_size", String(pageSize));
    query.set("sort", String(sort));
    query.set("order", String(order));
    const payload = required
      ? await requestJson(`${path}?${query.toString()}`)
      : await optionalJson(`${path}?${query.toString()}`);
    const currentRows = unwrapCollection(payload);
    if (!currentRows.length) break;
    rows.push(...currentRows);
    if (currentRows.length < pageSize) break;
  }

  return rows;
}

function buildProductsQuery(filters = {}, sort = {}) {
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("page_size", "200");

  const sortKey = sort.key === "created_at" ? "created_at" : "name";
  params.set("sort", sortKey);
  params.set("order", sort.order === "desc" ? "desc" : "asc");

  const status = String(filters.status || "all");
  if (status === "active") {
    params.set("active", "true");
  } else if (status === "inactive") {
    params.set("active", "false");
  }

  if (String(filters.categoryId || "all") !== "all") {
    params.set("category_id", String(filters.categoryId));
  }

  if (String(filters.brandId || "all") !== "all") {
    params.set("brand_id", String(filters.brandId));
  }

  const search = String(filters.searchQuery || "").trim();
  if (search) {
    params.set("q", search);
  }

  return params.toString();
}

function buildProductsDemoPayload(reason = "") {
  const dataset = generateMockProductsDataset(123, {
    productTotal: 240,
    maxVariationsPerProduct: 30,
  });
  const normalizedProducts = normalizeProducts(dataset.products || []);
  const normalizedCategories = normalizeCatalogRows(dataset.categories || []);
  const normalizedBrands = normalizeCatalogRows(dataset.brands || []);
  const enriched = enrichProductsDataset({
    products: normalizedProducts,
    categories: normalizedCategories,
    brands: normalizedBrands,
    skus: dataset.skus || [],
    balances: [],
  });

  return {
    mode: "demo",
    showDemoBanner: true,
    fallbackReason: reason,
    data: {
      source: "demo",
      generated_at: DateTime.now().toISO(),
      branches: dataset.branches || [],
      categories: enriched.categories,
      brands: enriched.brands,
      products: enriched.products,
      skus: enriched.skus,
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

async function loadProductsFromApi(filters = {}, sort = {}) {
  const query = buildProductsQuery(filters, sort);
  const [productsPayload, categoriesPayload, brandsPayload, branchesPayload, skusRows, balancesRows] =
    await Promise.all([
      requestJson(`/products?${query}`),
      optionalJson("/categories?page=1&page_size=200&sort=name&order=asc"),
      optionalJson("/brands?page=1&page_size=200&sort=name&order=asc"),
      optionalJson("/branches"),
      loadPagedCollection("/skus", { pageSize: 200, maxPages: 8, sort: "id", order: "asc" }),
      loadPagedCollection("/stock/balances", {
        pageSize: 200,
        maxPages: 8,
        sort: "id",
        order: "desc",
      }),
    ]);

  const normalizedProducts = normalizeProducts(productsPayload);
  const normalizedCategories = normalizeCatalogRows(categoriesPayload);
  const normalizedBrands = normalizeCatalogRows(brandsPayload);
  const normalizedBranches = normalizeBranches(branchesPayload);
  const enriched = enrichProductsDataset({
    products: normalizedProducts,
    categories: normalizedCategories,
    brands: normalizedBrands,
    skus: skusRows,
    balances: balancesRows,
  });

  return {
    mode: "api",
    showDemoBanner: false,
    fallbackReason: "",
    data: {
      source: "api",
      generated_at: DateTime.now().toISO(),
      branches: normalizedBranches,
      categories: enriched.categories,
      brands: enriched.brands,
      products: enriched.products,
      skus: enriched.skus,
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

function mapVariationsSortKey(sortKey) {
  if (sortKey === "price") return "price";
  if (sortKey === "status") return "active";
  return "name";
}

function buildVariationsParams(filters = {}) {
  const params = {};

  if (String(filters.productId || "all") !== "all") {
    params.product_id = String(filters.productId);
  }

  const status = String(filters.status || "all");
  if (status === "active") {
    params.active = "true";
  } else if (status === "inactive") {
    params.active = "false";
  }

  const search = String(filters.searchQuery || "").trim();
  if (search) {
    params.q = search;
  }

  if (String(filters.hasBarcode || "all") === "yes") {
    params.has_barcode = "true";
  } else if (String(filters.hasBarcode || "all") === "no") {
    params.has_barcode = "false";
  }

  const priceMin = Number(filters.priceMin);
  const priceMax = Number(filters.priceMax);
  const costMin = Number(filters.costMin);
  const costMax = Number(filters.costMax);

  if (Number.isFinite(priceMin) && String(filters.priceMin).trim() !== "") {
    params.price_min = String(priceMin);
  }
  if (Number.isFinite(priceMax) && String(filters.priceMax).trim() !== "") {
    params.price_max = String(priceMax);
  }
  if (Number.isFinite(costMin) && String(filters.costMin).trim() !== "") {
    params.cost_min = String(costMin);
  }
  if (Number.isFinite(costMax) && String(filters.costMax).trim() !== "") {
    params.cost_max = String(costMax);
  }

  return params;
}

function buildVariationsDemoPayload(reason = "") {
  const dataset = generateMockProductsDataset(321, {
    productTotal: 240,
    maxVariationsPerProduct: 16,
  });
  const products = normalizeProducts(dataset.products || []);
  const skus = normalizeSkusForProducts(dataset.skus || []);

  return {
    mode: "demo",
    showDemoBanner: true,
    fallbackReason: reason,
    data: {
      source: "demo",
      generated_at: DateTime.now().toISO(),
      products,
      skus,
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

async function loadVariationsFromApi(filters = {}, sort = {}) {
  const sortKey = mapVariationsSortKey(sort.key);
  const order = sort.order === "desc" ? "desc" : "asc";
  const params = buildVariationsParams(filters);

  const [skusRows, productsPayload] = await Promise.all([
    loadPagedCollection("/skus", {
      pageSize: 250,
      maxPages: 12,
      sort: sortKey,
      order,
      params,
      required: true,
    }),
    requestJson("/products?page=1&page_size=600&sort=name&order=asc"),
  ]);

  const normalizedProducts = normalizeProducts(productsPayload);
  const normalizedSkus = normalizeSkusForProducts(skusRows);
  const productsById = new Map(normalizedProducts.map((product) => [Number(product.id), product]));

  normalizedSkus.forEach((sku) => {
    const productId = Number(sku.product_id);
    if (!Number.isFinite(productId)) {
      return;
    }
    if (!productsById.has(productId)) {
      productsById.set(productId, {
        id: productId,
        name: `Produto ${productId}`,
        description: "",
        category_id: null,
        brand_id: null,
        brand: null,
        active: true,
        created_at: DateTime.now().toISO(),
        updated_at: DateTime.now().toISO(),
      });
    }
  });

  const products = Array.from(productsById.values()).sort((left, right) =>
    String(left.name || "").localeCompare(String(right.name || ""), "pt-BR")
  );

  return {
    mode: "api",
    showDemoBanner: false,
    fallbackReason: "",
    data: {
      source: "api",
      generated_at: DateTime.now().toISO(),
      products,
      skus: normalizedSkus,
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

function createSeededRandom(seed = 42) {
  let current = Number(seed) || 42;
  return () => {
    current = (current * 1664525 + 1013904223) % 4294967296;
    return current / 4294967296;
  };
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pickRandom(rng, rows) {
  return rows[Math.floor(rng() * rows.length)];
}

function ensureTransferCode(value) {
  if (value != null && String(value).trim()) {
    return String(value).trim();
  }
  return "";
}

function normalizeTransferStatus(rawStatus) {
  const normalized = String(rawStatus || "")
    .trim()
    .toUpperCase();
  if (normalized === "DRAFT") return "DRAFT";
  if (normalized === "SHIPPED") return "SHIPPED";
  if (normalized === "RECEIVED") return "RECEIVED";
  if (normalized === "CANCELLED" || normalized === "CANCELED") return "CANCELLED";
  return "DRAFT";
}

function buildDefaultTransferHistory(transfer) {
  const history = [];
  const responsible = transfer.responsible_name || `Usuario ${transfer.created_by || "-"}`;

  history.push({
    key: `created-${transfer.id}`,
    type: "created",
    label: "Transferencia criada",
    at: transfer.created_at,
    by: responsible,
  });

  if (transfer.shipped_at) {
    history.push({
      key: `shipped-${transfer.id}`,
      type: "shipped",
      label: "Transferencia enviada",
      at: transfer.shipped_at,
      by: responsible,
    });
  }

  if (transfer.received_at) {
    history.push({
      key: `received-${transfer.id}`,
      type: "received",
      label: "Recebimento confirmado",
      at: transfer.received_at,
      by: responsible,
    });
  }

  if (transfer.status === "CANCELLED") {
    const cancelAt =
      transfer.cancelled_at ||
      transfer.shipped_at ||
      DateTime.fromISO(transfer.created_at).plus({ hours: 8 }).toISO();
    history.push({
      key: `cancelled-${transfer.id}`,
      type: "cancelled",
      label: "Transferencia cancelada",
      at: cancelAt,
      by: responsible,
    });
  }

  history.sort((left, right) => {
    const leftMs = DateTime.fromISO(String(left.at || "")).toMillis();
    const rightMs = DateTime.fromISO(String(right.at || "")).toMillis();
    if (Number.isNaN(leftMs) || Number.isNaN(rightMs)) return 0;
    return leftMs - rightMs;
  });

  return history;
}

function normalizeTransferItems(rawItems, transferId, transferStatus) {
  return unwrapCollection(rawItems).map((item, index) => {
    const qty = Number(item.qty || 0);
    const qtyReceivedRaw = Number(item.qty_received);
    const qtyReceived = Number.isFinite(qtyReceivedRaw)
      ? qtyReceivedRaw
      : transferStatus === "RECEIVED"
      ? qty
      : 0;

    return {
      id: Number(item.id || index + 1),
      transfer_id: Number(item.transfer_id || transferId),
      sku_id: Number(item.sku_id || item.item_id || 0),
      qty,
      qty_received: qtyReceived,
    };
  });
}

function normalizeTransfer(rawTransfer, itemById = new Map()) {
  const id = Number(rawTransfer.id || 0);
  const status = normalizeTransferStatus(rawTransfer.status);
  const createdAt = String(rawTransfer.created_at || DateTime.now().toISO());
  const shippedAt = rawTransfer.shipped_at ? String(rawTransfer.shipped_at) : null;
  const receivedAt = rawTransfer.received_at ? String(rawTransfer.received_at) : null;
  const cancelledAt = rawTransfer.cancelled_at ? String(rawTransfer.cancelled_at) : null;
  const expectedReceiptAt =
    rawTransfer.expected_receipt_at ||
    (shippedAt
      ? DateTime.fromISO(shippedAt).plus({ days: 2, hours: 6 }).toISO()
      : DateTime.fromISO(createdAt).plus({ days: 2 }).toISO());
  const responsibleName =
    String(rawTransfer.responsible_name || rawTransfer.user_name || "").trim() ||
    `Usuario ${rawTransfer.created_by || "-"}`;
  const code =
    ensureTransferCode(rawTransfer.transfer_code || rawTransfer.code) ||
    `TRF-${String(id).padStart(6, "0")}`;
  const items = normalizeTransferItems(rawTransfer.items, id, status).map((item) => {
    const sourceItem = itemById.get(Number(item.sku_id));
    return {
      ...item,
      sku_code: sourceItem?.sku_code || `VAR-${String(item.sku_id).padStart(4, "0")}`,
      sku_name: sourceItem?.name || `Variacao ${item.sku_id}`,
      barcode: sourceItem?.barcode || "",
    };
  });

  const totalItems = items.reduce((acc, item) => acc + Number(item.qty || 0), 0);
  const relatedMoves = Array.isArray(rawTransfer.related_moves)
    ? rawTransfer.related_moves
    : [
        shippedAt
          ? {
              id: `${id}-ship`,
              move_type: "TRANSFER_SHIP",
              qty: totalItems,
              occurred_at: shippedAt,
              reference_id: `${code}-ENVIO`,
            }
          : null,
        receivedAt
          ? {
              id: `${id}-receive`,
              move_type: "TRANSFER_RECEIVE",
              qty: totalItems,
              occurred_at: receivedAt,
              reference_id: `${code}-RECEB`,
            }
          : null,
      ].filter(Boolean);

  const normalized = {
    id,
    transfer_code: code,
    from_branch_id: Number(rawTransfer.from_branch_id || 0),
    from_location_id: Number(rawTransfer.from_location_id || 0),
    to_branch_id: Number(rawTransfer.to_branch_id || 0),
    to_location_id: Number(rawTransfer.to_location_id || 0),
    status,
    note: String(rawTransfer.note || "").trim(),
    created_by: rawTransfer.created_by ?? null,
    responsible_name: responsibleName,
    created_at: createdAt,
    shipped_at: shippedAt,
    received_at: receivedAt,
    cancelled_at: cancelledAt,
    expected_receipt_at: expectedReceiptAt,
    items,
    related_moves: relatedMoves,
  };

  normalized.history = Array.isArray(rawTransfer.history)
    ? rawTransfer.history
    : buildDefaultTransferHistory(normalized);

  return normalized;
}

function normalizeTransfers(transfers, items = []) {
  const itemById = new Map((items || []).map((item) => [Number(item.id), item]));
  return unwrapCollection(transfers)
    .map((transfer) => normalizeTransfer(transfer, itemById))
    .sort((left, right) => (left.created_at < right.created_at ? 1 : -1));
}

function mapTransfersSortKey(sortKey) {
  if (sortKey === "status") return "status";
  return "created_at";
}

function buildTransfersQuery(filters = {}, sort = {}) {
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("page_size", "320");
  params.set("sort", mapTransfersSortKey(sort.key));
  params.set("order", sort.order === "asc" ? "asc" : "desc");

  const status = normalizeTransferStatus(filters.status);
  if (String(filters.status || "all") !== "all") {
    params.set("status", status);
  }

  const fromBranchId = String(filters.fromBranchId || "all");
  const toBranchId = String(filters.toBranchId || "all");
  if (fromBranchId !== "all" && toBranchId !== "all" && fromBranchId === toBranchId) {
    params.set("branch_id", fromBranchId);
  } else if (fromBranchId !== "all" && toBranchId === "all") {
    params.set("branch_id", fromBranchId);
  } else if (toBranchId !== "all" && fromBranchId === "all") {
    params.set("branch_id", toBranchId);
  }

  return params.toString();
}

function buildTransfersDemoRows({ branches, locations, items, total = 128, seed = 913 }) {
  const rng = createSeededRandom(seed);
  const now = DateTime.now();
  const locationByBranch = new Map();
  const responsiblePool = [
    "Larissa Rocha",
    "Marcos Almeida",
    "Bianca Souza",
    "Rafael Menezes",
    "Camila Borges",
    "Tiago Ramos",
  ];
  const statusPool = [
    { status: "DRAFT", weight: 24 },
    { status: "SHIPPED", weight: 26 },
    { status: "RECEIVED", weight: 42 },
    { status: "CANCELLED", weight: 8 },
  ];

  (branches || []).forEach((branch) => {
    locationByBranch.set(
      Number(branch.id),
      (locations || []).filter((location) => Number(location.branch_id) === Number(branch.id))
    );
  });

  function pickStatus() {
    const totalWeight = statusPool.reduce((acc, row) => acc + row.weight, 0);
    let roll = rng() * totalWeight;
    for (const row of statusPool) {
      roll -= row.weight;
      if (roll <= 0) return row.status;
    }
    return "DRAFT";
  }

  function pickDistinctBranches() {
    const fromBranch = pickRandom(rng, branches);
    const candidates = branches.filter((branch) => Number(branch.id) !== Number(fromBranch.id));
    const toBranch = pickRandom(rng, candidates.length ? candidates : branches);
    return { fromBranch, toBranch };
  }

  function buildItemsForTransfer(transferId, transferStatus) {
    const qtyRows = randomInt(rng, 1, 5);
    const usedSkuIds = new Set();
    const rows = [];

    while (rows.length < qtyRows) {
      const item = pickRandom(rng, items);
      if (!item || usedSkuIds.has(Number(item.id))) continue;
      usedSkuIds.add(Number(item.id));
      const qty = randomInt(rng, 1, 36);
      const partiallyReceived = transferStatus === "RECEIVED" && rng() < 0.08 && qty > 2;
      rows.push({
        id: rows.length + 1,
        transfer_id: transferId,
        sku_id: Number(item.id),
        qty,
        qty_received:
          transferStatus === "RECEIVED"
            ? partiallyReceived
              ? qty - randomInt(rng, 1, 2)
              : qty
            : 0,
        sku_code: item.sku_code || `VAR-${String(item.id).padStart(4, "0")}`,
        sku_name: item.name || `Variacao ${item.id}`,
        barcode: item.barcode || "",
      });
    }

    return rows;
  }

  const rows = [];

  for (let index = 1; index <= total; index += 1) {
    const { fromBranch, toBranch } = pickDistinctBranches();
    const fromLocations = locationByBranch.get(Number(fromBranch.id)) || [];
    const toLocations = locationByBranch.get(Number(toBranch.id)) || [];
    const fromLocation = pickRandom(rng, fromLocations.length ? fromLocations : locations);
    const toLocation = pickRandom(rng, toLocations.length ? toLocations : locations);
    const status = pickStatus();
    const createdAt = now
      .minus({
        days: randomInt(rng, 1, 110),
        hours: randomInt(rng, 0, 20),
        minutes: randomInt(rng, 0, 59),
      })
      .toISO();
    const shippedAt =
      status === "SHIPPED" || status === "RECEIVED" || status === "CANCELLED"
        ? DateTime.fromISO(createdAt)
            .plus({
              hours: randomInt(rng, 3, 32),
            })
            .toISO()
        : null;
    const expectedReceiptAt = DateTime.fromISO(shippedAt || createdAt)
      .plus({
        days: randomInt(rng, 1, 4),
        hours: randomInt(rng, 2, 16),
      })
      .toISO();
    const delayedInTransit = status === "SHIPPED" && rng() < 0.38;
    const delayedExpected = delayedInTransit
      ? now
          .minus({
            days: randomInt(rng, 1, 8),
            hours: randomInt(rng, 1, 20),
          })
          .toISO()
      : expectedReceiptAt;
    const receivedAt =
      status === "RECEIVED"
        ? DateTime.fromISO(expectedReceiptAt)
            .plus({
              hours: randomInt(rng, -8, 20),
            })
            .toISO()
        : null;
    const cancelledAt =
      status === "CANCELLED"
        ? DateTime.fromISO(shippedAt || createdAt)
            .plus({
              hours: randomInt(rng, 2, 18),
            })
            .toISO()
        : null;
    const itemsRows = buildItemsForTransfer(index, status);
    const code = `TRF-${String(index).padStart(6, "0")}`;

    const transfer = {
      id: index,
      transfer_code: code,
      from_branch_id: Number(fromBranch?.id || 0),
      from_location_id: Number(fromLocation?.id || 0),
      to_branch_id: Number(toBranch?.id || 0),
      to_location_id: Number(toLocation?.id || 0),
      status,
      note: pickRandom(rng, [
        "Reposicao de alto giro",
        "Balanceamento semanal entre filiais",
        "Transferencia solicitada pelo supervisor",
        "Ajuste de disponibilidade para campanha",
        "Reforco de estoque no destino",
      ]),
      created_by: randomInt(rng, 1, 8),
      responsible_name: pickRandom(rng, responsiblePool),
      created_at: createdAt,
      shipped_at: shippedAt,
      received_at: receivedAt,
      cancelled_at: cancelledAt,
      expected_receipt_at: delayedExpected,
      items: itemsRows,
    };

    transfer.history = buildDefaultTransferHistory(transfer);
    transfer.related_moves = [
      shippedAt
        ? {
            id: `${index}-ship`,
            move_type: "TRANSFER_SHIP",
            qty: itemsRows.reduce((acc, item) => acc + Number(item.qty || 0), 0),
            occurred_at: shippedAt,
            reference_id: `${code}-ENVIO`,
          }
        : null,
      receivedAt
        ? {
            id: `${index}-receive`,
            move_type: "TRANSFER_RECEIVE",
            qty: itemsRows.reduce((acc, item) => acc + Number(item.qty_received || 0), 0),
            occurred_at: receivedAt,
            reference_id: `${code}-RECEB`,
          }
        : null,
    ].filter(Boolean);

    rows.push(transfer);
  }

  rows.sort((left, right) => (left.created_at < right.created_at ? 1 : -1));
  return rows;
}

function buildTransfersDemoPayload(reason = "") {
  const dataset = generateMockDataset(191, {
    days: 120,
    dailyMoveMin: 2,
    dailyMoveMax: 5,
    itemTotal: 120,
  });
  const transfers = buildTransfersDemoRows({
    branches: dataset.branches || [],
    locations: dataset.locations || [],
    items: dataset.items || [],
    total: 132,
    seed: 9011,
  });

  return {
    mode: "demo",
    showDemoBanner: true,
    fallbackReason: reason,
    data: {
      source: "demo",
      generated_at: DateTime.now().toISO(),
      branches: dataset.branches || [],
      locations: dataset.locations || [],
      items: dataset.items || [],
      transfers,
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

async function loadTransfersFromApi(filters = {}, sort = {}) {
  const query = buildTransfersQuery(filters, sort);
  const [branchesPayload, locationsPayload, skusPayload, transfersPayload] = await Promise.all([
    requestJson("/branches"),
    requestJson("/locations"),
    optionalJson("/skus?page=1&page_size=1200&order=asc"),
    requestJson(`/stock/transfers?${query}`),
  ]);

  const branches = normalizeBranches(branchesPayload);
  const locations = normalizeLocations(locationsPayload);
  const items = buildItemsFromApi({
    skus: skusPayload,
    balances: [],
    moves: [],
  });
  const transfers = normalizeTransfers(transfersPayload, items);

  return {
    mode: "api",
    showDemoBanner: false,
    fallbackReason: "",
    data: {
      source: "api",
      generated_at: DateTime.now().toISO(),
      branches,
      locations,
      items,
      transfers,
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

function normalizeInventoryStatus(rawStatus) {
  const normalized = String(rawStatus || "")
    .trim()
    .toUpperCase();
  if (normalized === "OPEN") return "OPEN";
  if (normalized === "CLOSED") return "CLOSED";
  if (normalized === "POSTED" || normalized === "ADJUSTED") return "POSTED";
  if (normalized === "CANCELLED" || normalized === "CANCELED") return "CANCELLED";
  return "OPEN";
}

function normalizeInventoryLine(rawLine, countId, countStatus, itemById = new Map(), index = 0) {
  const skuId = Number(rawLine.sku_id || rawLine.item_id || 0);
  const sourceItem = itemById.get(skuId);
  const systemQty = Number(rawLine.system_qty || 0);
  const countedQtyRaw = rawLine.counted_qty;
  const countedQty =
    countedQtyRaw == null || countedQtyRaw === ""
      ? null
      : Number.isFinite(Number(countedQtyRaw))
      ? Number(countedQtyRaw)
      : null;
  const diffQty = Number.isFinite(countedQty) ? systemQty - Number(countedQty) : 0;

  return {
    id: Number(rawLine.id || index + 1),
    count_id: Number(rawLine.count_id || countId),
    sku_id: skuId,
    system_qty: systemQty,
    counted_qty: countedQty,
    diff_qty: diffQty,
    posted: rawLine.posted === true || countStatus === "POSTED",
    sku_code: sourceItem?.sku_code || `VAR-${String(skuId).padStart(5, "0")}`,
    sku_name: sourceItem?.name || `Variacao ${skuId}`,
    barcode: sourceItem?.barcode || "",
    price: Number.isFinite(Number(sourceItem?.price)) ? Number(sourceItem.price) : null,
  };
}

function buildDefaultInventoryHistory(count) {
  const responsible = count.responsible_name || `Usuario ${count.created_by || "-"}`;
  const history = [
    {
      key: `created-${count.id}`,
      type: "created",
      label: "Contagem aberta",
      at: count.started_at,
      by: responsible,
    },
  ];

  if (count.closed_at) {
    history.push({
      key: `closed-${count.id}`,
      type: "closed",
      label: "Contagem fechada",
      at: count.closed_at,
      by: responsible,
    });
  }

  if (count.posted_at) {
    history.push({
      key: `posted-${count.id}`,
      type: "posted",
      label: "Ajustes aplicados",
      at: count.posted_at,
      by: responsible,
    });
  }

  if (count.cancelled_at) {
    history.push({
      key: `cancelled-${count.id}`,
      type: "cancelled",
      label: "Contagem cancelada",
      at: count.cancelled_at,
      by: responsible,
    });
  }

  history.sort((left, right) => {
    const leftMs = DateTime.fromISO(String(left.at || "")).toMillis();
    const rightMs = DateTime.fromISO(String(right.at || "")).toMillis();
    if (Number.isNaN(leftMs) || Number.isNaN(rightMs)) return 0;
    return leftMs - rightMs;
  });

  return history;
}

function normalizeInventoryCount(
  rawCount,
  items = [],
  usersById = new Map(),
  fallbackCodePrefix = "CNT"
) {
  const itemById = new Map((items || []).map((item) => [Number(item.id), item]));
  const id = Number(rawCount.id || 0);
  const status = normalizeInventoryStatus(rawCount.status);
  const startedAt = String(rawCount.started_at || rawCount.created_at || DateTime.now().toISO());
  const closedAt = rawCount.closed_at ? String(rawCount.closed_at) : null;
  const postedAt = rawCount.posted_at ? String(rawCount.posted_at) : null;
  const cancelledAt = rawCount.cancelled_at ? String(rawCount.cancelled_at) : null;
  const createdBy = rawCount.created_by ?? null;
  const responsibleName =
    String(rawCount.responsible_name || usersById.get(String(createdBy))?.name || "").trim() ||
    `Usuario ${createdBy || "-"}`;
  const lines = unwrapCollection(rawCount.lines).map((line, index) =>
    normalizeInventoryLine(line, id, status, itemById, index)
  );
  const divergenceCount = lines.filter((line) => Number(line.diff_qty || 0) !== 0).length;
  const countedLines = lines.filter((line) => Number.isFinite(Number(line.counted_qty))).length;
  const countCode =
    String(rawCount.count_code || rawCount.code || "").trim() ||
    `${fallbackCodePrefix}-${String(id).padStart(6, "0")}`;

  const normalized = {
    id,
    count_code: countCode,
    branch_id: Number(rawCount.branch_id || 0),
    location_id: Number(rawCount.location_id || 0),
    status,
    started_at: startedAt,
    closed_at: closedAt,
    posted_at: postedAt,
    cancelled_at: cancelledAt,
    created_by: createdBy,
    responsible_name: responsibleName,
    lines,
    divergence_count: divergenceCount,
    counted_lines: countedLines,
    total_lines: lines.length,
    last_saved_at: rawCount.last_saved_at ? String(rawCount.last_saved_at) : startedAt,
  };

  normalized.history = Array.isArray(rawCount.history)
    ? rawCount.history
    : buildDefaultInventoryHistory(normalized);

  return normalized;
}

function normalizeInventoryCounts(counts, items = [], usersById = new Map()) {
  return unwrapCollection(counts)
    .map((count) => normalizeInventoryCount(count, items, usersById))
    .sort((left, right) => (left.started_at < right.started_at ? 1 : -1));
}

function buildInventoryCountsQuery(filters = {}, sort = {}) {
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("page_size", "220");
  params.set("sort", sort.key === "status" ? "status" : "started_at");
  params.set("order", sort.order === "asc" ? "asc" : "desc");

  if (String(filters.status || "all") !== "all") {
    params.set("status", normalizeInventoryStatus(filters.status));
  }

  if (String(filters.branchId || "all") !== "all") {
    params.set("branch_id", String(filters.branchId));
  }

  if (String(filters.locationId || "all") !== "all") {
    params.set("location_id", String(filters.locationId));
  }

  const periodRange = resolvePeriodRange(filters);
  params.set("from_date", periodRange.from.toUTC().toISO());
  params.set("to_date", periodRange.to.toUTC().toISO());

  return params.toString();
}

function buildInventoryCountDemoRows({
  branches,
  locations,
  items,
  users,
  total = 24,
  seed = 19003,
}) {
  const rng = createSeededRandom(seed);
  const now = DateTime.now();
  const locationByBranch = new Map();
  const userPool = users.length ? users : [{ id: 1, name: "Operador FreeShop" }];

  (branches || []).forEach((branch) => {
    locationByBranch.set(
      Number(branch.id),
      (locations || []).filter((location) => Number(location.branch_id) === Number(branch.id))
    );
  });

  function pickStatus() {
    const roll = rng();
    if (roll < 0.34) return "OPEN";
    if (roll < 0.61) return "CLOSED";
    if (roll < 0.9) return "POSTED";
    return "CANCELLED";
  }

  function pickLines(status, countId) {
    const targetLines = randomInt(rng, 120, 260);
    const chosenIds = new Set();
    const lines = [];

    while (lines.length < targetLines && chosenIds.size < items.length) {
      const item = pickRandom(rng, items);
      if (!item) break;
      const itemId = Number(item.id);
      if (chosenIds.has(itemId)) continue;
      chosenIds.add(itemId);

      const systemQty = randomInt(rng, 0, 190);
      let countedQty = null;

      if (status === "OPEN") {
        if (rng() > 0.25) {
          countedQty = Math.max(0, systemQty + randomInt(rng, -12, 12));
        }
      } else {
        countedQty = Math.max(0, systemQty + randomInt(rng, -16, 16));
      }

      const diffQty =
        countedQty == null ? 0 : Number(systemQty || 0) - Number(countedQty);

      lines.push({
        id: lines.length + 1,
        count_id: countId,
        sku_id: itemId,
        system_qty: systemQty,
        counted_qty: countedQty,
        diff_qty: diffQty,
        posted: status === "POSTED",
      });
    }

    return lines;
  }

  const rows = [];
  for (let index = 1; index <= total; index += 1) {
    const branch = pickRandom(rng, branches);
    const branchLocations = locationByBranch.get(Number(branch?.id || 0)) || [];
    const location = pickRandom(rng, branchLocations.length ? branchLocations : locations);
    const status = pickStatus();
    const startedAt = now
      .minus({
        days: randomInt(rng, 1, 120),
        hours: randomInt(rng, 0, 20),
        minutes: randomInt(rng, 0, 59),
      })
      .toISO();
    const closedAt =
      status === "CLOSED" || status === "POSTED"
        ? DateTime.fromISO(startedAt).plus({ hours: randomInt(rng, 3, 38) }).toISO()
        : null;
    const postedAt =
      status === "POSTED"
        ? DateTime.fromISO(closedAt || startedAt).plus({ hours: randomInt(rng, 1, 10) }).toISO()
        : null;
    const cancelledAt =
      status === "CANCELLED"
        ? DateTime.fromISO(startedAt).plus({ hours: randomInt(rng, 1, 12) }).toISO()
        : null;
    const user = pickRandom(rng, userPool);
    const lines = pickLines(status, index);
    const countCode = `CNT-${String(index).padStart(6, "0")}`;

    const row = {
      id: index,
      count_code: countCode,
      branch_id: Number(branch?.id || 0),
      location_id: Number(location?.id || 0),
      status,
      started_at: startedAt,
      closed_at: closedAt,
      posted_at: postedAt,
      cancelled_at: cancelledAt,
      created_by: user?.id || null,
      responsible_name: user?.name || "Operador FreeShop",
      lines,
      history: [],
      last_saved_at: DateTime.fromISO(startedAt).plus({ hours: 2 }).toISO(),
    };

    row.history = buildDefaultInventoryHistory(row);
    rows.push(row);
  }

  return rows.sort((left, right) => (left.started_at < right.started_at ? 1 : -1));
}

function buildInventoryCountsDemoPayload(reason = "") {
  const dataset = generateMockDataset(1201, {
    days: 120,
    dailyMoveMin: 2,
    dailyMoveMax: 5,
    itemTotal: 420,
  });
  const users =
    (dataset.users || []).map((name, index) => ({
      id: index + 1,
      name,
    })) || [];
  const counts = buildInventoryCountDemoRows({
    branches: dataset.branches || [],
    locations: dataset.locations || [],
    items: dataset.items || [],
    users,
    total: 26,
    seed: 1315,
  });
  const usersById = new Map(users.map((user) => [String(user.id), user]));
  const normalizedCounts = normalizeInventoryCounts(counts, dataset.items || [], usersById);

  return {
    mode: "demo",
    showDemoBanner: true,
    fallbackReason: reason,
    data: {
      source: "demo",
      generated_at: DateTime.now().toISO(),
      branches: dataset.branches || [],
      locations: dataset.locations || [],
      items: dataset.items || [],
      counts: normalizedCounts,
      users,
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

async function loadInventoryCountsFromApi(filters = {}, sort = {}) {
  const query = buildInventoryCountsQuery(filters, sort);
  const [branchesPayload, locationsPayload, skusPayload, countsPayload] = await Promise.all([
    requestJson("/branches"),
    requestJson("/locations"),
    optionalJson("/skus?page=1&page_size=1500&order=asc"),
    requestJson(`/stock/inventory-counts?${query}`),
  ]);

  const branches = normalizeBranches(branchesPayload);
  const locations = normalizeLocations(locationsPayload);
  const items = buildItemsFromApi({
    skus: skusPayload,
    balances: [],
    moves: [],
  });
  const counts = normalizeInventoryCounts(countsPayload, items);
  const usersById = new Map();
  counts.forEach((count) => {
    if (!count.created_by) return;
    usersById.set(String(count.created_by), {
      id: count.created_by,
      name: count.responsible_name || `Usuario ${count.created_by}`,
    });
  });

  return {
    mode: "api",
    showDemoBanner: false,
    fallbackReason: "",
    data: {
      source: "api",
      generated_at: DateTime.now().toISO(),
      branches,
      locations,
      items,
      counts,
      users: Array.from(usersById.values()),
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

const REPORT_CATEGORY_NAMES = [
  "Bebidas",
  "Perfumaria",
  "Cosmeticos",
  "Eletronicos",
  "Tabacaria",
  "Gourmet",
  "Acessorios",
  "Presentes",
];

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeReportCategories(payload) {
  const rows = unwrapCollection(payload).map((row) => ({
    id: Number(row.id || 0),
    name: String(row.name || "").trim(),
  }));
  const valid = rows.filter((row) => Number(row.id) > 0 && row.name);
  if (valid.length) {
    return valid.sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }

  return REPORT_CATEGORY_NAMES.map((name, index) => ({
    id: index + 1,
    name,
  }));
}

function normalizeReportValuationRows(rows) {
  return unwrapCollection(rows).map((row) => ({
    branch_id: Number(row.branch_id || 0),
    location_id: Number(row.location_id || 0),
    sku_id: Number(row.sku_id || 0),
    on_hand: toFiniteNumber(row.on_hand, 0),
    cost: toFiniteNumber(row.cost, 0),
    valuation: toFiniteNumber(row.valuation, 0),
  }));
}

function normalizeReportTurnoverRows(rows) {
  return unwrapCollection(rows).map((row) => ({
    branch_id: Number(row.branch_id || 0),
    location_id: Number(row.location_id || 0),
    sku_id: Number(row.sku_id || 0),
    issued_qty: toFiniteNumber(row.issued_qty, 0),
    average_stock: toFiniteNumber(row.average_stock, 0),
    turnover: toFiniteNumber(row.turnover, 0),
  }));
}

function normalizeReportAbcRows(rows) {
  return unwrapCollection(rows)
    .map((row) => ({
      sku_id: Number(row.sku_id || 0),
      movement_value: toFiniteNumber(row.movement_value, 0),
      cumulative_percent: toFiniteNumber(row.cumulative_percent, 0),
      class_name: String(row.class_name || "C").toUpperCase(),
    }))
    .sort((left, right) => right.movement_value - left.movement_value);
}

function normalizeReportMovementRows(rows) {
  return unwrapCollection(rows)
    .map((row, index) => ({
      id: Number(row.id || index + 1),
      branch_id: Number(row.branch_id || 0),
      location_id: Number(row.location_id || 0),
      sku_id: Number(row.sku_id || 0),
      move_type: String(row.move_type || "").toUpperCase(),
      qty: toFiniteNumber(row.qty, 0),
      occurred_at: String(row.occurred_at || DateTime.now().toISO()),
      reason: String(row.reason || "").trim(),
      reference_id: String(row.reference_id || "").trim(),
    }))
    .sort((left, right) => (left.occurred_at < right.occurred_at ? 1 : -1));
}

function resolveReportsPeriodRange(filters = {}) {
  if (String(filters.period || "") === "today") {
    return {
      from: DateTime.now().startOf("day"),
      to: DateTime.now().endOf("day"),
    };
  }
  return resolvePeriodRange(filters);
}

function buildReportsQueryParams(filters = {}) {
  const periodRange = resolveReportsPeriodRange(filters);
  const params = {
    from_date: periodRange.from.toUTC().toISO(),
    to_date: periodRange.to.toUTC().toISO(),
  };

  if (String(filters.branchId || "all") !== "all") {
    params.branch_id = String(filters.branchId);
  }

  if (String(filters.productId || "all") !== "all") {
    params.sku_id = String(filters.productId);
  }

  return params;
}

async function fetchAllReportItems(path, params = {}, options = {}) {
  const pageSize = Number(options.pageSize || 200);
  const maxPages = Number(options.maxPages || 12);
  const rows = [];
  let page = 1;

  while (page <= maxPages) {
    const query = new URLSearchParams();
    query.set("page", String(page));
    query.set("page_size", String(pageSize));
    Object.entries(params).forEach(([key, value]) => {
      if (value == null || value === "") return;
      query.set(key, String(value));
    });

    const payload = await requestJson(`${path}?${query.toString()}`);
    const items = unwrapCollection(payload);
    rows.push(...items);

    const total = Number(payload?.meta?.total || 0);
    if (!items.length || items.length < pageSize) break;
    if (total > 0 && rows.length >= total) break;
    page += 1;
  }

  return rows;
}

function resolveReportCategoryId(skuId, categories) {
  if (!categories.length) return null;
  const index = Math.abs(Number(skuId || 0)) % categories.length;
  return Number(categories[index]?.id || categories[0]?.id || null);
}

function buildReportItemsFromApi({
  skusPayload,
  productsPayload,
  categories,
  valuationRows,
  turnoverRows,
  abcRows,
  movementRows,
}) {
  const normalizedSkus = normalizeSkusForProducts(skusPayload);
  const normalizedProducts = normalizeProducts(productsPayload);
  const productsById = new Map(normalizedProducts.map((product) => [Number(product.id), product]));
  const categoriesById = new Map(categories.map((category) => [Number(category.id), category]));
  const skuById = new Map(normalizedSkus.map((sku) => [Number(sku.id), sku]));
  const costBySkuId = new Map();
  valuationRows.forEach((row) => {
    if (!Number.isFinite(Number(row.sku_id))) return;
    if (!Number.isFinite(Number(row.cost))) return;
    costBySkuId.set(Number(row.sku_id), Number(row.cost));
  });

  const allSkuIds = new Set();
  normalizedSkus.forEach((sku) => allSkuIds.add(Number(sku.id)));
  valuationRows.forEach((row) => allSkuIds.add(Number(row.sku_id)));
  turnoverRows.forEach((row) => allSkuIds.add(Number(row.sku_id)));
  abcRows.forEach((row) => allSkuIds.add(Number(row.sku_id)));
  movementRows.forEach((row) => allSkuIds.add(Number(row.sku_id)));

  return Array.from(allSkuIds)
    .filter((skuId) => Number.isFinite(skuId) && skuId > 0)
    .map((skuId) => {
      const sku = skuById.get(Number(skuId));
      const product = productsById.get(Number(sku?.product_id || 0));
      const categoryCandidate = Number(product?.category_id || 0);
      const resolvedCategoryId = categoriesById.has(categoryCandidate)
        ? categoryCandidate
        : resolveReportCategoryId(skuId, categories);
      const categoryName = categoriesById.get(Number(resolvedCategoryId))?.name || "Sem categoria";
      const fallbackCost = Number((8 + (skuId % 19) * 1.7).toFixed(2));
      const rowCost =
        Number.isFinite(Number(sku?.cost))
          ? Number(sku.cost)
          : Number.isFinite(Number(costBySkuId.get(skuId)))
          ? Number(costBySkuId.get(skuId))
          : fallbackCost;

      return {
        id: Number(skuId),
        sku_code: sku?.sku_code || `VAR-${String(skuId).padStart(5, "0")}`,
        name: sku?.name || `Variacao ${skuId}`,
        barcode: sku?.barcode || "",
        category_id: resolvedCategoryId,
        category_name: categoryName,
        cost: Number(rowCost.toFixed(2)),
        reorder_point: Number(sku?.reorder_point || 12),
      };
    })
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "pt-BR"));
}

function buildReportsDemoPayload(reason = "") {
  const dataset = generateMockDataset(3211, {
    days: 180,
    dailyMoveMin: 4,
    dailyMoveMax: 9,
    itemTotal: 420,
  });
  const rng = createSeededRandom(5519);
  const categories = REPORT_CATEGORY_NAMES.map((name, index) => ({
    id: index + 1,
    name,
  }));
  const categoryById = new Map(categories.map((category) => [Number(category.id), category]));
  const items = (dataset.items || []).map((item) => {
    const categoryId = ((Number(item.id) - 1 + categories.length) % categories.length) + 1;
    const cost = Number((8 + (Number(item.id) % 21) * 1.85 + randomInt(rng, 0, 14)).toFixed(2));
    return {
      ...item,
      category_id: categoryId,
      category_name: categoryById.get(categoryId)?.name || "Sem categoria",
      cost,
      reorder_point: Number(item.reorder_point || 12),
    };
  });
  const itemById = new Map(items.map((item) => [Number(item.id), item]));

  const movementRows = (dataset.moves || []).map((move) => {
    const reasonPool = [
      "Contagem ciclica",
      "Correcao operacional",
      "Avaria",
      "Validade",
      "Ajuste manual",
    ];
    const criticalBoost = move.move_type === "ADJUSTMENT" && Number(move.id) % 13 === 0;
    const qty = criticalBoost ? Number(move.qty || 0) * 3 : Number(move.qty || 0);

    return {
      id: Number(move.id || 0),
      branch_id: Number(move.branch_id || 0),
      location_id: Number(move.location_id || 0),
      sku_id: Number(move.sku_id || 0),
      move_type: String(move.move_type || "").toUpperCase(),
      qty,
      occurred_at: String(move.occurred_at || DateTime.now().toISO()),
      reason:
        move.move_type === "ADJUSTMENT"
          ? reasonPool[Number(move.id || 0) % reasonPool.length]
          : move.reason || "Operacao diaria",
      reference_id: String(move.reference_id || `REF-${String(move.id || 0).padStart(6, "0")}`),
    };
  });

  const valuationRows = (dataset.balances || []).map((balance) => {
    const cost = Number(itemById.get(Number(balance.sku_id))?.cost || 0);
    return {
      branch_id: Number(balance.branch_id || 0),
      location_id: Number(balance.location_id || 0),
      sku_id: Number(balance.sku_id || 0),
      on_hand: Number(balance.on_hand || 0),
      cost,
      valuation: Number((Number(balance.on_hand || 0) * cost).toFixed(2)),
    };
  });

  const balanceByKey = new Map();
  valuationRows.forEach((row) => {
    balanceByKey.set(`${row.branch_id}-${row.location_id}-${row.sku_id}`, row.on_hand);
  });

  const turnoverAgg = new Map();
  movementRows.forEach((row) => {
    if (!["ISSUE", "TRANSFER_SHIP"].includes(String(row.move_type || ""))) return;
    const key = `${row.branch_id}-${row.location_id}-${row.sku_id}`;
    turnoverAgg.set(key, (turnoverAgg.get(key) || 0) + Math.abs(Number(row.qty || 0)));
  });

  const turnoverRows = Array.from(turnoverAgg.entries()).map(([key, issuedQty]) => {
    const [branchId, locationId, skuId] = key.split("-").map((value) => Number(value));
    const averageStock = Number(balanceByKey.get(key) || 0);
    const turnover = averageStock > 0 ? issuedQty / averageStock : issuedQty;
    return {
      branch_id: branchId,
      location_id: locationId,
      sku_id: skuId,
      issued_qty: Number(issuedQty),
      average_stock: Number(averageStock),
      turnover: Number(turnover.toFixed(4)),
    };
  });

  const abcAgg = new Map();
  movementRows.forEach((row) => {
    if (!["ISSUE", "TRANSFER_SHIP"].includes(String(row.move_type || ""))) return;
    const skuId = Number(row.sku_id || 0);
    const unitCost = Number(itemById.get(skuId)?.cost || 0);
    const value = Math.abs(Number(row.qty || 0)) * unitCost;
    abcAgg.set(skuId, (abcAgg.get(skuId) || 0) + value);
  });
  const abcSorted = Array.from(abcAgg.entries())
    .map(([skuId, movementValue]) => ({
      sku_id: Number(skuId),
      movement_value: Number(movementValue.toFixed(2)),
    }))
    .sort((left, right) => right.movement_value - left.movement_value);
  const totalAbcValue = abcSorted.reduce((acc, row) => acc + Number(row.movement_value || 0), 0);
  let cumulative = 0;
  const abcRows = abcSorted.map((row) => {
    cumulative += totalAbcValue > 0 ? (row.movement_value / totalAbcValue) * 100 : 0;
    const className = cumulative <= 80 ? "A" : cumulative <= 95 ? "B" : "C";
    return {
      sku_id: Number(row.sku_id),
      movement_value: Number(row.movement_value.toFixed(2)),
      cumulative_percent: Number(cumulative.toFixed(2)),
      class_name: className,
    };
  });

  return {
    mode: "demo",
    showDemoBanner: true,
    fallbackReason: reason,
    data: {
      source: "demo",
      generated_at: DateTime.now().toISO(),
      branches: dataset.branches || [],
      locations: dataset.locations || [],
      categories,
      items,
      valuation_rows: valuationRows,
      turnover_rows: turnoverRows,
      abc_rows: abcRows,
      movement_rows: movementRows,
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

async function loadReportsFromApi(filters = {}) {
  const queryParams = buildReportsQueryParams(filters);
  const dateParams = {
    from_date: queryParams.from_date,
    to_date: queryParams.to_date,
  };
  const branchAndDate = {
    ...dateParams,
    branch_id: queryParams.branch_id,
  };
  const valuationParams = {
    branch_id: queryParams.branch_id,
    sku_id: queryParams.sku_id,
  };

  const [branchesPayload, locationsPayload, categoriesPayload, productsPayload, skusPayload] =
    await Promise.all([
      requestJson("/branches"),
      optionalJson("/locations"),
      optionalJson("/categories?page=1&page_size=400&order=asc"),
      optionalJson("/products?page=1&page_size=1500&order=asc"),
      optionalJson("/skus?page=1&page_size=3000&order=asc"),
    ]);

  const [valuationRowsRaw, turnoverRowsRaw, abcRowsRaw, movementRowsRaw] = await Promise.all([
    fetchAllReportItems("/reports/stock/valuation", valuationParams, { pageSize: 200, maxPages: 14 }),
    fetchAllReportItems("/reports/stock/turnover", branchAndDate, { pageSize: 200, maxPages: 14 }),
    fetchAllReportItems("/reports/stock/abc", branchAndDate, { pageSize: 200, maxPages: 14 }),
    fetchAllReportItems("/reports/stock/movements", branchAndDate, { pageSize: 200, maxPages: 14 }),
  ]);

  const categories = normalizeReportCategories(categoriesPayload);
  const valuationRows = normalizeReportValuationRows(valuationRowsRaw);
  const turnoverRows = normalizeReportTurnoverRows(turnoverRowsRaw);
  const abcRows = normalizeReportAbcRows(abcRowsRaw);
  const movementRows = normalizeReportMovementRows(movementRowsRaw);
  const items = buildReportItemsFromApi({
    skusPayload,
    productsPayload,
    categories,
    valuationRows,
    turnoverRows,
    abcRows,
    movementRows,
  });

  return {
    mode: "api",
    showDemoBanner: false,
    fallbackReason: "",
    data: {
      source: "api",
      generated_at: DateTime.now().toISO(),
      branches: normalizeBranches(branchesPayload),
      locations: normalizeLocations(locationsPayload),
      categories,
      items,
      valuation_rows: valuationRows,
      turnover_rows: turnoverRows,
      abc_rows: abcRows,
      movement_rows: movementRows,
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

const AUDIT_ACTION_TYPES = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "STOCK_ADJUSTMENT",
  "TRANSFER",
  "COUNT",
  "AUTH",
];

const AUDIT_RESOURCE_TYPES = ["PRODUCT", "VARIATION", "MOVEMENT", "TRANSFER", "COUNT", "USER"];

function createAuditSeededRandom(seed = 5019) {
  let current = Number(seed) || 1;
  return () => {
    current = (current * 1664525 + 1013904223) % 4294967296;
    return current / 4294967296;
  };
}

function auditRandomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function auditPick(rng, list = []) {
  if (!Array.isArray(list) || !list.length) return null;
  return list[Math.floor(rng() * list.length)];
}

function compactAudit(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeAuditToken(value) {
  return compactAudit(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseAuditJson(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  const text = String(value || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeAuditAction(value) {
  const current = normalizeAuditToken(value);
  if (!current) return "UPDATE";

  if (
    [
      "create",
      "created",
      "insert",
      "new",
      "criacao",
      "criar",
      "cadastro",
      "creation",
    ].some((token) => current.includes(token))
  ) {
    return "CREATE";
  }

  if (
    [
      "delete",
      "deleted",
      "remove",
      "exclusao",
      "cancel",
      "cancelled",
      "cancelado",
    ].some((token) => current.includes(token))
  ) {
    return "DELETE";
  }

  if (
    ["adjust", "adjustment", "estoque", "stock_adjustment", "inventory_adjustment"].some((token) =>
      current.includes(token)
    )
  ) {
    return "STOCK_ADJUSTMENT";
  }

  if (
    ["transfer", "shipment", "recebimento_transferencia", "transferencia"].some((token) =>
      current.includes(token)
    )
  ) {
    return "TRANSFER";
  }

  if (
    ["count", "inventory_count", "contagem", "cycle_count", "inventario"].some((token) =>
      current.includes(token)
    )
  ) {
    return "COUNT";
  }

  if (["login", "logout", "auth", "signin", "signout", "session"].some((token) => current.includes(token))) {
    return "AUTH";
  }

  return "UPDATE";
}

function normalizeAuditResourceType(value, action = "UPDATE") {
  const current = normalizeAuditToken(value);
  if (["product", "produto"].some((token) => current.includes(token))) return "PRODUCT";
  if (["sku", "variation", "variacao", "variação"].some((token) => current.includes(token))) {
    return "VARIATION";
  }
  if (["movement", "move", "movimentacao", "movimentação", "stock_move"].some((token) => current.includes(token))) {
    return "MOVEMENT";
  }
  if (["transfer", "transferencia", "transferência"].some((token) => current.includes(token))) {
    return "TRANSFER";
  }
  if (["count", "inventory_count", "contagem", "inventario"].some((token) => current.includes(token))) {
    return "COUNT";
  }
  if (["user", "usuario", "usuário", "auth", "session"].some((token) => current.includes(token))) {
    return "USER";
  }
  if (action === "AUTH") return "USER";
  if (action === "TRANSFER") return "TRANSFER";
  if (action === "COUNT") return "COUNT";
  if (action === "STOCK_ADJUSTMENT") return "MOVEMENT";
  return "MOVEMENT";
}

function normalizeAuditSeverity(value, row = {}, action = "UPDATE") {
  const provided = normalizeAuditToken(value);
  if (["critical", "critico", "crítico", "high"].includes(provided)) return "critical";
  if (["warning", "warn", "atencao", "atenção", "medium"].includes(provided)) return "warning";
  if (["info", "informativo", "normal", "low"].includes(provided)) return "info";

  if (action === "STOCK_ADJUSTMENT") return "critical";
  if (action === "DELETE") return "critical";
  if (action === "TRANSFER" && compactAudit(row?.message || row?.summary || "").toLowerCase().includes("cancel")) {
    return "critical";
  }
  if (action === "COUNT") return "warning";
  if (action === "UPDATE") return "warning";
  return "info";
}

function normalizeAuditLogs(rows) {
  return unwrapCollection(rows)
    .map((row, index) => {
      const occurredAt = compactAudit(row.occurred_at || row.created_at || row.timestamp || DateTime.now().toISO());
      const action = normalizeAuditAction(
        row.action || row.action_type || row.event || row.event_type || row.operation
      );
      const resourceType = normalizeAuditResourceType(
        row.resource_type || row.resource || row.entity_type || row.target_type,
        action
      );
      const userId = row.user_id ?? row.actor_id ?? row.created_by ?? row.user?.id ?? null;
      const userName =
        compactAudit(row.user_name || row.actor_name || row.username || row.user?.name) ||
        `Usuario ${userId || "-"}`;
      const resourceId = compactAudit(
        row.resource_id || row.entity_id || row.target_id || row.object_id || row.reference_id || "-"
      );
      const actionDetail = compactAudit(
        row.action_detail || row.event_detail || row.sub_action || row.message || row.summary
      );
      const severity = normalizeAuditSeverity(row.severity, row, action);
      const beforeData = parseAuditJson(row.before || row.before_data || row.old_values || row.before_json);
      const afterData = parseAuditJson(row.after || row.after_data || row.new_values || row.after_json);

      return {
        id: Number(row.id || index + 1),
        occurred_at: DateTime.fromISO(occurredAt).isValid ? occurredAt : DateTime.now().toISO(),
        user_id: userId,
        user_name: userName,
        action,
        action_detail: actionDetail,
        resource_type: resourceType,
        resource_id: resourceId || "-",
        severity,
        origin_ip: compactAudit(row.origin_ip || row.source_ip || row.ip || row.request_ip),
        origin_device: compactAudit(
          row.origin_device || row.device || row.device_info || row.user_agent || row.origin
        ),
        reason: compactAudit(row.reason),
        reference_id: compactAudit(row.reference_id || row.related_id || row.correlation_id),
        notes: compactAudit(row.notes || row.observation || row.comment),
        before_data: beforeData,
        after_data: afterData,
        message: compactAudit(row.message || row.summary || row.description),
      };
    })
    .sort((left, right) => (left.occurred_at < right.occurred_at ? 1 : -1));
}

function buildAuditUsers(logs = []) {
  const map = new Map();
  logs.forEach((log) => {
    const key = String((log.user_id ?? log.user_name) || "").trim();
    if (!key || map.has(key)) return;
    map.set(key, {
      id: key,
      name: compactAudit(log.user_name) || `Usuario ${key}`,
    });
  });
  return Array.from(map.values()).sort((left, right) =>
    String(left.name || "").localeCompare(String(right.name || ""), "pt-BR")
  );
}

function resolveAuditPeriodRange(filters = {}) {
  return resolvePeriodRange(filters);
}

function buildAuditQueryParams(filters = {}, page = 1, pageSize = 250) {
  const params = new URLSearchParams();
  const periodRange = resolveAuditPeriodRange(filters);

  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  params.set("sort", "occurred_at");
  params.set("order", "desc");
  params.set("from_date", periodRange.from.toUTC().toISO());
  params.set("to_date", periodRange.to.toUTC().toISO());

  if (String(filters.userId || "all") !== "all") {
    params.set("user_id", String(filters.userId));
  }

  if (String(filters.action || "all") !== "all") {
    params.set("action", String(filters.action));
  }

  if (String(filters.resourceType || "all") !== "all") {
    params.set("resource_type", String(filters.resourceType));
  }

  if (Boolean(filters.criticalOnly)) {
    params.set("critical_only", "true");
  }

  const query = compactAudit(filters.query);
  if (query) {
    params.set("q", query);
  }

  return params.toString();
}

async function fetchAllAuditLogs(filters = {}, options = {}) {
  const pageSize = Math.max(1, Number(options.pageSize || 250));
  const maxPages = Math.max(1, Number(options.maxPages || 12));
  const rows = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const query = buildAuditQueryParams(filters, page, pageSize);
    const payload = await requestJson(`/audit-logs?${query}`);
    const currentRows = unwrapCollection(payload);
    rows.push(...currentRows);

    const total = Number(payload?.meta?.total || payload?.total || 0);
    if (!currentRows.length || currentRows.length < pageSize) break;
    if (total > 0 && rows.length >= total) break;
  }

  return rows;
}

function buildAuditDemoPayload(reason = "") {
  const dataset = generateMockDataset(9041, {
    days: 180,
    dailyMoveMin: 6,
    dailyMoveMax: 11,
    itemTotal: 160,
  });
  const rng = createAuditSeededRandom(7201);
  const itemById = new Map((dataset.items || []).map((item) => [Number(item.id), item]));
  const users = Array.from(
    new Set([
      ...(dataset.users || []),
      "Nathalia Prado",
      "Gabriel Torres",
      "Eduarda Lima",
      "Thiago Leal",
      "Monica Araujo",
    ])
  )
    .slice(0, 12)
    .map((name, index) => ({
      id: String(1001 + index),
      name,
    }));
  const userByName = new Map(users.map((user) => [String(user.name), user]));
  const logs = [];
  let logId = 1;
  const devices = [
    "Chrome / Windows",
    "Edge / Windows",
    "Safari / iPad",
    "Coletor Zebra TC57",
    "Aplicativo Mobile",
    "Terminal de conferencia",
  ];

  function randomIp() {
    return `${auditRandomInt(rng, 10, 220)}.${auditRandomInt(rng, 0, 255)}.${auditRandomInt(
      rng,
      0,
      255
    )}.${auditRandomInt(rng, 1, 254)}`;
  }

  function randomUser(preferredName = "") {
    if (preferredName && userByName.has(preferredName)) {
      return userByName.get(preferredName);
    }
    return auditPick(rng, users) || users[0];
  }

  function pushLog(row) {
    const occurredAt = compactAudit(row.occurred_at || DateTime.now().toISO());
    logs.push({
      id: logId,
      occurred_at: DateTime.fromISO(occurredAt).isValid ? occurredAt : DateTime.now().toISO(),
      user_id: String(row.user_id || "-"),
      user_name: compactAudit(row.user_name) || "Usuario -",
      action: normalizeAuditAction(row.action),
      action_detail: compactAudit(row.action_detail || row.message || row.summary),
      resource_type: normalizeAuditResourceType(row.resource_type, row.action),
      resource_id: compactAudit(row.resource_id || "-"),
      severity: normalizeAuditSeverity(row.severity, row, row.action),
      origin_ip: compactAudit(row.origin_ip) || randomIp(),
      origin_device: compactAudit(row.origin_device) || auditPick(rng, devices) || devices[0],
      reason: compactAudit(row.reason),
      reference_id: compactAudit(row.reference_id),
      notes: compactAudit(row.notes),
      before_data: row.before_data ?? null,
      after_data: row.after_data ?? null,
      message: compactAudit(row.message || row.summary),
    });
    logId += 1;
  }

  const sampledMoves = (dataset.moves || [])
    .filter((_, index) => index % Math.max(1, Math.floor((dataset.moves || []).length / 260)) === 0)
    .slice(0, 260);

  sampledMoves.forEach((move) => {
    const item = itemById.get(Number(move.sku_id || 0));
    const user = randomUser(move.user_name);
    const qty = Number(move.qty || 0);
    const absQty = Math.abs(qty);
    let action = "UPDATE";
    let resourceType = "MOVEMENT";
    let severity = "info";
    let detail = "Movimentacao registrada";

    if (String(move.move_type || "").toUpperCase() === "ADJUSTMENT") {
      action = "STOCK_ADJUSTMENT";
      severity = absQty >= 20 ? "critical" : "warning";
      detail = "Ajuste manual de estoque";
    } else if (["TRANSFER_SHIP", "TRANSFER_RECEIVE"].includes(String(move.move_type || "").toUpperCase())) {
      action = "TRANSFER";
      resourceType = "TRANSFER";
      severity = "warning";
      detail =
        String(move.move_type || "").toUpperCase() === "TRANSFER_SHIP"
          ? "Transferencia enviada"
          : "Transferencia recebida";
    } else if (String(move.move_type || "").toUpperCase() === "RECEIPT") {
      detail = "Entrada registrada";
    } else if (String(move.move_type || "").toUpperCase() === "ISSUE") {
      detail = "Saida registrada";
    }

    const beforeQty = auditRandomInt(rng, 0, 220);
    const afterQty = Math.max(0, beforeQty + qty);

    pushLog({
      occurred_at: move.occurred_at,
      user_id: user.id,
      user_name: user.name,
      action,
      action_detail: detail,
      resource_type: resourceType,
      resource_id: String(move.id || "-"),
      severity,
      reason: move.reason || "Operacao diaria",
      reference_id: move.reference_id || "",
      message: `${detail} para ${item?.name || `Variacao ${move.sku_id}`}`,
      before_data: {
        sku_id: move.sku_id,
        saldo_sistema: beforeQty,
        tipo_movimento: move.move_type,
      },
      after_data: {
        sku_id: move.sku_id,
        saldo_sistema: afterQty,
        quantidade: qty,
        tipo_movimento: move.move_type,
      },
    });
  });

  (dataset.transfers || []).forEach((transfer) => {
    const user = randomUser();
    const createdAt = DateTime.fromISO(String(transfer.created_at || DateTime.now().toISO()));
    const transferId = String(transfer.id || "-");
    const code = compactAudit(transfer.transfer_code || `TRF-${String(transfer.id || 0).padStart(6, "0")}`);

    pushLog({
      occurred_at: createdAt.isValid ? createdAt.toISO() : DateTime.now().toISO(),
      user_id: user.id,
      user_name: user.name,
      action: "TRANSFER",
      action_detail: "Transferencia criada",
      resource_type: "TRANSFER",
      resource_id: transferId,
      severity: "info",
      reference_id: code,
      message: `Transferencia ${code} criada`,
      before_data: null,
      after_data: {
        status: "DRAFT",
        itens: Number(transfer.qty || transfer.total_qty || 1),
      },
    });

    if (String(transfer.status || "") === "SHIPPED" || String(transfer.status || "") === "RECEIVED") {
      pushLog({
        occurred_at: createdAt.plus({ hours: auditRandomInt(rng, 4, 18) }).toISO(),
        user_id: user.id,
        user_name: user.name,
        action: "TRANSFER",
        action_detail: "Transferencia enviada",
        resource_type: "TRANSFER",
        resource_id: transferId,
        severity: "warning",
        reference_id: code,
        message: `Transferencia ${code} enviada`,
        before_data: { status: "DRAFT" },
        after_data: { status: "SHIPPED" },
      });
    }

    if (String(transfer.status || "") === "RECEIVED") {
      pushLog({
        occurred_at: createdAt.plus({ hours: auditRandomInt(rng, 22, 52) }).toISO(),
        user_id: user.id,
        user_name: user.name,
        action: "TRANSFER",
        action_detail: "Transferencia recebida",
        resource_type: "TRANSFER",
        resource_id: transferId,
        severity: "info",
        reference_id: code,
        message: `Transferencia ${code} recebida`,
        before_data: { status: "SHIPPED" },
        after_data: { status: "RECEIVED" },
      });
    }

    if (String(transfer.status || "") === "CANCELLED") {
      pushLog({
        occurred_at: createdAt.plus({ hours: auditRandomInt(rng, 2, 20) }).toISO(),
        user_id: user.id,
        user_name: user.name,
        action: "TRANSFER",
        action_detail: "Transferencia cancelada",
        resource_type: "TRANSFER",
        resource_id: transferId,
        severity: "critical",
        reference_id: code,
        reason: "Revisao operacional",
        message: `Transferencia ${code} cancelada`,
        before_data: { status: "DRAFT" },
        after_data: { status: "CANCELLED" },
      });
    }
  });

  (dataset.counts || []).forEach((count) => {
    const user = randomUser();
    const startedAt = DateTime.fromISO(String(count.started_at || DateTime.now().toISO()));
    const countId = String(count.id || "-");
    const code = compactAudit(count.count_code || `CNT-${String(count.id || 0).padStart(6, "0")}`);

    pushLog({
      occurred_at: startedAt.isValid ? startedAt.toISO() : DateTime.now().toISO(),
      user_id: user.id,
      user_name: user.name,
      action: "COUNT",
      action_detail: "Contagem iniciada",
      resource_type: "COUNT",
      resource_id: countId,
      severity: "info",
      message: `Contagem ${code} iniciada`,
      before_data: null,
      after_data: { status: "OPEN" },
    });

    if (String(count.status || "") === "CLOSED" || String(count.status || "") === "POSTED") {
      pushLog({
        occurred_at: startedAt.plus({ hours: auditRandomInt(rng, 8, 20) }).toISO(),
        user_id: user.id,
        user_name: user.name,
        action: "COUNT",
        action_detail: "Contagem fechada",
        resource_type: "COUNT",
        resource_id: countId,
        severity: "warning",
        message: `Contagem ${code} fechada`,
        before_data: { status: "OPEN" },
        after_data: { status: "CLOSED" },
      });
    }

    if (String(count.status || "") === "POSTED") {
      pushLog({
        occurred_at: startedAt.plus({ hours: auditRandomInt(rng, 18, 42) }).toISO(),
        user_id: user.id,
        user_name: user.name,
        action: "COUNT",
        action_detail: "Ajustes aplicados",
        resource_type: "COUNT",
        resource_id: countId,
        severity: "warning",
        message: `Ajustes da contagem ${code} aplicados`,
        before_data: { status: "CLOSED" },
        after_data: { status: "POSTED" },
      });
    }

    if (String(count.status || "") === "CANCELLED") {
      pushLog({
        occurred_at: startedAt.plus({ hours: auditRandomInt(rng, 3, 14) }).toISO(),
        user_id: user.id,
        user_name: user.name,
        action: "COUNT",
        action_detail: "Contagem cancelada",
        resource_type: "COUNT",
        resource_id: countId,
        severity: "critical",
        message: `Contagem ${code} cancelada`,
        before_data: { status: "OPEN" },
        after_data: { status: "CANCELLED" },
      });
    }
  });

  for (let index = 0; index < 180; index += 1) {
    const user = randomUser();
    const item = auditPick(rng, dataset.items || []);
    const occurredAt = DateTime.now()
      .minus({ days: auditRandomInt(rng, 0, 179), hours: auditRandomInt(rng, 0, 23), minutes: auditRandomInt(rng, 0, 59) })
      .toISO();
    const roll = rng();

    if (roll < 0.26) {
      pushLog({
        occurred_at: occurredAt,
        user_id: user.id,
        user_name: user.name,
        action: "CREATE",
        action_detail: "Produto criado",
        resource_type: "PRODUCT",
        resource_id: String(item?.id || index + 1),
        severity: "info",
        message: `Cadastro de ${item?.name || `Produto ${index + 1}`}`,
        before_data: null,
        after_data: {
          nome: item?.name || `Produto ${index + 1}`,
          ativo: true,
        },
      });
      continue;
    }

    if (roll < 0.9) {
      const beforePrice = Number((auditRandomInt(rng, 14, 180) + rng()).toFixed(2));
      const delta = Number((auditRandomInt(rng, -18, 24) + rng()).toFixed(2));
      const afterPrice = Number(Math.max(2, beforePrice + delta).toFixed(2));
      pushLog({
        occurred_at: occurredAt,
        user_id: user.id,
        user_name: user.name,
        action: "UPDATE",
        action_detail: "Edicao de cadastro",
        resource_type: rng() < 0.35 ? "VARIATION" : "PRODUCT",
        resource_id: String(item?.id || index + 1),
        severity: Math.abs(delta) > 12 ? "warning" : "info",
        reason: "Atualizacao comercial",
        message: `Atualizacao de ${item?.name || `Produto ${index + 1}`}`,
        before_data: {
          preco: beforePrice,
          ativo: true,
        },
        after_data: {
          preco: afterPrice,
          ativo: true,
        },
      });
      continue;
    }

    pushLog({
      occurred_at: occurredAt,
      user_id: user.id,
      user_name: user.name,
      action: "DELETE",
      action_detail: "Exclusao de cadastro",
      resource_type: rng() < 0.35 ? "VARIATION" : "PRODUCT",
      resource_id: String(item?.id || index + 1),
      severity: "critical",
      reason: "Cadastro duplicado",
      message: `Exclusao de ${item?.name || `Produto ${index + 1}`}`,
      before_data: {
        nome: item?.name || `Produto ${index + 1}`,
        ativo: true,
      },
      after_data: null,
    });
  }

  for (let day = 0; day < 90; day += 1) {
    const loginCount = auditRandomInt(rng, 1, 3);
    for (let index = 0; index < loginCount; index += 1) {
      const user = randomUser();
      const loginAt = DateTime.now()
        .minus({ days: day })
        .set({
          hour: auditRandomInt(rng, 6, 14),
          minute: auditRandomInt(rng, 0, 59),
          second: auditRandomInt(rng, 0, 59),
        });

      pushLog({
        occurred_at: loginAt.toISO(),
        user_id: user.id,
        user_name: user.name,
        action: "AUTH",
        action_detail: "LOGIN",
        resource_type: "USER",
        resource_id: user.id,
        severity: "info",
        message: "Login no sistema",
        before_data: null,
        after_data: {
          status_sessao: "ativa",
        },
      });

      if (rng() > 0.2) {
        pushLog({
          occurred_at: loginAt.plus({ hours: auditRandomInt(rng, 4, 10) }).toISO(),
          user_id: user.id,
          user_name: user.name,
          action: "AUTH",
          action_detail: "LOGOUT",
          resource_type: "USER",
          resource_id: user.id,
          severity: "info",
          message: "Logout no sistema",
          before_data: {
            status_sessao: "ativa",
          },
          after_data: {
            status_sessao: "encerrada",
          },
        });
      }
    }
  }

  const normalizedLogs = normalizeAuditLogs(logs).slice(0, 620);

  return {
    mode: "demo",
    showDemoBanner: true,
    fallbackReason: reason,
    data: {
      source: "demo",
      generated_at: DateTime.now().toISO(),
      action_types: AUDIT_ACTION_TYPES,
      resource_types: AUDIT_RESOURCE_TYPES,
      users: buildAuditUsers(normalizedLogs),
      logs: normalizedLogs,
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

async function loadAuditFromApi(filters = {}, sort = {}) {
  const rawLogs = await fetchAllAuditLogs(filters, { pageSize: 250, maxPages: 12 });
  const logs = normalizeAuditLogs(rawLogs);
  if (sort.order === "asc") {
    logs.reverse();
  }

  return {
    mode: "api",
    showDemoBanner: false,
    fallbackReason: "",
    data: {
      source: "api",
      generated_at: DateTime.now().toISO(),
      action_types: AUDIT_ACTION_TYPES,
      resource_types: AUDIT_RESOURCE_TYPES,
      users: buildAuditUsers(logs),
      logs,
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

const USERS_PERMISSION_MODULES = [
  "dashboard",
  "movements",
  "products",
  "transfers",
  "count",
  "reports",
  "audit",
  "users",
];

const USERS_PERMISSION_ACTIONS = ["view", "create", "edit", "delete"];

function createUsersSeededRandom(seed = 7403) {
  let current = Number(seed) || 1;
  return () => {
    current = (current * 1664525 + 1013904223) % 4294967296;
    return current / 4294967296;
  };
}

function usersRandomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function compactUsers(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeRoleCode(value) {
  return compactUsers(value).toUpperCase().replace(/[^\w]+/g, "_");
}

function emptyPermissionsMatrix() {
  const matrix = {};
  USERS_PERMISSION_MODULES.forEach((moduleKey) => {
    matrix[moduleKey] = {};
    USERS_PERMISSION_ACTIONS.forEach((actionKey) => {
      matrix[moduleKey][actionKey] = false;
    });
  });
  return matrix;
}

function normalizeRolePermissions(rawPermissions = null) {
  const matrix = emptyPermissionsMatrix();
  if (!rawPermissions || typeof rawPermissions !== "object") {
    return matrix;
  }
  USERS_PERMISSION_MODULES.forEach((moduleKey) => {
    USERS_PERMISSION_ACTIONS.forEach((actionKey) => {
      matrix[moduleKey][actionKey] = Boolean(rawPermissions?.[moduleKey]?.[actionKey]);
    });
  });
  return matrix;
}

function defaultRoleTemplates() {
  return [
    {
      id: 1,
      code: "ADMIN",
      name: "Administrador",
      permissions: USERS_PERMISSION_MODULES.reduce((acc, moduleKey) => {
        acc[moduleKey] = {
          view: true,
          create: true,
          edit: true,
          delete: true,
        };
        return acc;
      }, {}),
    },
    {
      id: 2,
      code: "MANAGER",
      name: "Gerente",
      permissions: {
        dashboard: { view: true, create: false, edit: false, delete: false },
        movements: { view: true, create: true, edit: true, delete: false },
        products: { view: true, create: true, edit: true, delete: false },
        transfers: { view: true, create: true, edit: true, delete: false },
        count: { view: true, create: true, edit: true, delete: false },
        reports: { view: true, create: false, edit: false, delete: false },
        audit: { view: true, create: false, edit: false, delete: false },
        users: { view: true, create: false, edit: true, delete: false },
      },
    },
    {
      id: 3,
      code: "OPERATOR",
      name: "Operador",
      permissions: {
        dashboard: { view: true, create: false, edit: false, delete: false },
        movements: { view: true, create: true, edit: false, delete: false },
        products: { view: true, create: false, edit: false, delete: false },
        transfers: { view: true, create: true, edit: false, delete: false },
        count: { view: true, create: true, edit: true, delete: false },
        reports: { view: false, create: false, edit: false, delete: false },
        audit: { view: false, create: false, edit: false, delete: false },
        users: { view: false, create: false, edit: false, delete: false },
      },
    },
    {
      id: 4,
      code: "AUDITOR",
      name: "Auditor",
      permissions: {
        dashboard: { view: true, create: false, edit: false, delete: false },
        movements: { view: true, create: false, edit: false, delete: false },
        products: { view: true, create: false, edit: false, delete: false },
        transfers: { view: true, create: false, edit: false, delete: false },
        count: { view: true, create: false, edit: false, delete: false },
        reports: { view: true, create: false, edit: false, delete: false },
        audit: { view: true, create: false, edit: false, delete: false },
        users: { view: true, create: false, edit: false, delete: false },
      },
    },
  ];
}

function normalizeRoles(rows = []) {
  const sourceRows = unwrapCollection(rows);
  const defaults = defaultRoleTemplates();
  const fallbackByCode = new Map(defaults.map((role) => [role.code, role]));
  return sourceRows
    .map((role, index) => {
      const code = normalizeRoleCode(role.code || role.role_code || role.name || `ROLE_${index + 1}`);
      const fallback = fallbackByCode.get(code);
      return {
        id: Number(role.id || role.role_id || index + 1),
        code,
        name: compactUsers(role.name || role.display_name || fallback?.name || code),
        permissions: normalizeRolePermissions(role.permissions || fallback?.permissions),
      };
    })
    .filter((role) => role.id > 0);
}

function normalizeRecentActions(rawActions = [], seedLabel = "Acao registrada") {
  if (!Array.isArray(rawActions) || !rawActions.length) {
    return [];
  }
  return rawActions
    .slice(0, 12)
    .map((action, index) => ({
      id: action.id || `${index + 1}`,
      label: compactUsers(action.label || action.action || action.message || seedLabel),
      at: action.at || action.occurred_at || action.created_at || DateTime.now().toISO(),
    }));
}

function normalizeUsers(rows = [], roles = []) {
  const roleMap = new Map((roles || []).map((role) => [Number(role.id), role]));
  return unwrapCollection(rows)
    .map((user, index) => {
      const roleId = Number(
        user.role_id ||
          user.role?.id ||
          user.roleId ||
          (typeof user.role === "string"
            ? roles.find((role) => normalizeRoleCode(role.code) === normalizeRoleCode(user.role))?.id
            : null) ||
          0
      );
      const role = roleMap.get(roleId) || null;
      const name = compactUsers(
        user.name || user.full_name || user.fullName || user.username || `Usuario ${index + 1}`
      );
      const email = compactUsers(user.email || `${name.toLowerCase().replace(/\s+/g, ".")}@freeshop.local`);
      const isActive =
        user.is_active != null
          ? Boolean(user.is_active)
          : user.active != null
          ? Boolean(user.active)
          : user.status != null
          ? String(user.status).toLowerCase() !== "inactive"
          : true;
      const lastLogin = user.last_login_at || user.last_access_at || user.last_seen_at || null;
      const createdAt = user.created_at || user.createdAt || DateTime.now().minus({ days: 120 }).toISO();
      const recentActions = normalizeRecentActions(user.recent_actions || user.actions || []);

      return {
        id: Number(user.id || user.user_id || index + 1),
        name,
        email,
        role_id: Number.isFinite(roleId) && roleId > 0 ? roleId : null,
        role_code: role?.code || "",
        role_name: role?.name || "",
        is_admin: String(role?.code || "").toUpperCase() === "ADMIN",
        is_active: isActive,
        created_at: createdAt,
        last_login_at: lastLogin,
        recent_actions: recentActions,
      };
    })
    .filter((row) => row.id > 0);
}

function buildUsersDemoPayload(reason = "") {
  const rng = createUsersSeededRandom(11803);
  const baseRoles = defaultRoleTemplates().map((role) => ({
    ...role,
    permissions: normalizeRolePermissions(role.permissions),
  }));
  const firstNames = [
    "Marina",
    "Lucas",
    "Camila",
    "Rodrigo",
    "Bianca",
    "Fernando",
    "Julia",
    "Rafael",
    "Patricia",
    "Guilherme",
    "Larissa",
    "Thiago",
    "Priscila",
    "Renato",
    "Amanda",
    "Matheus",
  ];
  const lastNames = [
    "Santos",
    "Oliveira",
    "Silva",
    "Costa",
    "Souza",
    "Ribeiro",
    "Moura",
    "Lopes",
    "Almeida",
    "Rocha",
    "Mendes",
  ];
  const actionLabels = [
    "Acesso ao dashboard",
    "Edicao de produto",
    "Aprovacao de transferencia",
    "Conferencia de contagem",
    "Download de relatorio",
    "Atualizacao de permissao",
  ];

  const users = [];
  const now = DateTime.now();
  for (let index = 1; index <= 64; index += 1) {
    const first = firstNames[usersRandomInt(rng, 0, firstNames.length - 1)];
    const last = lastNames[usersRandomInt(rng, 0, lastNames.length - 1)];
    const role = baseRoles[usersRandomInt(rng, 0, baseRoles.length - 1)];
    const active = rng() > 0.18;
    const createdAt = now.minus({
      days: usersRandomInt(rng, 45, 420),
      hours: usersRandomInt(rng, 0, 23),
      minutes: usersRandomInt(rng, 0, 59),
    });
    const lastLoginAt = active
      ? now.minus({
          days: usersRandomInt(rng, 0, 95),
          hours: usersRandomInt(rng, 0, 23),
          minutes: usersRandomInt(rng, 0, 59),
        })
      : null;
    const actionsCount = usersRandomInt(rng, 1, 4);
    const recentActions = [];
    for (let actionIndex = 0; actionIndex < actionsCount; actionIndex += 1) {
      const at = now.minus({
        days: usersRandomInt(rng, 0, 30),
        hours: usersRandomInt(rng, 0, 23),
        minutes: usersRandomInt(rng, 0, 59),
      });
      recentActions.push({
        id: `${index}-${actionIndex + 1}`,
        label: actionLabels[usersRandomInt(rng, 0, actionLabels.length - 1)],
        at: at.toISO(),
      });
    }
    recentActions.sort((left, right) => (left.at < right.at ? 1 : -1));

    const name = `${first} ${last}`;
    users.push({
      id: index,
      name,
      email: `${normalizeRoleCode(name).toLowerCase().replace(/_/g, ".")}@freeshop.local`,
      role_id: role.id,
      role_code: role.code,
      role_name: role.name,
      is_admin: role.code === "ADMIN",
      is_active: active,
      created_at: createdAt.toISO(),
      last_login_at: lastLoginAt ? lastLoginAt.toISO() : null,
      recent_actions: recentActions,
    });
  }

  return {
    mode: "demo",
    showDemoBanner: true,
    fallbackReason: reason,
    data: {
      source: "demo",
      generated_at: DateTime.now().toISO(),
      users,
      roles: baseRoles,
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

async function loadUsersFromApi() {
  const [usersPayload, rolesPayload] = await Promise.all([requestJson("/users"), requestJson("/roles")]);
  const roles = normalizeRoles(rolesPayload);
  const safeRoles = roles.length
    ? roles
    : defaultRoleTemplates().map((role) => ({
        ...role,
        permissions: normalizeRolePermissions(role.permissions),
      }));
  const users = normalizeUsers(usersPayload, safeRoles);
  return {
    mode: "api",
    showDemoBanner: false,
    fallbackReason: "",
    data: {
      source: "api",
      generated_at: DateTime.now().toISO(),
      users,
      roles: safeRoles,
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

function resolveSystemMode(env, apiOnline) {
  const normalizedEnv = String(env || "").trim();
  if (normalizedEnv) {
    return inferModeFromEnv(normalizedEnv);
  }
  return apiOnline ? "production" : "demo";
}

function buildDashboardAuthRequiredPayload({ apiOnline, dbOnline, env, reason = "" }) {
  const message = reason || "Faca login para carregar os dados protegidos.";
  const mode = resolveSystemMode(env, apiOnline);
  return {
    mode: "api",
    showDemoBanner: false,
    fallbackReason: message,
    authRequired: true,
    authMessage: message,
    systemStatus: {
      api: apiOnline ? "online" : "offline",
      db: dbOnline ? "online" : "offline",
      mode,
      env: env || "unknown",
    },
    data: {
      source: "api",
      generated_at: new Date().toISOString(),
      branches: [],
      locations: [],
      items: [],
      balances: [],
      moves: [],
      alerts: [],
      transfers: [],
      counts: [],
      users: [],
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

async function loadFromApi() {
  const systemSnapshot = await loadSystemStatusSnapshot();
  const healthPayload = systemSnapshot.healthPayload || {};
  const apiOnline = Boolean(systemSnapshot.apiOnline);
  const dbOnline = Boolean(systemSnapshot.dbOnline);
  const env = healthPayload?.env || "unknown";
  const inferredMode = resolveSystemMode(env, apiOnline);

  if (!apiOnline) {
    throw new Error("Falha ao consultar /health.");
  }

  if (!hasAuthToken()) {
    return buildDashboardAuthRequiredPayload({
      apiOnline,
      dbOnline,
      env,
      reason: "Faca login para consultar dados de estoque.",
    });
  }

  try {
    await ensureAuthenticatedSession();

    const [branches, locations, balances, recentMoves] = await Promise.all([
      requestJson("/branches", { auth: "required" }),
      requestJson("/locations", { auth: "required" }),
      requestJson("/stock/balances?page=1&page_size=200&order=desc", { auth: "required" }),
      requestJson("/stock/moves?page=1&page_size=20&order=desc", { auth: "required" }),
    ]);

    const [moreMoves, skus, transfers, counts] = await Promise.all([
      optionalJson("/stock/moves?page=1&page_size=200&order=desc"),
      optionalJson("/skus?page=1&page_size=200&order=asc"),
      optionalJson("/stock/transfers?page=1&page_size=50&order=desc"),
      optionalJson("/stock/inventory-counts?page=1&page_size=50&order=desc"),
    ]);

    const moves = normalizeMoves(unwrapCollection(moreMoves).length ? moreMoves : recentMoves);
    const normalizedBranches = normalizeBranches(branches);
    const normalizedLocations = normalizeLocations(locations);
    const normalizedBalances = unwrapCollection(balances);

    const items = buildItemsFromApi({ skus, balances: normalizedBalances, moves });
    const normalizedTransfers = unwrapCollection(transfers);
    const normalizedCounts = unwrapCollection(counts);
    const alerts = deriveAlertsFromApi({
      balances: normalizedBalances,
      items,
      transfers: normalizedTransfers,
      counts: normalizedCounts,
    });

    return {
      mode: "api",
      showDemoBanner: false,
      fallbackReason: "",
      authRequired: false,
      authMessage: "",
      systemStatus: {
        api: apiOnline ? "online" : "offline",
        db: dbOnline ? "online" : "offline",
        mode: inferredMode,
        env,
      },
      data: {
        source: "api",
        generated_at: new Date().toISOString(),
        branches: normalizedBranches,
        locations: normalizedLocations,
        items,
        balances: normalizedBalances,
        moves,
        alerts,
        transfers: normalizedTransfers,
        counts: normalizedCounts,
        users: normalizeUsersFromMoves(moves),
      },
      lastUpdatedIso: new Date().toISOString(),
    };
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) {
      const message =
        error?.status === 403
          ? "Permissao insuficiente para consultar dados do dashboard."
          : "Sessao invalida. Faca login para continuar.";
      return buildDashboardAuthRequiredPayload({
        apiOnline,
        dbOnline,
        env,
        reason: message,
      });
    }
    throw error;
  }
}

function buildDemoPayload(reason = "") {
  return {
    mode: "demo",
    showDemoBanner: true,
    fallbackReason: reason,
    authRequired: false,
    authMessage: "",
    systemStatus: {
      api: "offline",
      db: "offline",
      mode: "demo",
      env: "demo",
    },
    data: generateMockDataset(42),
    lastUpdatedIso: new Date().toISOString(),
  };
}

function buildMovementsTypeQuery(filterType) {
  if (filterType === "entry") return "RECEIPT";
  if (filterType === "issue") return "ISSUE";
  if (filterType === "adjustment") return "ADJUSTMENT";
  return null;
}

function buildMovementsQuery(filters = {}) {
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("page_size", "500");
  params.set("sort", "occurred_at");
  params.set("order", "desc");

  if (String(filters.branchId || "all") !== "all") {
    params.set("branch_id", String(filters.branchId));
  }

  if (String(filters.locationId || "all") !== "all") {
    params.set("location_id", String(filters.locationId));
  }

  const type = buildMovementsTypeQuery(String(filters.type || "all"));
  if (type) {
    params.set("type", type);
  }

  const itemQuery = String(filters.itemQuery || "").trim();
  if (itemQuery) {
    params.set("q", itemQuery);
  }

  const periodRange = resolvePeriodRange(filters);
  params.set("from_date", periodRange.from.toUTC().toISO());
  params.set("to_date", periodRange.to.toUTC().toISO());

  return params.toString();
}

function buildMovementsDemoPayload(reason = "") {
  const dataset = generateMockDataset(77, {
    days: 90,
    dailyMoveMin: 3,
    dailyMoveMax: 6,
    itemTotal: 56,
  });
  const users =
    (dataset.users || []).map((userName, index) => ({
      id: index + 1,
      name: userName,
    })) || [];

  return {
    mode: "demo",
    showDemoBanner: true,
    fallbackReason: reason,
    permissionDenied: false,
    permissionMessage: "",
    data: {
      source: "demo",
      generated_at: DateTime.now().toISO(),
      branches: dataset.branches || [],
      locations: dataset.locations || [],
      items: dataset.items || [],
      balances: dataset.balances || [],
      moves: dataset.moves || [],
      users,
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

function buildMovementsPermissionPayload(error) {
  const message =
    error?.status === 403
      ? "Permissao insuficiente para consultar movimentacoes."
      : "Sessao invalida. Faca login para consultar movimentacoes.";

  return {
    mode: "api",
    showDemoBanner: false,
    fallbackReason: error?.message || message,
    permissionDenied: true,
    permissionMessage: message,
    data: {
      source: "api",
      generated_at: DateTime.now().toISO(),
      branches: [],
      locations: [],
      items: [],
      balances: [],
      moves: [],
      users: [],
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

async function loadMovementsFromApi(filters = {}) {
  if (!hasAuthToken()) {
    throw buildAuthRequiredError("/stock/moves", "GET", "Faca login para consultar movimentacoes.");
  }

  await ensureAuthenticatedSession();

  const query = buildMovementsQuery(filters);

  const [branches, locations, moves, balances, skus] = await Promise.all([
    requestJson("/branches", { auth: "required" }),
    requestJson("/locations", { auth: "required" }),
    requestJson(`/stock/moves?${query}`, { auth: "required" }),
    optionalJson("/stock/balances?page=1&page_size=350&order=desc"),
    optionalJson("/skus?page=1&page_size=250&order=asc"),
  ]);

  const normalizedBranches = normalizeBranches(branches);
  const normalizedLocations = normalizeLocations(locations);
  const normalizedMoves = normalizeMoves(moves);
  const normalizedBalances = unwrapCollection(balances);
  const items = buildItemsFromApi({
    skus,
    balances: normalizedBalances,
    moves: normalizedMoves,
  });
  const users = normalizeUsersFromMoves(normalizedMoves);

  return {
    mode: "api",
    showDemoBanner: false,
    fallbackReason: "",
    permissionDenied: false,
    permissionMessage: "",
    data: {
      source: "api",
      generated_at: DateTime.now().toISO(),
      branches: normalizedBranches,
      locations: normalizedLocations,
      items,
      balances: normalizedBalances,
      moves: normalizedMoves,
      users,
    },
    lastUpdatedIso: new Date().toISOString(),
  };
}

export async function loadDashboardPayload() {
  const startedAt = Date.now();

  try {
    const payload = await loadFromApi();
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }
    return payload;
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }

    return buildDemoPayload(error instanceof Error ? error.message : "Falha desconhecida");
  }
}

export async function loadMovementsPayload(filters = {}) {
  const startedAt = Date.now();

  try {
    const payload = await loadMovementsFromApi(filters);
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }
    return payload;
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }

    if (error?.status === 401 || error?.status === 403) {
      return buildMovementsPermissionPayload(error);
    }

    return buildMovementsDemoPayload(
      error instanceof Error ? error.message : "Falha ao consultar movimentações"
    );
  }
}

export async function loadTransfersPayload(filters = {}, sort = {}) {
  const startedAt = Date.now();

  try {
    const payload = await loadTransfersFromApi(filters, sort);
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }
    return payload;
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }

    return buildTransfersDemoPayload(
      error instanceof Error ? error.message : "Falha ao consultar transferencias"
    );
  }
}

export async function loadInventoryCountsPayload(filters = {}, sort = {}) {
  const startedAt = Date.now();

  try {
    const payload = await loadInventoryCountsFromApi(filters, sort);
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }
    return payload;
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }

    return buildInventoryCountsDemoPayload(
      error instanceof Error ? error.message : "Falha ao consultar contagens"
    );
  }
}

export async function loadReportsPayload(filters = {}) {
  const startedAt = Date.now();

  try {
    const payload = await loadReportsFromApi(filters);
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }
    return payload;
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }

    return buildReportsDemoPayload(
      error instanceof Error ? error.message : "Falha ao consultar relatorios"
    );
  }
}

export async function loadAuditPayload(filters = {}, sort = {}) {
  const startedAt = Date.now();

  try {
    const payload = await loadAuditFromApi(filters, sort);
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }
    return payload;
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }

    return buildAuditDemoPayload(
      error instanceof Error ? error.message : "Falha ao consultar auditoria"
    );
  }
}

export async function loadProductsPayload(filters = {}, sort = {}) {
  const startedAt = Date.now();

  try {
    const payload = await loadProductsFromApi(filters, sort);
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }
    return payload;
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }

    return buildProductsDemoPayload(
      error instanceof Error ? error.message : "Falha ao consultar produtos"
    );
  }
}

export async function loadVariationsPayload(filters = {}, sort = {}) {
  const startedAt = Date.now();

  try {
    const payload = await loadVariationsFromApi(filters, sort);
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }
    return payload;
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }

    return buildVariationsDemoPayload(
      error instanceof Error ? error.message : "Falha ao consultar variacoes"
    );
  }
}

export async function loadUsersPayload(filters = {}, sort = {}) {
  const startedAt = Date.now();

  try {
    const payload = await loadUsersFromApi(filters, sort);
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }
    return payload;
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await sleep(MIN_LOADING_MS - elapsed);
    }

    return buildUsersDemoPayload(
      error instanceof Error ? error.message : "Falha ao consultar usuarios"
    );
  }
}

function serializeOccurrenceDate(iso) {
  const parsed = DateTime.fromISO(String(iso || ""));
  if (!parsed.isValid) return null;
  return parsed.toISO();
}

export async function createStockMovement(payload) {
  const moveCategory = String(payload.moveCategory || "");
  const common = {
    branch_id: Number(payload.branchId),
    sku_id: Number(payload.itemId),
    location_id: payload.locationId ? Number(payload.locationId) : null,
    reason: payload.reason || null,
    reference_id: payload.referenceId || null,
    occurred_at: serializeOccurrenceDate(payload.occurredAtIso),
  };

  if (moveCategory === "entry") {
    const created = await requestJson("/stock/receipts", {
      method: "POST",
      body: {
        ...common,
        qty: Number(payload.quantity),
      },
    });
    return normalizeMoves([created])[0];
  }

  if (moveCategory === "issue") {
    const created = await requestJson("/stock/issues", {
      method: "POST",
      body: {
        ...common,
        qty: Number(payload.quantity),
      },
    });
    return normalizeMoves([created])[0];
  }

  if (moveCategory === "adjustment") {
    const created = await requestJson("/stock/adjustments", {
      method: "POST",
      body: {
        ...common,
        qty_delta: Number(payload.quantityDelta),
      },
    });
    return normalizeMoves([created])[0];
  }

  throw new Error("Tipo de movimentação inválido.");
}

function normalizeSingleTransfer(row) {
  const normalized = normalizeTransfers([row], []);
  return normalized[0] || null;
}

export async function createTransfer(payload) {
  const created = await requestJson("/stock/transfers", {
    method: "POST",
    body: {
      from_branch_id: Number(payload.from_branch_id),
      from_location_id: Number(payload.from_location_id),
      to_branch_id: Number(payload.to_branch_id),
      to_location_id: Number(payload.to_location_id),
      note: payload.note || null,
      items: (payload.items || []).map((item) => ({
        sku_id: Number(item.sku_id),
        qty: Number(item.qty),
      })),
    },
  });

  return normalizeSingleTransfer(created);
}

export async function shipTransfer(transferId) {
  const shipped = await requestJson(`/stock/transfers/${transferId}/ship`, {
    method: "POST",
  });
  return normalizeSingleTransfer(shipped);
}

export async function receiveTransfer(transferId) {
  const received = await requestJson(`/stock/transfers/${transferId}/receive`, {
    method: "POST",
  });
  return normalizeSingleTransfer(received);
}

export async function cancelTransfer(transferId) {
  const cancelled = await requestJson(`/stock/transfers/${transferId}/cancel`, {
    method: "POST",
  });
  return normalizeSingleTransfer(cancelled);
}

function normalizeSingleInventoryCount(row) {
  return normalizeInventoryCount(row, [], new Map(), "CNT");
}

export async function createInventoryCount(payload) {
  const created = await requestJson("/stock/inventory-counts", {
    method: "POST",
    body: {
      branch_id: Number(payload.branch_id),
      location_id: Number(payload.location_id),
      scope: payload.scope || "ALL",
      sku_ids: Array.isArray(payload.sku_ids)
        ? payload.sku_ids.map((skuId) => Number(skuId))
        : null,
    },
  });
  return normalizeSingleInventoryCount(created);
}

export async function patchInventoryCountLines(countId, lines) {
  const updated = await requestJson(`/stock/inventory-counts/${countId}/lines`, {
    method: "PATCH",
    body: {
      lines: (lines || []).map((line) => ({
        sku_id: Number(line.sku_id),
        counted_qty: Number(line.counted_qty),
      })),
    },
  });
  return normalizeSingleInventoryCount(updated);
}

export async function closeInventoryCount(countId) {
  const closed = await requestJson(`/stock/inventory-counts/${countId}/close`, {
    method: "POST",
  });
  return normalizeSingleInventoryCount(closed);
}

export async function postInventoryCount(countId) {
  const posted = await requestJson(`/stock/inventory-counts/${countId}/post`, {
    method: "POST",
  });
  return normalizeSingleInventoryCount(posted);
}

export async function cancelInventoryCount(countId) {
  const cancelled = await requestJson(`/stock/inventory-counts/${countId}/cancel`, {
    method: "POST",
  });
  return normalizeSingleInventoryCount(cancelled);
}
