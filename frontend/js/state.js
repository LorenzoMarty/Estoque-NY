export const ROUTES = [
  { id: "dashboard", icon: "layout-dashboard", navKey: "dashboard", section: "operation", complete: true },
  { id: "movimentacoes", icon: "shuffle", navKey: "movements", section: "operation", complete: true },
  { id: "produtos", icon: "package", navKey: "products", section: "operation", complete: true },
  { id: "variacoes", icon: "barcode", navKey: "variations", section: "operation", complete: true },
  { id: "transferencias", icon: "arrow-right-left", navKey: "transfers", section: "operation", complete: true },
  { id: "contagem", icon: "clipboard-check", navKey: "inventory_count", section: "operation", complete: true },
  { id: "relatorios", icon: "bar-chart-3", navKey: "reports", section: "operation", complete: true },
  { id: "auditoria", icon: "shield-check", navKey: "audit", section: "operation", complete: true },
  { id: "cadastros", icon: "folder", navKey: "cadastros", section: "cadastros", complete: true },
  { id: "usuarios", icon: "users", navKey: "users", section: "settings", complete: true },
  { id: "login", icon: "log-in", navKey: "login", section: "settings", hidden: true, complete: true },
];

function isoDateDaysAgo(daysAgo = 0) {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

const todayIso = isoDateDaysAgo(0);
const thirtyDaysAgoIso = isoDateDaysAgo(29);

function createMovementsFiltersDefaults() {
  return {
    branchId: "all",
    locationId: "all",
    period: "30",
    customFrom: thirtyDaysAgoIso,
    customTo: todayIso,
    type: "all",
    itemQuery: "",
    userId: "all",
    qtyMin: "",
    qtyMax: "",
    reason: "",
  };
}

export const MOVEMENT_FILTER_DEFAULTS = Object.freeze(createMovementsFiltersDefaults());

function createProductsFiltersDefaults() {
  return {
    status: "all",
    categoryId: "all",
    brandId: "all",
    branchId: "all",
    searchQuery: "",
    createdFrom: "",
    createdTo: "",
  };
}

export const PRODUCT_FILTER_DEFAULTS = Object.freeze(createProductsFiltersDefaults());

function createVariationsFiltersDefaults() {
  return {
    productId: "all",
    status: "all",
    priceMin: "",
    priceMax: "",
    costMin: "",
    costMax: "",
    hasBarcode: "all",
    searchQuery: "",
    attributes: {},
  };
}

export const VARIATION_FILTER_DEFAULTS = Object.freeze(createVariationsFiltersDefaults());

function createTransfersFiltersDefaults() {
  return {
    status: "all",
    fromBranchId: "all",
    toBranchId: "all",
    period: "30",
    customFrom: thirtyDaysAgoIso,
    customTo: todayIso,
    productQuery: "",
    delayedOnly: false,
  };
}

export const TRANSFER_FILTER_DEFAULTS = Object.freeze(createTransfersFiltersDefaults());

function createInventoryCountFiltersDefaults() {
  return {
    status: "all",
    branchId: "all",
    locationId: "all",
    period: "30",
    customFrom: thirtyDaysAgoIso,
    customTo: todayIso,
    responsible: "all",
    divergenceOnly: false,
  };
}

export const INVENTORY_COUNT_FILTER_DEFAULTS = Object.freeze(createInventoryCountFiltersDefaults());

function createReportsFiltersDefaults() {
  return {
    branchId: "all",
    period: "30",
    customFrom: thirtyDaysAgoIso,
    customTo: todayIso,
    categoryId: "all",
    productId: "all",
  };
}

export const REPORT_FILTER_DEFAULTS = Object.freeze(createReportsFiltersDefaults());

function createAuditFiltersDefaults() {
  return {
    userId: "all",
    action: "all",
    resourceType: "all",
    period: "30",
    customFrom: thirtyDaysAgoIso,
    customTo: todayIso,
    criticalOnly: false,
    query: "",
  };
}

export const AUDIT_FILTER_DEFAULTS = Object.freeze(createAuditFiltersDefaults());

function createUsersFiltersDefaults() {
  return {
    status: "all",
    roleId: "all",
    period: "30",
    customFrom: thirtyDaysAgoIso,
    customTo: todayIso,
    adminsOnly: false,
    query: "",
  };
}

export const USER_FILTER_DEFAULTS = Object.freeze(createUsersFiltersDefaults());

export const state = {
  route: "dashboard",
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  globalSearch: "",
  dashboard: {
    loading: true,
    demoMode: true,
    showDemoBanner: false,
    fallbackReason: "",
    authRequired: false,
    authMessage: "",
    data: null,
    lastUpdatedIso: null,
    systemStatus: {
      api: "offline",
      db: "offline",
      mode: "demo",
      env: "demo",
    },
    filters: {
      branchId: "all",
      period: "30",
      customFrom: todayIso,
      customTo: todayIso,
      moveType: "all",
    },
    pagination: {
      movesPage: 1,
      pageSize: 8,
    },
  },
  movements: {
    loading: false,
    loaded: false,
    mode: "demo",
    demoMode: true,
    showDemoBanner: false,
    fallbackReason: "",
    permissionDenied: false,
    permissionMessage: "",
    data: null,
    lastUpdatedIso: null,
    filters: createMovementsFiltersDefaults(),
    pagination: {
      page: 1,
      pageSize: 20,
    },
    sort: {
      key: "occurred_at",
      order: "desc",
    },
    ui: {
      filtersCollapsed: false,
    },
  },
  products: {
    loading: false,
    loaded: false,
    mode: "demo",
    demoMode: true,
    showDemoBanner: false,
    fallbackReason: "",
    data: null,
    lastUpdatedIso: null,
    filters: createProductsFiltersDefaults(),
    pagination: {
      page: 1,
      pageSize: 25,
    },
    sort: {
      key: "name",
      order: "asc",
    },
    ui: {
      filtersCollapsed: false,
      selectedProductId: null,
    },
  },
  variations: {
    loading: false,
    loaded: false,
    mode: "demo",
    demoMode: true,
    showDemoBanner: false,
    fallbackReason: "",
    data: null,
    lastUpdatedIso: null,
    filters: createVariationsFiltersDefaults(),
    pagination: {
      page: 1,
      pageSize: 20,
    },
    sort: {
      key: "name",
      order: "asc",
    },
    ui: {
      filtersCollapsed: false,
      selectedVariationId: null,
    },
  },
  transfers: {
    loading: false,
    loaded: false,
    mode: "demo",
    demoMode: true,
    showDemoBanner: false,
    fallbackReason: "",
    data: null,
    lastUpdatedIso: null,
    filters: createTransfersFiltersDefaults(),
    pagination: {
      page: 1,
      pageSize: 12,
    },
    sort: {
      key: "created_at",
      order: "desc",
    },
    ui: {
      filtersCollapsed: false,
    },
  },
  inventoryCount: {
    loading: false,
    loaded: false,
    mode: "demo",
    demoMode: true,
    showDemoBanner: false,
    fallbackReason: "",
    data: null,
    lastUpdatedIso: null,
    filters: createInventoryCountFiltersDefaults(),
    pagination: {
      page: 1,
      pageSize: 10,
    },
    sort: {
      key: "started_at",
      order: "desc",
    },
    ui: {
      filtersCollapsed: false,
      activeCountId: null,
    },
  },
  reports: {
    loading: false,
    loaded: false,
    mode: "demo",
    demoMode: true,
    showDemoBanner: false,
    fallbackReason: "",
    data: null,
    lastUpdatedIso: null,
    filters: createReportsFiltersDefaults(),
    ui: {},
  },
  audit: {
    loading: false,
    loaded: false,
    mode: "demo",
    demoMode: true,
    showDemoBanner: false,
    fallbackReason: "",
    data: null,
    lastUpdatedIso: null,
    filters: createAuditFiltersDefaults(),
    pagination: {
      page: 1,
      pageSize: 20,
    },
    sort: {
      key: "occurred_at",
      order: "desc",
    },
    ui: {
      filtersCollapsed: false,
    },
  },
  users: {
    loading: false,
    loaded: false,
    mode: "demo",
    demoMode: true,
    showDemoBanner: false,
    fallbackReason: "",
    data: null,
    lastUpdatedIso: null,
    filters: createUsersFiltersDefaults(),
    pagination: {
      page: 1,
      pageSize: 12,
    },
    sort: {
      key: "name",
      order: "asc",
    },
    ui: {
      filtersCollapsed: false,
    },
  },
};

const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setRoute(route) {
  state.route = route;
  if (state.mobileSidebarOpen) {
    state.mobileSidebarOpen = false;
  }
  emit();
}

export function setSidebarCollapsed(value) {
  state.sidebarCollapsed = Boolean(value);
  emit();
}

export function toggleSidebarCollapsed() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  emit();
}

