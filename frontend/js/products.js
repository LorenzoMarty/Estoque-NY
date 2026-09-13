/*
  Bibliotecas via CDN usadas nesta pagina:
  - Luxon: datas e periodos (pt-BR).
  - Tippy.js + Popper: tooltips acessiveis.
  - Lucide: icones.

  Configuracao da API:
  - Ajuste `API_BASE_URL` em `frontend/js/api.js`.

  Endpoints consumidos:
  - GET `/catalog/products`
  - POST `/catalog/products`
  - PATCH `/catalog/products/{id}`
  - GET `/catalog/skus` (resumo de variacoes)
  - GET `/catalog/categories`, POST `/catalog/categories` (quando disponivel)
  - GET `/catalog/brands`, POST `/catalog/brands` (quando disponivel)
  - GET `/branches` e `/stock/balances` (apoio a visao por filial)

  Fallback demo:
  - Se a API falhar, a pagina entra automaticamente em modo demonstracao
    e exibe um banner discreto com dados simulados.
*/

import {
  createProduct,
  createProductBrand,
  createProductCategory,
  loadProductsPayload,
  updateProduct,
} from "./api.js";
import { I18N_PTBR } from "./i18n.js";
import {
  clearProductsFilters,
  mutateProductsData,
  setProductsFiltersCollapsed,
  setProductsLoading,
  setProductsPage,
  setProductsPayload,
  setProductsSelectedProduct,
  setProductsSort,
  state,
  toggleProductsFiltersCollapsed,
  updateProductsFilter,
} from "./state.js";
import { applyReveal, initTooltips, openDrawer, refreshIcons, showToast } from "./ui.js";
import {
  clamp,
  debounce,
  downloadCsv,
  escapeHtml,
  formatDateTimePtBr,
  formatHourMinutePtBr,
  formatInt,
} from "./utils.js";

const { DateTime } = window.luxon;

const SERVER_FILTER_KEYS = new Set(["status", "categoryId", "brandId", "searchQuery"]);
const EMPTY_VALUE = "-";

let refreshSequence = 0;
let shortcutBound = false;

function nextId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id || 0)), 0) + 1;
}

function normalizeTerm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function compactSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toBooleanStatus(status) {
  if (status === "active") return true;
  if (status === "inactive") return false;
  return null;
}

function statusLabel(active) {
  return active ? I18N_PTBR.products.filters.status_active : I18N_PTBR.products.filters.status_inactive;
}

function statusClass(active) {
  return active ? "status-pill-active" : "status-pill-inactive";
}

function formatCurrency(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return I18N_PTBR.products.details.value_not_available;
  }
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(value);
}

function mapSortDirectionArrow(key) {
  if (state.products.sort.key !== key) return "";
  return state.products.sort.order === "asc" ? "↑" : "↓";
}

function getMaps(data) {
  return {
    branchById: new Map((data?.branches || []).map((branch) => [Number(branch.id), branch])),
    categoryById: new Map((data?.categories || []).map((category) => [Number(category.id), category])),
    brandById: new Map((data?.brands || []).map((brand) => [Number(brand.id), brand])),
  };
}

function resolveCategoryLabel(product, maps) {
  if (product.category_name) return product.category_name;
  if (product.category_id == null) return I18N_PTBR.products.kpis.uncategorized.label;
  return maps.categoryById.get(Number(product.category_id))?.name || `Categoria ${product.category_id}`;
}

function resolveBrandLabel(product, maps) {
  if (product.brand_name) return product.brand_name;
  if (product.brand) return product.brand;
  if (product.brand_id == null) return EMPTY_VALUE;
  return maps.brandById.get(Number(product.brand_id))?.name || `Marca ${product.brand_id}`;
}

function resolveVariations(product, data) {
  if (Array.isArray(product.variations)) {
    return product.variations;
  }
  const skus = Array.isArray(data?.skus) ? data.skus : [];
  return skus.filter((sku) => Number(sku.product_id) === Number(product.id));
}

function resolveVariationCount(product, data) {
  if (typeof product.variation_count === "number") return product.variation_count;
  return resolveVariations(product, data).length;
}

function resolveBranchMatch(product, branchId) {
  if (String(branchId || "all") === "all") return true;
  const targetBranch = Number(branchId);
  const branchIds = Array.isArray(product.branch_ids) ? product.branch_ids.map(Number) : [];
  if (branchIds.includes(targetBranch)) return true;

  const branchStock = product.branch_stock || {};
  return Object.entries(branchStock).some(
    ([id, qty]) => Number(id) === targetBranch && Number(qty || 0) > 0
  );
}

function resolveDateRangeMatch(product, fromIso, toIso) {
  const created = DateTime.fromISO(String(product.created_at || ""));
  if (!created.isValid) return true;
  const from = DateTime.fromISO(String(fromIso || "")).startOf("day");
  const to = DateTime.fromISO(String(toIso || "")).endOf("day");

  if (from.isValid && created < from) return false;
  if (to.isValid && created > to) return false;
  return true;
}

function compareProducts(left, right) {
  const sortKey = state.products.sort.key;
  const order = state.products.sort.order === "desc" ? -1 : 1;

  if (sortKey === "created_at") {
    const leftDate = DateTime.fromISO(String(left.created_at || "")).toMillis();
    const rightDate = DateTime.fromISO(String(right.created_at || "")).toMillis();
    if (leftDate !== rightDate) {
      return (leftDate - rightDate) * order;
    }
  } else {
    const textDiff = String(left.name || "").localeCompare(String(right.name || ""), "pt-BR");
    if (textDiff !== 0) return textDiff * order;
  }

  return (Number(left.id || 0) - Number(right.id || 0)) * order;
}

function buildActiveChips(view) {
  const filters = state.products.filters;
  const chips = [];

  if (filters.status !== "all") {
    chips.push({
      key: "status",
      label: `${I18N_PTBR.products.chips.status}: ${
        filters.status === "active"
          ? I18N_PTBR.products.filters.status_active
          : I18N_PTBR.products.filters.status_inactive
      }`,
    });
  }

  if (filters.categoryId !== "all") {
    chips.push({
      key: "categoryId",
      label: `${I18N_PTBR.products.chips.category}: ${
        view.maps.categoryById.get(Number(filters.categoryId))?.name || filters.categoryId
      }`,
    });
  }

  if (filters.brandId !== "all") {
    chips.push({
      key: "brandId",
      label: `${I18N_PTBR.products.chips.brand}: ${
        view.maps.brandById.get(Number(filters.brandId))?.name || filters.brandId
      }`,
    });
  }

  if (filters.branchId !== "all") {
    chips.push({
      key: "branchId",
      label: `${I18N_PTBR.products.chips.branch}: ${
        view.maps.branchById.get(Number(filters.branchId))?.name || filters.branchId
      }`,
    });
  }

  if (filters.searchQuery) {
    chips.push({
      key: "searchQuery",
      label: `${I18N_PTBR.products.chips.search}: ${filters.searchQuery}`,
    });
  }

  const hasFrom = Boolean(filters.createdFrom);
  const hasTo = Boolean(filters.createdTo);
  if (hasFrom || hasTo) {
    chips.push({
      key: "createdRange",
      label: `${I18N_PTBR.products.chips.created_range}: ${filters.createdFrom || "..."} -> ${
        filters.createdTo || "..."
      }`,
    });
  }

  return chips;
}