export function setMobileSidebarOpen(value) {
  state.mobileSidebarOpen = Boolean(value);
  emit();
}

export function setGlobalSearch(value) {
  state.globalSearch = value.trim();
  state.dashboard.pagination.movesPage = 1;
  emit();
}

export function setDashboardLoading(value) {
  state.dashboard.loading = Boolean(value);
  emit();
}

export function setDashboardPayload(payload) {
  state.dashboard.loading = false;
  state.dashboard.data = payload.data;
  state.dashboard.demoMode = payload.mode === "demo";
  state.dashboard.showDemoBanner = Boolean(payload.showDemoBanner);
  state.dashboard.fallbackReason = payload.fallbackReason || "";
  state.dashboard.authRequired = Boolean(payload.authRequired);
  state.dashboard.authMessage = payload.authMessage || "";
  state.dashboard.systemStatus = payload.systemStatus;
  state.dashboard.lastUpdatedIso = payload.lastUpdatedIso;
  state.dashboard.pagination.movesPage = 1;
  emit();
}

export function updateDashboardFilter(filterKey, value) {
  state.dashboard.filters[filterKey] = value;
  if (filterKey !== "customFrom" && filterKey !== "customTo") {
    state.dashboard.pagination.movesPage = 1;
  }
  emit();
}

export function setMovesPage(page) {
  state.dashboard.pagination.movesPage = page;
  emit();
}

export function mutateDashboardData(mutator) {
  if (!state.dashboard.data) {
    return;
  }
  mutator(state.dashboard.data);
  state.dashboard.lastUpdatedIso = new Date().toISOString();
  emit();
}

export function setMovementsLoading(value) {
  state.movements.loading = Boolean(value);
  emit();
}

export function setMovementsPayload(payload) {
  state.movements.loading = false;
  state.movements.loaded = true;
  state.movements.mode = payload.mode || "demo";
  state.movements.demoMode = payload.mode === "demo";
  state.movements.showDemoBanner = Boolean(payload.showDemoBanner);
  state.movements.fallbackReason = payload.fallbackReason || "";
  state.movements.permissionDenied = Boolean(payload.permissionDenied);
  state.movements.permissionMessage = payload.permissionMessage || "";
  state.movements.data = payload.data;
  state.movements.lastUpdatedIso = payload.lastUpdatedIso || new Date().toISOString();
  state.movements.pagination.page = 1;
  emit();
}

export function updateMovementsFilter(filterKey, value, options = {}) {
  state.movements.filters[filterKey] = value;
  if (options.keepPage !== true) {
    state.movements.pagination.page = 1;
  }
  emit();
}

export function clearMovementsFilters() {
  state.movements.filters = createMovementsFiltersDefaults();
  state.movements.pagination.page = 1;
  emit();
}

export function setMovementsPage(page) {
  const next = Number(page);
  state.movements.pagination.page = Number.isFinite(next) ? Math.max(1, Math.floor(next)) : 1;
  emit();
}

export function setMovementsSort(key, order) {
  state.movements.sort.key = key;
  state.movements.sort.order = order === "asc" ? "asc" : "desc";
  state.movements.pagination.page = 1;
  emit();
}

export function toggleMovementsFiltersCollapsed() {
  state.movements.ui.filtersCollapsed = !state.movements.ui.filtersCollapsed;
  emit();
}