function buildView() {
  const data = state.products.data;
  if (!data) {
    return {
      rows: [],
      rowsPaged: [],
      maps: {
        branchById: new Map(),
        categoryById: new Map(),
        brandById: new Map(),
      },
      chips: [],
      pageInfo: {
        page: 1,
        totalPages: 1,
        totalRows: 0,
        start: 0,
        end: 0,
      },
      kpis: {
        total: 0,
        active: 0,
        inactive: 0,
        uncategorized: 0,
      },
    };
  }

  const maps = getMaps(data);
  const filters = state.products.filters;
  const searchTerm = normalizeTerm(filters.searchQuery);
  const statusFilter = toBooleanStatus(filters.status);

  const rows = (data.products || []).filter((product) => {
    if (statusFilter != null && Boolean(product.active) !== statusFilter) {
      return false;
    }

    if (String(filters.categoryId) !== "all" && Number(product.category_id) !== Number(filters.categoryId)) {
      return false;
    }

    if (String(filters.brandId) !== "all" && Number(product.brand_id) !== Number(filters.brandId)) {
      return false;
    }

    if (!resolveBranchMatch(product, filters.branchId)) {
      return false;
    }

    if (!resolveDateRangeMatch(product, filters.createdFrom, filters.createdTo)) {
      return false;
    }

    if (searchTerm) {
      const variations = resolveVariations(product, data);
      const variationText = variations
        .slice(0, 15)
        .map((variation) => `${variation.name || ""} ${variation.sku_code || ""} ${variation.barcode || ""}`)
        .join(" ");

      const searchBase = normalizeTerm(
        `${product.name || ""} ${product.description || ""} ${product.internal_code || ""} ${
          product.barcode || ""
        } ${variationText}`
      );
      if (!searchBase.includes(searchTerm)) {
        return false;
      }
    }

    return true;
  });

  rows.sort(compareProducts);

  const pageSize = state.products.pagination.pageSize;
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = clamp(state.products.pagination.page, 1, totalPages);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const rowsPaged = rows.slice(startIndex, endIndex);

  const kpis = {
    total: rows.length,
    active: rows.filter((product) => product.active).length,
    inactive: rows.filter((product) => !product.active).length,
    uncategorized: rows.filter((product) => product.category_id == null).length,
  };

  return {
    rows,
    rowsPaged,
    maps,
    chips: buildActiveChips({ maps }),
    pageInfo: {
      page,
      totalPages,
      totalRows,
      start: totalRows ? startIndex + 1 : 0,
      end: Math.min(endIndex, totalRows),
    },
    kpis,
  };
}

function renderChipList(chips) {
  if (!chips.length) {
    return `<small class="chips-empty">Sem filtros ativos.</small>`;
  }

  return chips
    .map(
      (chip) => `
        <button class="filter-chip" data-remove-product-filter="${escapeHtml(chip.key)}" aria-label="${
        I18N_PTBR.products.actions.clear_chip
      }">
          <span>${escapeHtml(chip.label)}</span>
          <i data-lucide="x"></i>
        </button>
      `
    )
    .join("");
}

function renderKpis(view) {
  return `
    <section class="mini-kpi-grid">
      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="package"></i>
          <button class="kpi-help" data-tippy-content="${escapeHtml(
            I18N_PTBR.products.kpis.total.tooltip
          )}" aria-label="Ajuda total de produtos"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.products.kpis.total.label}</p>
        <strong>${formatInt(view.kpis.total)}</strong>
      </article>

      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="check-circle-2"></i>
          <button class="kpi-help" data-tippy-content="${escapeHtml(
            I18N_PTBR.products.kpis.active.tooltip
          )}" aria-label="Ajuda produtos ativos"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.products.kpis.active.label}</p>
        <strong>${formatInt(view.kpis.active)}</strong>
      </article>

      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="pause-circle"></i>
          <button class="kpi-help" data-tippy-content="${escapeHtml(
            I18N_PTBR.products.kpis.inactive.tooltip
          )}" aria-label="Ajuda produtos inativos"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.products.kpis.inactive.label}</p>
        <strong>${formatInt(view.kpis.inactive)}</strong>
      </article>

      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="alert-circle"></i>
          <button class="kpi-help" data-tippy-content="${escapeHtml(
            I18N_PTBR.products.kpis.uncategorized.tooltip
          )}" aria-label="Ajuda produtos sem categoria"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.products.kpis.uncategorized.label}</p>
        <strong>${formatInt(view.kpis.uncategorized)}</strong>
      </article>
    </section>
  `;
}