export function setMovementsFiltersCollapsed(value) {
  state.movements.ui.filtersCollapsed = Boolean(value);
  emit();
}

export function mutateMovementsData(mutator) {
  if (!state.movements.data) {
    return;
  }
  mutator(state.movements.data);
  state.movements.lastUpdatedIso = new Date().toISOString();
  emit();
}

export function setProductsLoading(value) {
  state.products.loading = Boolean(value);
  emit();
}

export function setProductsPayload(payload) {
  state.products.loading = false;
  state.products.loaded = true;
  state.products.mode = payload.mode || "demo";
  state.products.demoMode = payload.mode === "demo";
  state.products.showDemoBanner = Boolean(payload.showDemoBanner);
  state.products.fallbackReason = payload.fallbackReason || "";
  state.products.data = payload.data;
  state.products.lastUpdatedIso = payload.lastUpdatedIso || new Date().toISOString();
  state.products.pagination.page = 1;
  if (
    state.products.ui.selectedProductId != null &&
    !payload.data?.products?.some(
      (row) => Number(row.id) === Number(state.products.ui.selectedProductId)
    )
  ) {
    state.products.ui.selectedProductId = null;
  }
  emit();
}

export function updateProductsFilter(filterKey, value, options = {}) {
  state.products.filters[filterKey] = value;
  if (options.keepPage !== true) {
    state.products.pagination.page = 1;
  }
  emit();
}

export function clearProductsFilters() {
  state.products.filters = createProductsFiltersDefaults();
  state.products.pagination.page = 1;
  emit();
}

export function setProductsPage(page) {
  const next = Number(page);
  state.products.pagination.page = Number.isFinite(next) ? Math.max(1, Math.floor(next)) : 1;
  emit();
}

export function setProductsSort(key, order) {
  state.products.sort.key = key;
  state.products.sort.order = order === "desc" ? "desc" : "asc";
  state.products.pagination.page = 1;
  emit();
}

export function toggleProductsFiltersCollapsed() {
  state.products.ui.filtersCollapsed = !state.products.ui.filtersCollapsed;
  emit();
}

export function setProductsFiltersCollapsed(value) {
  state.products.ui.filtersCollapsed = Boolean(value);
  emit();
}

export function setProductsSelectedProduct(productId) {
  state.products.ui.selectedProductId =
    productId == null ? null : Number.isFinite(Number(productId)) ? Number(productId) : null;
  emit();
}

export function mutateProductsData(mutator) {
  if (!state.products.data) {
    return;
  }
  mutator(state.products.data);
  state.products.lastUpdatedIso = new Date().toISOString();
  emit();
}

export function setVariationsLoading(value) {
  state.variations.loading = Boolean(value);
  emit();
}

export function setVariationsPayload(payload) {
  state.variations.loading = false;
  state.variations.loaded = true;
  state.variations.mode = payload.mode || "demo";
  state.variations.demoMode = payload.mode === "demo";
  state.variations.showDemoBanner = Boolean(payload.showDemoBanner);
  state.variations.fallbackReason = payload.fallbackReason || "";
  state.variations.data = payload.data;
  state.variations.lastUpdatedIso = payload.lastUpdatedIso || new Date().toISOString();
  state.variations.pagination.page = 1;
  if (
    state.variations.ui.selectedVariationId != null &&
    !payload.data?.skus?.some(
      (row) => Number(row.id) === Number(state.variations.ui.selectedVariationId)
    )
  ) {
    state.variations.ui.selectedVariationId = null;
  }
  emit();
}

export function updateVariationsFilter(filterKey, value, options = {}) {
  if (filterKey === "attributes") {
    state.variations.filters.attributes = value && typeof value === "object" ? { ...value } : {};
  } else {
    state.variations.filters[filterKey] = value;
  }

  if (options.keepPage !== true) {
    state.variations.pagination.page = 1;
  }
  emit();
}

export function updateVariationsAttributeFilter(attributeKey, value) {
  const next = { ...(state.variations.filters.attributes || {}) };
  if (!attributeKey) {
    return;
  }
  if (!value || String(value) === "all") {
    delete next[attributeKey];
  } else {
    next[attributeKey] = value;
  }
  state.variations.filters.attributes = next;
  state.variations.pagination.page = 1;
  emit();
}

export function clearVariationsFilters() {
  state.variations.filters = createVariationsFiltersDefaults();
  state.variations.pagination.page = 1;
  emit();
}

export function setVariationsPage(page) {
  const next = Number(page);
  state.variations.pagination.page = Number.isFinite(next) ? Math.max(1, Math.floor(next)) : 1;
  emit();
}

export function setVariationsSort(key, order) {
  state.variations.sort.key = key;
  state.variations.sort.order = order === "desc" ? "desc" : "asc";
  state.variations.pagination.page = 1;
  emit();
}

export function toggleVariationsFiltersCollapsed() {
  state.variations.ui.filtersCollapsed = !state.variations.ui.filtersCollapsed;
  emit();
}

export function setVariationsFiltersCollapsed(value) {
  state.variations.ui.filtersCollapsed = Boolean(value);
  emit();
}

export function setVariationsSelectedVariation(variationId) {
  state.variations.ui.selectedVariationId =
    variationId == null ? null : Number.isFinite(Number(variationId)) ? Number(variationId) : null;
  emit();
}

export function mutateVariationsData(mutator) {
  if (!state.variations.data) {
    return;
  }
  mutator(state.variations.data);
  state.variations.lastUpdatedIso = new Date().toISOString();
  emit();
}

export function setTransfersLoading(value) {
  state.transfers.loading = Boolean(value);
  emit();
}

export function setTransfersPayload(payload) {
  state.transfers.loading = false;
  state.transfers.loaded = true;
  state.transfers.mode = payload.mode || "demo";
  state.transfers.demoMode = payload.mode === "demo";
  state.transfers.showDemoBanner = Boolean(payload.showDemoBanner);
  state.transfers.fallbackReason = payload.fallbackReason || "";
  state.transfers.data = payload.data;
  state.transfers.lastUpdatedIso = payload.lastUpdatedIso || new Date().toISOString();
  state.transfers.pagination.page = 1;
  emit();
}

export function updateTransfersFilter(filterKey, value, options = {}) {
  state.transfers.filters[filterKey] = value;
  if (options.keepPage !== true) {
    state.transfers.pagination.page = 1;
  }
  emit();
}

export function clearTransfersFilters() {
  state.transfers.filters = createTransfersFiltersDefaults();
  state.transfers.pagination.page = 1;
  emit();
}

export function setTransfersPage(page) {
  const next = Number(page);
  state.transfers.pagination.page = Number.isFinite(next) ? Math.max(1, Math.floor(next)) : 1;
  emit();
}

export function setTransfersSort(key, order) {
  state.transfers.sort.key = key === "status" ? "status" : "created_at";
  state.transfers.sort.order = order === "asc" ? "asc" : "desc";
  state.transfers.pagination.page = 1;
  emit();
}

export function toggleTransfersFiltersCollapsed() {
  state.transfers.ui.filtersCollapsed = !state.transfers.ui.filtersCollapsed;
  emit();
}

export function setTransfersFiltersCollapsed(value) {
  state.transfers.ui.filtersCollapsed = Boolean(value);
  emit();
}

export function mutateTransfersData(mutator) {
  if (!state.transfers.data) {
    return;
  }
  mutator(state.transfers.data);
  state.transfers.lastUpdatedIso = new Date().toISOString();
  emit();
}

export function setInventoryCountLoading(value) {
  state.inventoryCount.loading = Boolean(value);
  emit();
}

export function setInventoryCountPayload(payload) {
  state.inventoryCount.loading = false;
  state.inventoryCount.loaded = true;
  state.inventoryCount.mode = payload.mode || "demo";
  state.inventoryCount.demoMode = payload.mode === "demo";
  state.inventoryCount.showDemoBanner = Boolean(payload.showDemoBanner);
  state.inventoryCount.fallbackReason = payload.fallbackReason || "";
  state.inventoryCount.data = payload.data;
  state.inventoryCount.lastUpdatedIso = payload.lastUpdatedIso || new Date().toISOString();
  state.inventoryCount.pagination.page = 1;

  const activeCountId = state.inventoryCount.ui.activeCountId;
  if (
    activeCountId != null &&
    !payload.data?.counts?.some((row) => Number(row.id) === Number(activeCountId))
  ) {
    state.inventoryCount.ui.activeCountId = null;
  }

  emit();
}