function renderRows(view) {
  const data = state.products.data;

  if (!view.rowsPaged.length) {
    return `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <i data-lucide="inbox"></i>
            <span>${I18N_PTBR.products.table.empty}</span>
          </div>
        </td>
      </tr>
    `;
  }

  return view.rowsPaged
    .map((product) => {
      const categoryLabel = resolveCategoryLabel(product, view.maps);
      const brandLabel = resolveBrandLabel(product, view.maps);
      const variationCount = resolveVariationCount(product, data);
      const description = compactSpaces(product.description);
      const shortDescription = description
        ? description.length > 92
          ? `${description.slice(0, 92)}...`
          : description
        : I18N_PTBR.products.table.desc_fallback;

      return `
        <tr class="product-row" data-product-row-id="${product.id}" tabindex="0">
          <td>
            <div class="item-stack">
              <strong>${escapeHtml(product.name || `Produto ${product.id}`)}</strong>
              <small>${escapeHtml(shortDescription)}</small>
            </div>
          </td>
          <td>${escapeHtml(categoryLabel)}</td>
          <td>${escapeHtml(brandLabel)}</td>
          <td>
            <span class="status-pill ${statusClass(product.active)}" data-tippy-content="${escapeHtml(
              statusLabel(product.active)
            )}">
              ${escapeHtml(statusLabel(product.active))}
            </span>
          </td>
          <td>
            <div class="variation-cell">
              <span>${formatInt(variationCount)} variações</span>
              <button class="btn sm ghost" data-product-variations-id="${product.id}">
                ${I18N_PTBR.products.actions.view_variations}
              </button>
            </div>
          </td>
          <td>
            <div class="row-actions">
              <button class="btn sm ghost" data-product-edit-id="${product.id}">
                ${I18N_PTBR.products.actions.edit}
              </button>
              <button class="btn sm ghost" data-product-toggle-id="${product.id}">
                ${
                  product.active
                    ? I18N_PTBR.products.actions.deactivate
                    : I18N_PTBR.products.actions.activate
                }
              </button>
              <button class="btn sm ghost" data-product-detail-id="${product.id}">
                ${I18N_PTBR.products.actions.details}
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderLoadingState() {
  return `
    <section class="panel pad reveal">
      <div class="page-head">
        <div>
          <div class="skeleton line" style="width: 190px;"></div>
          <div class="skeleton line" style="width: 420px; margin-top: 8px;"></div>
        </div>
        <div style="display:flex; gap:8px;">
          <div class="skeleton block" style="width: 160px; height: 42px;"></div>
          <div class="skeleton block" style="width: 140px; height: 42px;"></div>
        </div>
      </div>
      <div class="skeleton block" style="margin-top: 12px; height: 170px;"></div>
    </section>

    <section class="mini-kpi-grid">
      ${new Array(4)
        .fill("<article class='mini-kpi-card'><div class='skeleton block' style='height:96px;'></div></article>")
        .join("")}
    </section>

    <section class="panel table-card reveal">
      <div class="skeleton line" style="width: 320px;"></div>
      <div class="skeleton block" style="height: 360px; margin-top: 10px;"></div>
    </section>
  `;
}

function renderLoadedState(view) {
  const data = state.products.data;
  const filters = state.products.filters;
  const filtersCollapsed = state.products.ui.filtersCollapsed;
  const pageInfo = view.pageInfo;

  const branchOptions = [
    `<option value="all">${I18N_PTBR.products.filters.branch_all}</option>`,
    ...(data.branches || []).map(
      (branch) =>
        `<option value="${branch.id}" ${
          String(filters.branchId) === String(branch.id) ? "selected" : ""
        }>${escapeHtml(branch.name)}</option>`
    ),
  ].join("");

  const categoryOptions = [
    `<option value="all">${I18N_PTBR.products.filters.category_all}</option>`,
    ...(data.categories || []).map(
      (category) =>
        `<option value="${category.id}" ${
          String(filters.categoryId) === String(category.id) ? "selected" : ""
        }>${escapeHtml(category.name)}</option>`
    ),
  ].join("");

  const brandOptions = [
    `<option value="all">${I18N_PTBR.products.filters.brand_all}</option>`,
    ...(data.brands || []).map(
      (brand) =>
        `<option value="${brand.id}" ${
          String(filters.brandId) === String(brand.id) ? "selected" : ""
        }>${escapeHtml(brand.name)}</option>`
    ),
  ].join("");

  return `
    <section class="panel pad reveal">
      ${
        state.products.showDemoBanner
          ? `<div class="banner"><i data-lucide="flask-conical"></i>${I18N_PTBR.mode_demo_banner}</div>`
          : ""
      }
      <div class="page-head" style="margin-top:${state.products.showDemoBanner ? "12px" : "0"};">
        <div>
          <div class="breadcrumbs">${I18N_PTBR.products.breadcrumb}</div>
          <h1>${I18N_PTBR.products.title}</h1>
          <p class="section-subtitle">${I18N_PTBR.products.subtitle}</p>
          <small>${I18N_PTBR.last_update}: <strong>${formatHourMinutePtBr(
            state.products.lastUpdatedIso || data.generated_at
          )}</strong></small>
        </div>
        <div class="products-actions">
          <button class="btn primary" id="newProductBtn">
            <i data-lucide="plus"></i>${I18N_PTBR.products.actions.new}
          </button>
          <button class="btn" id="importProductsCsvBtn">
            <i data-lucide="upload"></i>${I18N_PTBR.products.actions.import_csv}
          </button>
          <button class="btn ghost" id="exportProductsCsvBtn">
            <i data-lucide="download"></i>${I18N_PTBR.products.actions.export_csv}
          </button>
          <button class="btn ghost" id="clearProductsFiltersBtn">
            <i data-lucide="x-circle"></i>${I18N_PTBR.products.actions.clear_filters}
          </button>
        </div>
      </div>

      <div class="products-filter-toolbar">
        <button
          class="btn sm ghost"
          id="toggleProductsFiltersBtn"
          aria-expanded="${filtersCollapsed ? "false" : "true"}"
          aria-controls="productsFiltersPanel"
        >
          <i data-lucide="${filtersCollapsed ? "chevron-down" : "chevron-up"}"></i>
          ${filtersCollapsed ? I18N_PTBR.products.actions.filter_show : I18N_PTBR.products.actions.filter_hide}
        </button>
        <small class="section-subtitle">${I18N_PTBR.products.filter_shortcut}</small>
      </div>

      <div class="products-filters ${filtersCollapsed ? "is-collapsed" : ""}" id="productsFiltersPanel">
        <div class="products-filter-grid">
          <div class="field">
            <label for="productsStatusFilter">${I18N_PTBR.products.filters.status}</label>
            <select id="productsStatusFilter">
              <option value="all" ${
                filters.status === "all" ? "selected" : ""
              }>${I18N_PTBR.products.filters.status_all}</option>
              <option value="active" ${
                filters.status === "active" ? "selected" : ""
              }>${I18N_PTBR.products.filters.status_active}</option>
              <option value="inactive" ${
                filters.status === "inactive" ? "selected" : ""
              }>${I18N_PTBR.products.filters.status_inactive}</option>
            </select>
          </div>

          <div class="field">
            <label for="productsCategoryFilter">${I18N_PTBR.products.filters.category}</label>
            <select id="productsCategoryFilter">${categoryOptions}</select>
          </div>

          <div class="field">
            <label for="productsBrandFilter">${I18N_PTBR.products.filters.brand}</label>
            <select id="productsBrandFilter">${brandOptions}</select>
          </div>

          <div class="field">
            <label for="productsBranchFilter">${I18N_PTBR.products.filters.branch}</label>
            <select id="productsBranchFilter">${branchOptions}</select>
          </div>

          <div class="field products-search-field">
            <label for="productsSearchFilter">${I18N_PTBR.products.filters.search}</label>
            <input
              id="productsSearchFilter"
              type="search"
              value="${escapeHtml(filters.searchQuery)}"
              placeholder="${escapeHtml(I18N_PTBR.products.filters.search_placeholder)}"
            />
          </div>

          <div class="field">
            <label for="productsCreatedFrom">${I18N_PTBR.products.filters.created_from}</label>
            <input id="productsCreatedFrom" type="date" value="${escapeHtml(filters.createdFrom)}" />
          </div>

          <div class="field">
            <label for="productsCreatedTo">${I18N_PTBR.products.filters.created_to}</label>
            <input id="productsCreatedTo" type="date" value="${escapeHtml(filters.createdTo)}" />
          </div>
        </div>
      </div>

      <div class="filter-chip-list">
        ${renderChipList(view.chips)}
      </div>
    </section>

    ${renderKpis(view)}

    <section class="panel table-card reveal">
      <div class="table-head">
        <div>
          <h2 class="section-title">${I18N_PTBR.products.table.title}</h2>
          <p class="section-subtitle">${I18N_PTBR.products.table.subtitle}</p>
          <small class="products-result-count">
            ${I18N_PTBR.products.table.showing} ${pageInfo.start}-${pageInfo.end} ${
    I18N_PTBR.products.table.of
  } ${pageInfo.totalRows}
          </small>
        </div>
        <div class="table-tools">
          <button class="btn sm ghost" id="refreshProductsBtn">
            <i data-lucide="refresh-cw"></i>${I18N_PTBR.products.actions.refresh}
          </button>
          <button class="btn sm ghost" id="productSortNameBtn" aria-label="${escapeHtml(
            I18N_PTBR.products.table.sort_name
          )}">
            Nome ${mapSortDirectionArrow("name")}
          </button>
          <button class="btn sm ghost" id="productSortCreatedBtn" aria-label="${escapeHtml(
            I18N_PTBR.products.table.sort_created
          )}">
            Criação ${mapSortDirectionArrow("created_at")}
          </button>
        </div>
      </div>

      <div class="table-wrap products-table-wrap">
        <table>
          <thead>
            <tr>
              <th>${I18N_PTBR.products.table.product}</th>
              <th>${I18N_PTBR.products.table.category}</th>
              <th>${I18N_PTBR.products.table.brand}</th>
              <th>${I18N_PTBR.products.table.status}</th>
              <th>${I18N_PTBR.products.table.variations}</th>
              <th>${I18N_PTBR.products.table.actions}</th>
            </tr>
          </thead>
          <tbody id="productsTableBody">
            ${renderRows(view)}
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <small>
          ${I18N_PTBR.products.table.showing} ${pageInfo.start}-${pageInfo.end} ${
    I18N_PTBR.products.table.of
  } ${pageInfo.totalRows}
        </small>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn sm ghost" id="productsPrevPageBtn" ${
            pageInfo.page <= 1 ? "disabled" : ""
          }>Anterior</button>
          <small>${I18N_PTBR.products.table.page} ${pageInfo.page} ${I18N_PTBR.products.table.of} ${
    pageInfo.totalPages
  }</small>
          <button class="btn sm ghost" id="productsNextPageBtn" ${
            pageInfo.page >= pageInfo.totalPages ? "disabled" : ""
          }>Próxima</button>
        </div>
      </div>
    </section>
  `;
}

async function refreshProductsData({ feedback = false } = {}) {
  const currentRequest = ++refreshSequence;
  setProductsLoading(true);
  const payload = await loadProductsPayload(state.products.filters, state.products.sort);

  if (currentRequest !== refreshSequence) {
    return payload;
  }

  setProductsPayload(payload);

  if (feedback) {
    if (payload.mode === "demo") {
      showToast({
        title: I18N_PTBR.products.title,
        message: I18N_PTBR.products.toasts.fallback_demo,
        type: "error",
      });
    } else {
      showToast({
        title: I18N_PTBR.products.title,
        message: I18N_PTBR.products.toasts.refreshed,
        type: "success",
      });
    }
  }

  return payload;
}

const debouncedServerRefresh = debounce(() => {
  refreshProductsData();
}, 320);

function updateFilterAndRefresh(filterKey, value) {
  updateProductsFilter(filterKey, value);
  if (SERVER_FILTER_KEYS.has(filterKey) && state.products.mode === "api" && !state.products.demoMode) {
    debouncedServerRefresh();
  }
}

function resetSingleFilter(filterKey) {
  if (filterKey === "createdRange") {
    updateProductsFilter("createdFrom", "");
    updateProductsFilter("createdTo", "");
    return;
  }

  if (filterKey === "status") {
    updateFilterAndRefresh("status", "all");
    return;
  }
  if (filterKey === "categoryId") {
    updateFilterAndRefresh("categoryId", "all");
    return;
  }
  if (filterKey === "brandId") {
    updateFilterAndRefresh("brandId", "all");
    return;
  }
  if (filterKey === "branchId") {
    updateProductsFilter("branchId", "all");
    return;
  }
  if (filterKey === "searchQuery") {
    updateFilterAndRefresh("searchQuery", "");
  }
}

function mergeProductForView(product, data) {
  const categories = data.categories || [];
  const brands = data.brands || [];
  const category = categories.find((row) => Number(row.id) === Number(product.category_id));
  const brand = brands.find((row) => Number(row.id) === Number(product.brand_id));
  const variations = resolveVariations(product, data);

  return {
    ...product,
    category_name: product.category_name || category?.name || null,
    brand_name: product.brand_name || brand?.name || product.brand || null,
    variations,
    variation_count: variations.length,
    branch_stock: product.branch_stock || {},
    branch_ids: Array.isArray(product.branch_ids)
      ? product.branch_ids
      : Object.keys(product.branch_stock || {}).map((id) => Number(id)),
  };
}

function upsertProductOnState(product, { prepend = false } = {}) {
  mutateProductsData((draft) => {
    if (!Array.isArray(draft.products)) {
      draft.products = [];
    }

    const merged = mergeProductForView(product, draft);
    const index = draft.products.findIndex((row) => Number(row.id) === Number(product.id));
    if (index >= 0) {
      draft.products[index] = merged;
    } else if (prepend) {
      draft.products.unshift(merged);
    } else {
      draft.products.push(merged);
    }
  });
}

function applyLocalCatalogMutation(kind, mutator) {
  mutateProductsData((draft) => {
    const key = kind === "category" ? "categories" : "brands";
    if (!Array.isArray(draft[key])) {
      draft[key] = [];
    }
    mutator(draft[key], draft);
  });
}

function navigateToVariations(productId, mode = "view") {
  window.localStorage.setItem(
    "ESTOQUE_VARIACOES_PREFILL",
    JSON.stringify({
      product_id: Number(productId),
      mode,
      source: "produtos",
      created_at: new Date().toISOString(),
    })
  );
  window.location.hash = "#/variacoes";
  showToast({
    title: I18N_PTBR.products.title,
    message: I18N_PTBR.products.toasts.variations_shortcut,
    type: "success",
  });
}

function openProductDetails(product, view) {
  const data = state.products.data;
  if (!data) return;

  const hydrated = mergeProductForView(product, data);
  const categoryLabel = resolveCategoryLabel(hydrated, view.maps);
  const brandLabel = resolveBrandLabel(hydrated, view.maps);
  const topVariations = (hydrated.variations || []).slice(0, 5);

  openDrawer({
    title: I18N_PTBR.products.details.title,
    subtitle: hydrated.name || `Produto ${hydrated.id}`,
    bodyHtml: `
      <section class="drawer-section">
        <h4>${I18N_PTBR.products.details.summary}</h4>
        <div class="drawer-grid">
          <div><small>${I18N_PTBR.products.details.status}</small><strong>${escapeHtml(
      statusLabel(hydrated.active)
    )}</strong></div>
          <div><small>${I18N_PTBR.products.details.category}</small><strong>${escapeHtml(
      categoryLabel
    )}</strong></div>
          <div><small>${I18N_PTBR.products.details.brand}</small><strong>${escapeHtml(
      brandLabel
    )}</strong></div>
        </div>
      </section>

      <section class="drawer-section">
        <h4>${I18N_PTBR.products.details.description}</h4>
        <p class="section-subtitle">${escapeHtml(
          compactSpaces(hydrated.description) || I18N_PTBR.products.details.no_description
        )}</p>
      </section>

      <section class="drawer-section">
        <h4>${I18N_PTBR.products.details.metadata}</h4>
        <div class="drawer-grid">
          <div><small>${I18N_PTBR.products.details.created_at}</small><strong>${formatDateTimePtBr(
      hydrated.created_at
    )}</strong></div>
          <div><small>${I18N_PTBR.products.details.updated_at}</small><strong>${formatDateTimePtBr(
      hydrated.updated_at || hydrated.created_at
    )}</strong></div>
        </div>
      </section>

      <section class="drawer-section">
        <h4>${I18N_PTBR.products.details.variations}</h4>
        ${
          topVariations.length
            ? `<div class="variations-preview">
                ${topVariations
                  .map(
                    (variation) => `
                      <div class="variation-preview-row">
                        <div>
                          <strong>${escapeHtml(
                            variation.name || I18N_PTBR.products.details.value_not_available
                          )}</strong>
                          <small>${escapeHtml(
                            variation.sku_code || I18N_PTBR.products.details.variation_name
                          )}</small>
                        </div>
                        <div class="variation-preview-meta">
                          <span class="status-pill ${statusClass(variation.active)}">${escapeHtml(
                            statusLabel(variation.active)
                          )}</span>
                          <small>${I18N_PTBR.products.details.variation_price}: ${formatCurrency(
                            variation.price
                          )}</small>
                          <small>${I18N_PTBR.products.details.variation_cost}: ${formatCurrency(
                            variation.cost
                          )}</small>
                        </div>
                      </div>
                    `
                  )
                  .join("")}
              </div>`
            : `<p class="section-subtitle">${I18N_PTBR.products.details.no_variations}</p>`
        }
        <div class="drawer-inline-actions">
          <button type="button" class="btn sm ghost" data-view-all-variations>
            ${I18N_PTBR.products.details.view_all_variations}
          </button>
        </div>
      </section>
    `,
    footerHtml: `
      <div class="drawer-footer">
        <button type="button" class="btn ghost" data-close-drawer>${I18N_PTBR.products.details.close}</button>
        <button type="button" class="btn ghost" data-edit-product-drawer>${I18N_PTBR.products.details.edit_product}</button>
        <button type="button" class="btn primary" data-create-variation-drawer>${I18N_PTBR.products.details.create_variation}</button>
      </div>
    `,
    onOpen: (overlay) => {
      overlay.querySelector("[data-view-all-variations]")?.addEventListener("click", () => {
        navigateToVariations(hydrated.id, "view");
      });

      overlay.querySelector("[data-edit-product-drawer]")?.addEventListener("click", () => {
        openProductFormDrawer("edit", hydrated);
      });

      overlay.querySelector("[data-create-variation-drawer]")?.addEventListener("click", () => {
        navigateToVariations(hydrated.id, "create");
      });
    },
  });
}

function addCatalogItemLocal(kind, name) {
  let createdId = null;
  applyLocalCatalogMutation(kind, (rows) => {
    const trimmedName = compactSpaces(name);
    if (!trimmedName) return;
    const exists = rows.some((row) => normalizeTerm(row.name) === normalizeTerm(trimmedName));
    if (exists) return;
    const newRow = {
      id: nextId(rows),
      name: trimmedName,
      active: true,
    };
    rows.push(newRow);
    rows.sort((left, right) => String(left.name).localeCompare(String(right.name), "pt-BR"));
    createdId = newRow.id;
  });
  return createdId;
}

function openProductFormDrawer(mode = "create", product = null) {
  const data = state.products.data;
  if (!data) return;

  const isEdit = mode === "edit";
  const nowIso = DateTime.now().toISO();
  const initial = isEdit
    ? mergeProductForView(product, data)
    : {
        id: null,
        name: "",
        description: "",
        category_id: null,
        brand_id: null,
        active: true,
        created_at: nowIso,
        updated_at: nowIso,
        variations: [],
        variation_count: 0,
        branch_stock: {},
        branch_ids: [],
      };

  const categorySelectOptions = () =>
    [
      `<option value="">${I18N_PTBR.products.filters.category_all}</option>`,
      ...(data.categories || []).map(
        (category) =>
          `<option value="${category.id}" ${
            Number(initial.category_id) === Number(category.id) ? "selected" : ""
          }>${escapeHtml(category.name)}</option>`
      ),
    ].join("");

  const brandSelectOptions = () =>
    [
      `<option value="">${I18N_PTBR.products.filters.brand_all}</option>`,
      ...(data.brands || []).map(
        (brand) =>
          `<option value="${brand.id}" ${
            Number(initial.brand_id) === Number(brand.id) ? "selected" : ""
          }>${escapeHtml(brand.name)}</option>`
      ),
    ].join("");

  openDrawer({
    title: isEdit ? I18N_PTBR.products.form.edit_title : I18N_PTBR.products.form.create_title,
    subtitle: isEdit ? I18N_PTBR.products.form.subtitle_edit : I18N_PTBR.products.form.subtitle_create,
    submitLabel: I18N_PTBR.products.form.save,
    cancelLabel: I18N_PTBR.products.form.cancel,
    initialFocusSelector: "#productNameInput",
    bodyHtml: `
      <div class="field">
        <label for="productNameInput">${I18N_PTBR.products.form.name} *</label>
        <input
          id="productNameInput"
          name="name"
          type="text"
          value="${escapeHtml(initial.name)}"
          required
          minlength="3"
          data-tippy-content="${escapeHtml(I18N_PTBR.products.form.name_help)}"
        />
      </div>

      <div class="field">
        <label for="productDescriptionInput">${I18N_PTBR.products.form.description}</label>
        <textarea id="productDescriptionInput" name="description">${escapeHtml(
          initial.description || ""
        )}</textarea>
      </div>

      <div class="field">
        <label for="productCategoryInput">${I18N_PTBR.products.form.category}</label>
        <select id="productCategoryInput" name="categoryId" data-tippy-content="${escapeHtml(
          I18N_PTBR.products.form.category_help
        )}">
          ${categorySelectOptions()}
        </select>
        <div class="catalog-inline">
          <button type="button" class="btn sm ghost" id="toggleCategoryManagerBtn">
            ${I18N_PTBR.products.form.manage_categories}
          </button>
        </div>
        <div class="catalog-manager" id="categoryManagerPanel" hidden></div>
      </div>

      <div class="field">
        <label for="productBrandInput">${I18N_PTBR.products.form.brand}</label>
        <select id="productBrandInput" name="brandId" data-tippy-content="${escapeHtml(
          I18N_PTBR.products.form.brand_help
        )}">
          ${brandSelectOptions()}
        </select>
        <div class="catalog-inline">
          <button type="button" class="btn sm ghost" id="toggleBrandManagerBtn">
            ${I18N_PTBR.products.form.manage_brands}
          </button>
        </div>
        <div class="catalog-manager" id="brandManagerPanel" hidden></div>
      </div>

      <div class="field">
        <label for="productStatusInput">${I18N_PTBR.products.form.status}</label>
        <select id="productStatusInput" name="status">
          <option value="active" ${
            initial.active ? "selected" : ""
          }>${I18N_PTBR.products.form.status_active}</option>
          <option value="inactive" ${
            !initial.active ? "selected" : ""
          }>${I18N_PTBR.products.form.status_inactive}</option>
        </select>
      </div>
    `,
    onOpen: (overlay, helpers) => {
      const categorySelect = overlay.querySelector("#productCategoryInput");
      const brandSelect = overlay.querySelector("#productBrandInput");
      const categoryPanel = overlay.querySelector("#categoryManagerPanel");
      const brandPanel = overlay.querySelector("#brandManagerPanel");
      const categoryToggle = overlay.querySelector("#toggleCategoryManagerBtn");
      const brandToggle = overlay.querySelector("#toggleBrandManagerBtn");

      function renderCatalogSelect(kind) {
        const select = kind === "category" ? categorySelect : brandSelect;
        const rows = kind === "category" ? data.categories || [] : data.brands || [];
        const selectedValue = select.value;
        select.innerHTML = [
          `<option value="">${
            kind === "category"
              ? I18N_PTBR.products.filters.category_all
              : I18N_PTBR.products.filters.brand_all
          }</option>`,
          ...rows.map(
            (row) =>
              `<option value="${row.id}" ${
                String(selectedValue) === String(row.id) ? "selected" : ""
              }>${escapeHtml(row.name)}${row.active === false ? " (inativo)" : ""}</option>`
          ),
        ].join("");
      }

      function buildManagerMarkup(kind) {
        const rows = kind === "category" ? data.categories || [] : data.brands || [];
        if (!rows.length) {
          return `<small class="chips-empty">${I18N_PTBR.products.form.catalog_empty}</small>`;
        }

        return `
          <div class="catalog-manager-list">
            ${rows
              .map(
                (row) => `
                  <div class="catalog-manager-row ${row.active === false ? "is-inactive" : ""}">
                    <input type="text" value="${escapeHtml(row.name)}" data-catalog-input="${kind}-${row.id}" />
                    <button type="button" class="btn sm ghost" data-catalog-save="${kind}-${row.id}">
                      ${I18N_PTBR.products.form.catalog_save}
                    </button>
                    <button type="button" class="btn sm ghost" data-catalog-toggle="${kind}-${row.id}">
                      ${
                        row.active === false
                          ? I18N_PTBR.products.form.catalog_toggle_active
                          : I18N_PTBR.products.form.catalog_toggle_inactive
                      }
                    </button>
                  </div>
                `
              )
              .join("")}
          </div>
        `;
      }

      async function addCatalog(kind) {
        const input = overlay.querySelector(`#catalogAdd${kind}`);
        const value = compactSpaces(input?.value || "");
        if (!value) return;

        let createdId = null;

        if (!state.products.demoMode && state.products.mode === "api") {
          try {
            createdId =
              kind === "category"
                ? (await createProductCategory(value))?.id
                : (await createProductBrand(value))?.id;
          } catch {
            showToast({
              title: I18N_PTBR.products.title,
              message: I18N_PTBR.products.form.integration_pending,
              type: "error",
            });
          }
        }

        if (!createdId) {
          createdId = addCatalogItemLocal(kind, value);
        } else {
          applyLocalCatalogMutation(kind, (rows) => {
            rows.push({
              id: createdId,
              name: value,
              active: true,
            });
            rows.sort((left, right) => String(left.name).localeCompare(String(right.name), "pt-BR"));
          });
        }

        if (!createdId) return;
        input.value = "";
        renderManager(kind);
        renderCatalogSelect(kind);
        const select = kind === "category" ? categorySelect : brandSelect;
        select.value = String(createdId);
      }

      function saveCatalogName(kind, rowId) {
        const input = overlay.querySelector(`[data-catalog-input="${kind}-${rowId}"]`);
        const nextName = compactSpaces(input?.value || "");
        if (nextName.length < 2) {
          helpers.setError(I18N_PTBR.products.form.name_required);
          return;
        }

        applyLocalCatalogMutation(kind, (rows) => {
          const row = rows.find((entry) => Number(entry.id) === Number(rowId));
          if (!row) return;
          row.name = nextName;
        });

        if (!state.products.demoMode && state.products.mode === "api") {
          showToast({
            title: I18N_PTBR.products.title,
            message: I18N_PTBR.products.form.integration_pending,
            type: "error",
          });
        }

        renderManager(kind);
        renderCatalogSelect(kind);
      }

      function toggleCatalogActive(kind, rowId) {
        applyLocalCatalogMutation(kind, (rows) => {
          const row = rows.find((entry) => Number(entry.id) === Number(rowId));
          if (!row) return;
          row.active = row.active === false;
        });

        if (!state.products.demoMode && state.products.mode === "api") {
          showToast({
            title: I18N_PTBR.products.title,
            message: I18N_PTBR.products.form.integration_pending,
            type: "error",
          });
        }

        renderManager(kind);
        renderCatalogSelect(kind);
      }

      function renderManager(kind) {
        const container = kind === "category" ? categoryPanel : brandPanel;
        container.innerHTML = `
          ${buildManagerMarkup(kind)}
          <div class="catalog-manager-add">
            <input id="catalogAdd${kind}" type="text" placeholder="${escapeHtml(
          I18N_PTBR.products.form.catalog_add_placeholder
        )}" />
            <button type="button" class="btn sm ghost" data-catalog-add="${kind}">
              ${I18N_PTBR.products.form.catalog_add}
            </button>
          </div>
        `;

        container.querySelector(`[data-catalog-add="${kind}"]`)?.addEventListener("click", () => {
          addCatalog(kind);
        });

        container.querySelectorAll("[data-catalog-save]").forEach((button) => {
          button.addEventListener("click", () => {
            const raw = button.getAttribute("data-catalog-save") || "";
            const [, id] = raw.split("-");
            saveCatalogName(kind, Number(id));
          });
        });

        container.querySelectorAll("[data-catalog-toggle]").forEach((button) => {
          button.addEventListener("click", () => {
            const raw = button.getAttribute("data-catalog-toggle") || "";
            const [, id] = raw.split("-");
            toggleCatalogActive(kind, Number(id));
          });
        });
      }

      categoryToggle?.addEventListener("click", () => {
        const opening = categoryPanel.hidden;
        categoryPanel.hidden = !categoryPanel.hidden;
        if (opening) {
          renderManager("category");
        }
      });

      brandToggle?.addEventListener("click", () => {
        const opening = brandPanel.hidden;
        brandPanel.hidden = !brandPanel.hidden;
        if (opening) {
          renderManager("brand");
        }
      });
    },
    onSubmit: async (formData, helpers) => {
      const name = compactSpaces(formData.get("name"));
      const description = compactSpaces(formData.get("description"));
      const categoryIdRaw = String(formData.get("categoryId") || "");
      const brandIdRaw = String(formData.get("brandId") || "");
      const active = String(formData.get("status") || "active") === "active";

      if (!name || name.length < 3) {
        helpers.setError(I18N_PTBR.products.form.name_required);
        return false;
      }

      if (String(formData.get("name") || "").trim() !== name) {
        helpers.setError(I18N_PTBR.products.form.name_trim);
        return false;
      }

      const payload = {
        name,
        description: description || null,
        category_id: categoryIdRaw ? Number(categoryIdRaw) : null,
        brand_id: brandIdRaw ? Number(brandIdRaw) : null,
        active,
      };

      const nowIso = DateTime.now().toISO();
      let resultProduct = null;

      try {
        if (isEdit) {
          if (!state.products.demoMode && state.products.mode === "api") {
            resultProduct = await updateProduct(initial.id, payload);
          } else {
            resultProduct = {
              ...initial,
              ...payload,
              updated_at: nowIso,
            };
          }
        } else if (!state.products.demoMode && state.products.mode === "api") {
          resultProduct = await createProduct(payload);
        } else {
          resultProduct = {
            id: nextId(state.products.data?.products || []),
            ...payload,
            created_at: nowIso,
            updated_at: nowIso,
            variations: [],
            variation_count: 0,
            branch_stock: {},
            branch_ids: [],
          };
        }
      } catch {
        helpers.setError(I18N_PTBR.products.form.save_error);
        return false;
      }

      if (!resultProduct) {
        helpers.setError(I18N_PTBR.products.form.save_error);
        return false;
      }

      upsertProductOnState(resultProduct, { prepend: !isEdit });
      setProductsSelectedProduct(resultProduct.id);

      showToast({
        title: I18N_PTBR.products.title,
        message: isEdit
          ? I18N_PTBR.products.form.save_success_edit
          : I18N_PTBR.products.form.save_success_create,
        type: "success",
      });

      return true;
    },
  });
}