export function updateInventoryCountFilter(filterKey, value, options = {}) {
  state.inventoryCount.filters[filterKey] = value;
  if (options.keepPage !== true) {
    state.inventoryCount.pagination.page = 1;
  }
  emit();
}

export function clearInventoryCountFilters() {
  state.inventoryCount.filters = createInventoryCountFiltersDefaults();
  state.inventoryCount.pagination.page = 1;
  emit();
}

export function setInventoryCountPage(page) {
  const next = Number(page);
  state.inventoryCount.pagination.page = Number.isFinite(next) ? Math.max(1, Math.floor(next)) : 1;
  emit();
}

export function setInventoryCountSort(key, order) {
  state.inventoryCount.sort.key = key === "status" ? "status" : "started_at";
  state.inventoryCount.sort.order = order === "asc" ? "asc" : "desc";
  state.inventoryCount.pagination.page = 1;
  emit();
}

export function toggleInventoryCountFiltersCollapsed() {
  state.inventoryCount.ui.filtersCollapsed = !state.inventoryCount.ui.filtersCollapsed;
  emit();
}

export function setInventoryCountFiltersCollapsed(value) {
  state.inventoryCount.ui.filtersCollapsed = Boolean(value);
  emit();
}

export function setInventoryCountActiveCount(countId) {
  state.inventoryCount.ui.activeCountId =
    countId == null ? null : Number.isFinite(Number(countId)) ? Number(countId) : null;
  emit();
}

export function mutateInventoryCountData(mutator) {
  if (!state.inventoryCount.data) {
    return;
  }
  mutator(state.inventoryCount.data);
  state.inventoryCount.lastUpdatedIso = new Date().toISOString();
  emit();
}

export function setReportsLoading(value) {
  state.reports.loading = Boolean(value);
  emit();
}

export function setReportsPayload(payload) {
  state.reports.loading = false;
  state.reports.loaded = true;
  state.reports.mode = payload.mode || "demo";
  state.reports.demoMode = payload.mode === "demo";
  state.reports.showDemoBanner = Boolean(payload.showDemoBanner);
  state.reports.fallbackReason = payload.fallbackReason || "";
  state.reports.data = payload.data;
  state.reports.lastUpdatedIso = payload.lastUpdatedIso || new Date().toISOString();

  if (
    state.reports.filters.categoryId !== "all" &&
    !payload.data?.categories?.some(
      (row) => String(row.id) === String(state.reports.filters.categoryId)
    )
  ) {
    state.reports.filters.categoryId = "all";
  }

  if (
    state.reports.filters.productId !== "all" &&
    !payload.data?.items?.some((row) => String(row.id) === String(state.reports.filters.productId))
  ) {
    state.reports.filters.productId = "all";
  }

  emit();
}

export function updateReportsFilter(filterKey, value) {
  state.reports.filters[filterKey] = value;
  emit();
}

export function clearReportsFilters() {
  state.reports.filters = createReportsFiltersDefaults();
  emit();
}

export function mutateReportsData(mutator) {
  if (!state.reports.data) {
    return;
  }
  mutator(state.reports.data);
  state.reports.lastUpdatedIso = new Date().toISOString();
  emit();
}

export function setAuditLoading(value) {
  state.audit.loading = Boolean(value);
  emit();
}

export function setAuditPayload(payload) {
  state.audit.loading = false;
  state.audit.loaded = true;
  state.audit.mode = payload.mode || "demo";
  state.audit.demoMode = payload.mode === "demo";
  state.audit.showDemoBanner = Boolean(payload.showDemoBanner);
  state.audit.fallbackReason = payload.fallbackReason || "";
  state.audit.data = payload.data;
  state.audit.lastUpdatedIso = payload.lastUpdatedIso || new Date().toISOString();
  state.audit.pagination.page = 1;

  if (
    state.audit.filters.userId !== "all" &&
    !payload.data?.users?.some((row) => String(row.id) === String(state.audit.filters.userId))
  ) {
    state.audit.filters.userId = "all";
  }

  emit();
}