async function toggleProductStatus(product) {
  const nextActive = !product.active;
  const nowIso = DateTime.now().toISO();
  let updatedProduct = null;

  try {
    if (!state.products.demoMode && state.products.mode === "api") {
      updatedProduct = await updateProduct(product.id, { active: nextActive });
    } else {
      updatedProduct = {
        ...product,
        active: nextActive,
        updated_at: nowIso,
      };
    }
  } catch {
    showToast({
      title: I18N_PTBR.products.title,
      message: I18N_PTBR.products.form.save_error,
      type: "error",
    });
    return;
  }

  if (!updatedProduct) return;
  upsertProductOnState(updatedProduct);
  showToast({
    title: I18N_PTBR.products.title,
    message: I18N_PTBR.products.toasts.status_updated,
    type: "success",
  });
}

function exportProductsCsv(view) {
  if (!view.rows.length) {
    showToast({
      title: I18N_PTBR.products.title,
      message: I18N_PTBR.products.toasts.csv_empty,
      type: "error",
    });
    return;
  }

  const rows = view.rows.map((product) => ({
    nome: product.name || EMPTY_VALUE,
    categoria: resolveCategoryLabel(product, view.maps),
    marca: resolveBrandLabel(product, view.maps),
    status: statusLabel(product.active),
    variacoes: String(resolveVariationCount(product, state.products.data)),
    criado_em: formatDateTimePtBr(product.created_at),
  }));

  const today = DateTime.now().toFormat("yyyy-LL-dd");
  downloadCsv({
    filename: `produtos_${today}.csv`,
    columns: [
      { key: "nome", label: "Produto" },
      { key: "categoria", label: "Categoria" },
      { key: "marca", label: "Marca" },
      { key: "status", label: "Status" },
      { key: "variacoes", label: "Variações" },
      { key: "criado_em", label: "Criado em" },
    ],
    rows,
  });

  showToast({
    title: I18N_PTBR.products.title,
    message: I18N_PTBR.products.toasts.csv_success,
    type: "success",
  });
}

function bindKeyboardShortcut() {
  if (shortcutBound) return;
  shortcutBound = true;

  document.addEventListener("keydown", (event) => {
    if (state.route !== "produtos") return;
    if (event.key !== "/") return;

    const target = event.target;
    const isEditingElement =
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable);
    if (isEditingElement) return;

    event.preventDefault();
    const input = document.getElementById("productsSearchFilter");
    if (input instanceof HTMLElement) {
      input.focus();
    }
  });
}

function bindEvents(view) {
  const statusFilter = document.getElementById("productsStatusFilter");
  const categoryFilter = document.getElementById("productsCategoryFilter");
  const brandFilter = document.getElementById("productsBrandFilter");
  const branchFilter = document.getElementById("productsBranchFilter");
  const searchFilter = document.getElementById("productsSearchFilter");
  const createdFrom = document.getElementById("productsCreatedFrom");
  const createdTo = document.getElementById("productsCreatedTo");
  const prevButton = document.getElementById("productsPrevPageBtn");
  const nextButton = document.getElementById("productsNextPageBtn");
  const refreshButton = document.getElementById("refreshProductsBtn");
  const sortByNameButton = document.getElementById("productSortNameBtn");
  const sortByCreatedButton = document.getElementById("productSortCreatedBtn");
  const toggleFiltersButton = document.getElementById("toggleProductsFiltersBtn");
  const newProductButton = document.getElementById("newProductBtn");
  const importButton = document.getElementById("importProductsCsvBtn");
  const exportButton = document.getElementById("exportProductsCsvBtn");
  const clearButton = document.getElementById("clearProductsFiltersBtn");

  statusFilter?.addEventListener("change", (event) => {
    updateFilterAndRefresh("status", event.target.value);
  });

  categoryFilter?.addEventListener("change", (event) => {
    updateFilterAndRefresh("categoryId", event.target.value);
  });

  brandFilter?.addEventListener("change", (event) => {
    updateFilterAndRefresh("brandId", event.target.value);
  });

  branchFilter?.addEventListener("change", (event) => {
    updateProductsFilter("branchId", event.target.value);
  });

  searchFilter?.addEventListener("input", (event) => {
    updateFilterAndRefresh("searchQuery", event.target.value);
  });

  createdFrom?.addEventListener("change", (event) => {
    updateProductsFilter("createdFrom", event.target.value);
  });

  createdTo?.addEventListener("change", (event) => {
    updateProductsFilter("createdTo", event.target.value);
  });

  prevButton?.addEventListener("click", () => {
    setProductsPage(view.pageInfo.page - 1);
  });

  nextButton?.addEventListener("click", () => {
    setProductsPage(view.pageInfo.page + 1);
  });

  refreshButton?.addEventListener("click", () => {
    refreshProductsData({ feedback: true });
  });

  sortByNameButton?.addEventListener("click", () => {
    const order =
      state.products.sort.key === "name" && state.products.sort.order === "asc" ? "desc" : "asc";
    setProductsSort("name", order);
  });

  sortByCreatedButton?.addEventListener("click", () => {
    const order =
      state.products.sort.key === "created_at" && state.products.sort.order === "asc"
        ? "desc"
        : "asc";
    setProductsSort("created_at", order);
  });

  toggleFiltersButton?.addEventListener("click", () => {
    toggleProductsFiltersCollapsed();
  });

  newProductButton?.addEventListener("click", () => {
    openProductFormDrawer("create");
  });

  importButton?.addEventListener("click", () => {
    showToast({
      title: I18N_PTBR.products.title,
      message: I18N_PTBR.products.toasts.import_coming_soon,
      type: "success",
    });
  });

  exportButton?.addEventListener("click", () => {
    exportProductsCsv(view);
  });

  clearButton?.addEventListener("click", () => {
    clearProductsFilters();
    setProductsFiltersCollapsed(false);
    showToast({
      title: I18N_PTBR.products.title,
      message: I18N_PTBR.products.toasts.filters_cleared,
      type: "success",
    });
    if (state.products.mode === "api" && !state.products.demoMode) {
      debouncedServerRefresh();
    }
  });

  document.querySelectorAll("[data-remove-product-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-remove-product-filter");
      if (!key) return;
      resetSingleFilter(key);
    });
  });

  const rowsById = new Map(view.rows.map((row) => [Number(row.id), row]));

  document.querySelectorAll("[data-product-detail-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const productId = Number(button.getAttribute("data-product-detail-id"));
      const product = rowsById.get(productId);
      if (!product) return;
      setProductsSelectedProduct(productId);
      openProductDetails(product, view);
    });
  });

  document.querySelectorAll("[data-product-edit-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const productId = Number(button.getAttribute("data-product-edit-id"));
      const product = rowsById.get(productId);
      if (!product) return;
      openProductFormDrawer("edit", product);
    });
  });

  document.querySelectorAll("[data-product-toggle-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const productId = Number(button.getAttribute("data-product-toggle-id"));
      const product = rowsById.get(productId);
      if (!product) return;
      toggleProductStatus(product);
    });
  });

  document.querySelectorAll("[data-product-variations-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const productId = Number(button.getAttribute("data-product-variations-id"));
      if (!Number.isFinite(productId)) return;
      navigateToVariations(productId, "view");
    });
  });

  document.querySelectorAll("[data-product-row-id]").forEach((rowElement) => {
    rowElement.addEventListener("click", (event) => {
      const interactive = event.target.closest("button,a,input,select,textarea");
      if (interactive) return;
      const productId = Number(rowElement.getAttribute("data-product-row-id"));
      const product = rowsById.get(productId);
      if (!product) return;
      setProductsSelectedProduct(productId);
      openProductDetails(product, view);
    });

    rowElement.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      const productId = Number(rowElement.getAttribute("data-product-row-id"));
      const product = rowsById.get(productId);
      if (!product) return;
      setProductsSelectedProduct(productId);
      openProductDetails(product, view);
    });
  });
}

export function renderProducts() {
  bindKeyboardShortcut();

  const pageContent = document.getElementById("pageContent");
  if (!pageContent) return;

  if (!state.products.loaded && !state.products.loading) {
    refreshProductsData();
  }

  if (state.products.loading || !state.products.loaded) {
    pageContent.innerHTML = renderLoadingState();
    refreshIcons();
    applyReveal(pageContent);
    return;
  }

  const view = buildView();
  pageContent.innerHTML = renderLoadedState(view);

  refreshIcons();
  applyReveal(pageContent);
  initTooltips(pageContent);
  bindEvents(view);
}