export function updateAuditFilter(filterKey, value, options = {}) {
  state.audit.filters[filterKey] = value;
  if (options.keepPage !== true) {
    state.audit.pagination.page = 1;
  }
  emit();
}

export function clearAuditFilters() {
  state.audit.filters = createAuditFiltersDefaults();
  state.audit.pagination.page = 1;
  emit();
}

export function setAuditPage(page) {
  const next = Number(page);
  state.audit.pagination.page = Number.isFinite(next) ? Math.max(1, Math.floor(next)) : 1;
  emit();
}

export function setAuditSort(key, order) {
  state.audit.sort.key = key === "occurred_at" ? "occurred_at" : "occurred_at";
  state.audit.sort.order = order === "asc" ? "asc" : "desc";
  state.audit.pagination.page = 1;
  emit();
}

export function toggleAuditFiltersCollapsed() {
  state.audit.ui.filtersCollapsed = !state.audit.ui.filtersCollapsed;
  emit();
}

export function setAuditFiltersCollapsed(value) {
  state.audit.ui.filtersCollapsed = Boolean(value);
  emit();
}

export function mutateAuditData(mutator) {
  if (!state.audit.data) {
    return;
  }
  mutator(state.audit.data);
  state.audit.lastUpdatedIso = new Date().toISOString();
  emit();
}

export function setUsersLoading(value) {
  state.users.loading = Boolean(value);
  emit();
}

export function setUsersPayload(payload) {
  state.users.loading = false;
  state.users.loaded = true;
  state.users.mode = payload.mode || "demo";
  state.users.demoMode = payload.mode === "demo";
  state.users.showDemoBanner = Boolean(payload.showDemoBanner);
  state.users.fallbackReason = payload.fallbackReason || "";
  state.users.data = payload.data;
  state.users.lastUpdatedIso = payload.lastUpdatedIso || new Date().toISOString();
  state.users.pagination.page = 1;

  if (
    state.users.filters.roleId !== "all" &&
    !payload.data?.roles?.some((row) => String(row.id) === String(state.users.filters.roleId))
  ) {
    state.users.filters.roleId = "all";
  }

  emit();
}

export function updateUsersFilter(filterKey, value, options = {}) {
  state.users.filters[filterKey] = value;
  if (options.keepPage !== true) {
    state.users.pagination.page = 1;
  }
  emit();
}

export function clearUsersFilters() {
  state.users.filters = createUsersFiltersDefaults();
  state.users.pagination.page = 1;
  emit();
}

export function setUsersPage(page) {
  const next = Number(page);
  state.users.pagination.page = Number.isFinite(next) ? Math.max(1, Math.floor(next)) : 1;
  emit();
}

export function setUsersSort(key, order) {
  state.users.sort.key = key === "last_login_at" ? "last_login_at" : "name";
  state.users.sort.order = order === "desc" ? "desc" : "asc";
  state.users.pagination.page = 1;
  emit();
}

export function toggleUsersFiltersCollapsed() {
  state.users.ui.filtersCollapsed = !state.users.ui.filtersCollapsed;
  emit();
}

export function setUsersFiltersCollapsed(value) {
  state.users.ui.filtersCollapsed = Boolean(value);
  emit();
}

export function mutateUsersData(mutator) {
  if (!state.users.data) {
    return;
  }
  mutator(state.users.data);
  state.users.lastUpdatedIso = new Date().toISOString();
  emit();
}

export function routeFromHash(hash) {
  const clean = (hash || "").replace(/^#\/?/, "").trim().toLowerCase();
  const routeId = clean.split(/[?#]/)[0];
  const found = ROUTES.find((route) => route.id === routeId);
  return found ? found.id : "dashboard";
}

export function getRouteById(routeId) {
  return ROUTES.find((route) => route.id === routeId) || ROUTES[0];
}
