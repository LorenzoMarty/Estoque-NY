/*
  CDN: Luxon, Tippy.js + Popper, Lucide.
  API_BASE_URL: configure em `frontend/js/api.js`.
  Endpoints: GET /skus, POST /skus, PATCH /skus/{id}, GET /products.
  Fallback demo: se a API falhar, usa dataset mock automaticamente e mostra banner discreto.
*/

import { createVariation, loadVariationsPayload, updateVariation } from "./api.js";
import { I18N_PTBR } from "./i18n.js";
import {
  clearVariationsFilters,
  mutateVariationsData,
  setVariationsFiltersCollapsed,
  setVariationsLoading,
  setVariationsPage,
  setVariationsPayload,
  setVariationsSort,
  state,
  toggleVariationsFiltersCollapsed,
  updateMovementsFilter,
  updateVariationsAttributeFilter,
  updateVariationsFilter,
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
const SERVER_FILTER_KEYS = new Set([
  "productId",
  "status",
  "priceMin",
  "priceMax",
  "costMin",
  "costMax",
  "hasBarcode",
  "searchQuery",
]);

let refreshSeq = 0;
let shortcutBound = false;
let prefillHandled = false;
let prefillCreate = false;
let prefillProductId = null;

const fmtUsd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return compact(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function toNum(raw) {
  const v = String(raw || "").replace(",", ".").trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtMoney(value) {
  return typeof value === "number" && !Number.isNaN(value)
    ? fmtUsd.format(value)
    : I18N_PTBR.variations.details.value_not_available;
}

function statusLabel(active) {
  return active
    ? I18N_PTBR.variations.filters.status_active
    : I18N_PTBR.variations.filters.status_inactive;
}

function statusClass(active) {
  return active ? "status-pill-active" : "status-pill-inactive";
}

function variationName(row) {
  return compact(row.name) || compact(row.sku_code) || `Variacao ${row.id}`;
}

function attrsMap(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  Object.entries(raw).forEach(([k, v]) => {
    const key = compact(k);
    const val = compact(v);
    if (key && val) out[key] = val;
  });
  return out;
}

function attrsText(raw) {
  return Object.entries(attrsMap(raw))
    .map(([k, v]) => `${k}: ${v}`)
    .join(" | ");
}

function nextId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id || 0)), 0) + 1;
}

function sortArrow(key) {
  if (state.variations.sort.key !== key) return "";
  return state.variations.sort.order === "asc" ? "↑" : "↓";
}

function getView() {
  const data = state.variations.data;
  if (!data) {
    return {
      maps: { productById: new Map() },
      rows: [],
      rowsPage: [],
      chips: [],
      kpis: { total: 0, active: 0, inactive: 0, noBarcode: 0 },
      page: { page: 1, pages: 1, total: 0, start: 0, end: 0 },
      attrOptions: [],
    };
  }

  const maps = {
    productById: new Map((data.products || []).map((p) => [Number(p.id), p])),
  };
  const f = state.variations.filters;
  const search = normalize(f.searchQuery);
  const status = f.status === "active" ? true : f.status === "inactive" ? false : null;
  const pMin = toNum(f.priceMin);
  const pMax = toNum(f.priceMax);
  const cMin = toNum(f.costMin);
  const cMax = toNum(f.costMax);

  const base = (data.skus || []).map((row) => ({ ...row, attributes: attrsMap(row.attributes) }));
  const rows = base.filter((row) => {
    if (String(f.productId) !== "all" && Number(row.product_id) !== Number(f.productId)) return false;
    if (status != null && Boolean(row.active) !== status) return false;
    if (String(f.hasBarcode) === "yes" && !compact(row.barcode)) return false;
    if (String(f.hasBarcode) === "no" && compact(row.barcode)) return false;
    if (pMin != null && (typeof row.price !== "number" || row.price < pMin)) return false;
    if (pMax != null && (typeof row.price !== "number" || row.price > pMax)) return false;
    if (cMin != null && (typeof row.cost !== "number" || row.cost < cMin)) return false;
    if (cMax != null && (typeof row.cost !== "number" || row.cost > cMax)) return false;

    for (const [k, v] of Object.entries(f.attributes || {})) {
      if (v && v !== "all" && row.attributes[k] !== v) return false;
    }

    if (search) {
      const productName = maps.productById.get(Number(row.product_id))?.name || "";
      const text = normalize(
        `${variationName(row)} ${row.sku_code || ""} ${row.barcode || ""} ${productName} ${attrsText(
          row.attributes
        )}`
      );
      if (!text.includes(search)) return false;
    }
    return true;
  });

  rows.sort((a, b) => {
    const ord = state.variations.sort.order === "desc" ? -1 : 1;
    if (state.variations.sort.key === "price") {
      const l = typeof a.price === "number" ? a.price : -1;
      const r = typeof b.price === "number" ? b.price : -1;
      if (l !== r) return (l - r) * ord;
    } else if (state.variations.sort.key === "status") {
      const l = a.active ? 1 : 0;
      const r = b.active ? 1 : 0;
      if (l !== r) return (l - r) * ord;
    } else {
      const diff = variationName(a).localeCompare(variationName(b), "pt-BR");
      if (diff) return diff * ord;
    }
    return (Number(a.id) - Number(b.id)) * ord;
  });

  const total = rows.length;
  const size = state.variations.pagination.pageSize;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = clamp(state.variations.pagination.page, 1, pages);
  const from = (page - 1) * size;
  const to = from + size;
  const rowsPage = rows.slice(from, to);

  const attrMapByKey = new Map();
  base.forEach((row) => {
    Object.entries(row.attributes).forEach(([k, v]) => {
      if (!attrMapByKey.has(k)) attrMapByKey.set(k, new Set());
      attrMapByKey.get(k).add(v);
    });
  });
  const attrOptions = Array.from(attrMapByKey.entries())
    .map(([k, s]) => ({ key: k, values: Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR")) }))
    .sort((a, b) => a.key.localeCompare(b.key, "pt-BR"));

  const chips = [];
  if (String(f.productId) !== "all") {
    chips.push({
      key: "productId",
      label: `${I18N_PTBR.variations.chips.product}: ${
        maps.productById.get(Number(f.productId))?.name || f.productId
      }`,
    });
  }
  if (f.status !== "all") {
    chips.push({ key: "status", label: `${I18N_PTBR.variations.chips.status}: ${statusLabel(f.status === "active")}` });
  }
  if (f.priceMin !== "" || f.priceMax !== "") {
    chips.push({ key: "priceRange", label: `${I18N_PTBR.variations.chips.price_range}: ${f.priceMin || "..."} -> ${f.priceMax || "..."}` });
  }
  if (f.costMin !== "" || f.costMax !== "") {
    chips.push({ key: "costRange", label: `${I18N_PTBR.variations.chips.cost_range}: ${f.costMin || "..."} -> ${f.costMax || "..."}` });
  }
  if (f.hasBarcode !== "all") {
    chips.push({
      key: "hasBarcode",
      label: `${I18N_PTBR.variations.chips.barcode}: ${
        f.hasBarcode === "yes" ? I18N_PTBR.variations.filters.barcode_yes : I18N_PTBR.variations.filters.barcode_no
      }`,
    });
  }
  if (f.searchQuery) chips.push({ key: "searchQuery", label: `${I18N_PTBR.variations.chips.search}: ${f.searchQuery}` });
  Object.entries(f.attributes || {}).forEach(([k, v]) => {
    if (!v || v === "all") return;
    chips.push({ key: `attr:${k}`, label: `${I18N_PTBR.variations.chips.attribute}: ${k} = ${v}` });
  });

  return {
    maps,
    rows,
    rowsPage,
    chips,
    kpis: {
      total,
      active: rows.filter((r) => r.active).length,
      inactive: rows.filter((r) => !r.active).length,
      noBarcode: rows.filter((r) => !compact(r.barcode)).length,
    },
    page: { page, pages, total, start: total ? from + 1 : 0, end: Math.min(to, total) },
    attrOptions,
  };
}

function renderAttrsBadges(attrs) {
  const list = Object.entries(attrsMap(attrs));
  if (!list.length) {
    return `<span class="variation-attr-empty">${I18N_PTBR.variations.details.no_attributes}</span>`;
  }
  return `<div class="variation-attr-list">${list
    .slice(0, 4)
    .map(([k, v]) => `<span class="variation-attr-badge"><strong>${escapeHtml(k)}:</strong>${escapeHtml(v)}</span>`)
    .join("")}</div>`;
}

function renderLoaded(view) {
  const data = state.variations.data;
  const f = state.variations.filters;

  const productOptions = [`<option value="all">${I18N_PTBR.variations.filters.product_all}</option>`]
    .concat(
      (data.products || []).map(
        (p) =>
          `<option value="${p.id}" ${String(f.productId) === String(p.id) ? "selected" : ""}>${escapeHtml(
            p.name
          )}</option>`
      )
    )
    .join("");

  const attrFilters = view.attrOptions
    .map(
      (opt) => `<div class="field">
        <label>${escapeHtml(opt.key)}</label>
        <select data-variation-attr-filter="${escapeHtml(opt.key)}">
          <option value="all">${I18N_PTBR.variations.filters.attribute_any}</option>
          ${opt.values
            .map(
              (v) =>
                `<option value="${escapeHtml(v)}" ${
                  String((f.attributes || {})[opt.key]) === String(v) ? "selected" : ""
                }>${escapeHtml(v)}</option>`
            )
            .join("")}
        </select>
      </div>`
    )
    .join("");

  const tableRows = view.rowsPage.length
    ? view.rowsPage
        .map((r) => {
          const product = view.maps.productById.get(Number(r.product_id))?.name || `Produto ${r.product_id}`;
          return `<tr class="variation-row" data-var-row="${r.id}" tabindex="0">
            <td><div class="item-stack"><strong>${escapeHtml(variationName(r))}</strong><small>${escapeHtml(
            r.sku_code || `VAR-${r.id}`
          )}</small></div></td>
            <td>${escapeHtml(product)}</td>
            <td>${renderAttrsBadges(r.attributes)}</td>
            <td>${escapeHtml(r.barcode || I18N_PTBR.variations.table.no_barcode_value)}</td>
            <td class="qty-cell">${fmtMoney(r.price)}</td>
            <td class="qty-cell">${fmtMoney(r.cost)}</td>
            <td><span class="status-pill ${statusClass(r.active)}">${statusLabel(r.active)}</span></td>
            <td><div class="row-actions">
              <button class="btn sm ghost" data-var-edit="${r.id}">${I18N_PTBR.variations.actions.edit}</button>
              <button class="btn sm ghost" data-var-toggle="${r.id}">${
            r.active ? I18N_PTBR.variations.actions.deactivate : I18N_PTBR.variations.actions.activate
          }</button>
              <button class="btn sm ghost" data-var-detail="${r.id}">${I18N_PTBR.variations.actions.details}</button>
            </div></td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="8"><div class="empty-state"><i data-lucide="inbox"></i><span>${I18N_PTBR.variations.table.empty}</span></div></td></tr>`;

  return `<section class="panel pad reveal">
    ${
      state.variations.showDemoBanner
        ? `<div class="banner"><i data-lucide="flask-conical"></i>${I18N_PTBR.mode_demo_banner}</div>`
        : ""
    }
    <div class="page-head" style="margin-top:${state.variations.showDemoBanner ? "12px" : "0"};">
      <div>
        <div class="breadcrumbs">${I18N_PTBR.variations.breadcrumb}</div>
        <h1>${I18N_PTBR.variations.title}</h1>
        <p class="section-subtitle">${I18N_PTBR.variations.subtitle}</p>
        <small>${I18N_PTBR.last_update}: <strong>${formatHourMinutePtBr(state.variations.lastUpdatedIso || data.generated_at)}</strong></small>
      </div>
      <div class="variations-actions">
        <button class="btn primary" id="newVarBtn"><i data-lucide="plus"></i>${I18N_PTBR.variations.actions.new}</button>
        <button class="btn" id="exportVarBtn"><i data-lucide="download"></i>${I18N_PTBR.variations.actions.export_csv}</button>
        <button class="btn ghost" id="clearVarFiltersBtn"><i data-lucide="x-circle"></i>${I18N_PTBR.variations.actions.clear_filters}</button>
      </div>
    </div>
    <div class="variations-search-row"><label class="global-search variation-search-inline"><i data-lucide="search"></i>
      <input id="varSearchInput" type="search" value="${escapeHtml(f.searchQuery)}" placeholder="${escapeHtml(
    I18N_PTBR.variations.filters.quick_search_placeholder
  )}" /></label></div>
    <div class="products-filter-toolbar">
      <button class="btn sm ghost" id="toggleVarFiltersBtn"><i data-lucide="${
        state.variations.ui.filtersCollapsed ? "chevron-down" : "chevron-up"
      }"></i>${
    state.variations.ui.filtersCollapsed
      ? I18N_PTBR.variations.actions.filter_show
      : I18N_PTBR.variations.actions.filter_hide
  }</button>
      <small class="section-subtitle">${I18N_PTBR.variations.filter_shortcut}</small>
    </div>
    <div class="variations-filters ${state.variations.ui.filtersCollapsed ? "is-collapsed" : ""}">
      <div class="variations-filter-grid">
        <div class="field"><label>${I18N_PTBR.variations.filters.product_search}</label><input id="varProductSearch" type="search" placeholder="${escapeHtml(
    I18N_PTBR.variations.filters.product_search_placeholder
  )}" /></div>
        <div class="field"><label>${I18N_PTBR.variations.filters.product}</label><select id="varProductFilter">${productOptions}</select></div>
        <div class="field"><label>${I18N_PTBR.variations.filters.status}</label><select id="varStatusFilter">
          <option value="all">${I18N_PTBR.variations.filters.status_all}</option>
          <option value="active" ${f.status === "active" ? "selected" : ""}>${I18N_PTBR.variations.filters.status_active}</option>
          <option value="inactive" ${f.status === "inactive" ? "selected" : ""}>${I18N_PTBR.variations.filters.status_inactive}</option>
        </select></div>
        <div class="field"><label>${I18N_PTBR.variations.filters.price_min}</label><input id="varPriceMin" type="number" step="0.01" min="0" value="${escapeHtml(
    f.priceMin
  )}"/></div>
        <div class="field"><label>${I18N_PTBR.variations.filters.price_max}</label><input id="varPriceMax" type="number" step="0.01" min="0" value="${escapeHtml(
    f.priceMax
  )}"/></div>
        <div class="field"><label>${I18N_PTBR.variations.filters.cost_min}</label><input id="varCostMin" type="number" step="0.01" min="0" value="${escapeHtml(
    f.costMin
  )}"/></div>
        <div class="field"><label>${I18N_PTBR.variations.filters.cost_max}</label><input id="varCostMax" type="number" step="0.01" min="0" value="${escapeHtml(
    f.costMax
  )}"/></div>
        <div class="field"><label>${I18N_PTBR.variations.filters.barcode}</label><select id="varBarcodeFilter">
          <option value="all">${I18N_PTBR.variations.filters.barcode_all}</option>
          <option value="yes" ${f.hasBarcode === "yes" ? "selected" : ""}>${I18N_PTBR.variations.filters.barcode_yes}</option>
          <option value="no" ${f.hasBarcode === "no" ? "selected" : ""}>${I18N_PTBR.variations.filters.barcode_no}</option>
        </select></div>
      </div>
      <div class="variations-attributes-panel"><h3>${I18N_PTBR.variations.filters.custom_attributes}</h3>
        <div class="variations-attributes-grid">${attrFilters || `<small class="chips-empty">${I18N_PTBR.variations.details.no_attributes}</small>`}</div>
      </div>
    </div>
    <div class="filter-chip-list">${
      view.chips.length
        ? view.chips
            .map(
              (chip) =>
                `<button class="filter-chip" data-var-chip="${escapeHtml(chip.key)}"><span>${escapeHtml(
                  chip.label
                )}</span><i data-lucide="x"></i></button>`
            )
            .join("")
        : `<small class="chips-empty">Sem filtros ativos.</small>`
    }</div>
  </section>
  <section class="mini-kpi-grid">
    <article class="mini-kpi-card border-gradient reveal"><div class="mini-kpi-head"><i data-lucide="barcode"></i><button class="kpi-help" data-tippy-content="${escapeHtml(
      I18N_PTBR.variations.kpis.total.tooltip
    )}"><i data-lucide="circle-help"></i></button></div><p>${I18N_PTBR.variations.kpis.total.label}</p><strong>${formatInt(
    view.kpis.total
  )}</strong></article>
    <article class="mini-kpi-card border-gradient reveal"><div class="mini-kpi-head"><i data-lucide="check-circle-2"></i><button class="kpi-help" data-tippy-content="${escapeHtml(
      I18N_PTBR.variations.kpis.active.tooltip
    )}"><i data-lucide="circle-help"></i></button></div><p>${I18N_PTBR.variations.kpis.active.label}</p><strong>${formatInt(
    view.kpis.active
  )}</strong></article>
    <article class="mini-kpi-card border-gradient reveal"><div class="mini-kpi-head"><i data-lucide="pause-circle"></i><button class="kpi-help" data-tippy-content="${escapeHtml(
      I18N_PTBR.variations.kpis.inactive.tooltip
    )}"><i data-lucide="circle-help"></i></button></div><p>${I18N_PTBR.variations.kpis.inactive.label}</p><strong>${formatInt(
    view.kpis.inactive
  )}</strong></article>
    <article class="mini-kpi-card border-gradient reveal"><div class="mini-kpi-head"><i data-lucide="scan-barcode"></i><button class="kpi-help" data-tippy-content="${escapeHtml(
      I18N_PTBR.variations.kpis.no_barcode.tooltip
    )}"><i data-lucide="circle-help"></i></button></div><p>${I18N_PTBR.variations.kpis.no_barcode.label}</p><strong>${formatInt(
    view.kpis.noBarcode
  )}</strong></article>
  </section>
  <section class="panel table-card reveal">
    <div class="table-head"><div><h2 class="section-title">${I18N_PTBR.variations.table.title}</h2><p class="section-subtitle">${I18N_PTBR.variations.table.subtitle}</p><small class="products-result-count">${I18N_PTBR.variations.table.showing} ${
    view.page.start
  }-${view.page.end} ${I18N_PTBR.variations.table.of} ${view.page.total}</small></div>
      <div class="table-tools"><button class="btn sm ghost" id="refreshVarBtn"><i data-lucide="refresh-cw"></i>${I18N_PTBR.variations.actions.refresh}</button>
      <button class="btn sm ghost" id="sortVarNameBtn">Nome ${sortArrow("name")}</button>
      <button class="btn sm ghost" id="sortVarPriceBtn">Preço ${sortArrow("price")}</button>
      <button class="btn sm ghost" id="sortVarStatusBtn">Status ${sortArrow("status")}</button></div></div>
    <div class="table-wrap variations-table-wrap"><table><thead><tr>
      <th>${I18N_PTBR.variations.table.variation}</th><th>${I18N_PTBR.variations.table.product}</th><th>${I18N_PTBR.variations.table.attributes}</th><th>${I18N_PTBR.variations.table.barcode}</th><th>${I18N_PTBR.variations.table.price}</th><th>${I18N_PTBR.variations.table.cost}</th><th>${I18N_PTBR.variations.table.status}</th><th>${I18N_PTBR.variations.table.actions}</th>
    </tr></thead><tbody>${tableRows}</tbody></table></div>
    <div class="pagination"><small>${I18N_PTBR.variations.table.showing} ${view.page.start}-${view.page.end} ${I18N_PTBR.variations.table.of} ${view.page.total}</small>
      <div style="display:flex;gap:8px;align-items:center;"><button class="btn sm ghost" id="prevVarPageBtn" ${
        view.page.page <= 1 ? "disabled" : ""
      }>Anterior</button><small>${I18N_PTBR.variations.table.page} ${view.page.page} ${I18N_PTBR.variations.table.of} ${
    view.page.pages
  }</small><button class="btn sm ghost" id="nextVarPageBtn" ${
    view.page.page >= view.page.pages ? "disabled" : ""
  }>Próxima</button></div></div>
  </section>`;
}

function loadingMarkup() {
  return `<section class="panel pad reveal"><div class="page-head"><div><div class="skeleton line" style="width:220px;"></div><div class="skeleton line" style="width:460px;margin-top:8px;"></div></div><div style="display:flex;gap:8px;"><div class="skeleton block" style="width:150px;height:42px;"></div><div class="skeleton block" style="width:130px;height:42px;"></div></div></div><div class="skeleton block" style="margin-top:14px;height:210px;"></div></section><section class="mini-kpi-grid">${new Array(
    4
  ).fill("<article class='mini-kpi-card'><div class='skeleton block' style='height:96px;'></div></article>").join("")}</section><section class="panel table-card reveal"><div class="skeleton line" style="width:320px;"></div><div class="skeleton block" style="height:360px;margin-top:10px;"></div></section>`;
}

async function refreshData({ feedback = false } = {}) {
  const seq = ++refreshSeq;
  setVariationsLoading(true);
  const payload = await loadVariationsPayload(state.variations.filters, state.variations.sort);
  if (seq !== refreshSeq) return payload;
  setVariationsPayload(payload);
  if (feedback) {
    showToast({
      title: I18N_PTBR.variations.title,
      message:
        payload.mode === "demo"
          ? I18N_PTBR.variations.toasts.fallback_demo
          : I18N_PTBR.variations.toasts.refreshed,
      type: payload.mode === "demo" ? "error" : "success",
    });
  }
  return payload;
}

const debouncedServerRefresh = debounce(() => refreshData(), 320);

function updateFilter(key, value) {
  updateVariationsFilter(key, value);
  if (SERVER_FILTER_KEYS.has(key) && state.variations.mode === "api" && !state.variations.demoMode) {
    debouncedServerRefresh();
  }
}

function upsertVariation(row, prepend = false) {
  mutateVariationsData((draft) => {
    if (!Array.isArray(draft.skus)) draft.skus = [];
    const idx = draft.skus.findIndex((r) => Number(r.id) === Number(row.id));
    if (idx >= 0) draft.skus[idx] = row;
    else if (prepend) draft.skus.unshift(row);
    else draft.skus.push(row);
  });
}

function openForm(mode, row = null) {
  const data = state.variations.data;
  if (!data) return;

  const isEdit = mode === "edit";
  const isDuplicate = mode === "duplicate";
  const now = DateTime.now().toISO();
  const initial = row
    ? { ...row, name: isDuplicate ? `${variationName(row)} (copia)` : variationName(row) }
    : {
        product_id: prefillProductId || Number(data.products?.[0]?.id || 0),
        name: "",
        barcode: "",
        price: "",
        cost: "",
        active: true,
        attributes: {},
      };

  const products = (data.products || [])
    .map(
      (p) =>
        `<option value="${p.id}" ${Number(initial.product_id) === Number(p.id) ? "selected" : ""}>${escapeHtml(
          p.name
        )}</option>`
    )
    .join("");

  const attrs = Object.entries(attrsMap(initial.attributes));

  openDrawer({
    title: isEdit
      ? I18N_PTBR.variations.form.edit_title
      : isDuplicate
      ? I18N_PTBR.variations.form.duplicate_title
      : I18N_PTBR.variations.form.create_title,
    subtitle: isEdit
      ? I18N_PTBR.variations.form.subtitle_edit
      : isDuplicate
      ? I18N_PTBR.variations.form.subtitle_duplicate
      : I18N_PTBR.variations.form.subtitle_create,
    submitLabel: I18N_PTBR.variations.form.save,
    cancelLabel: I18N_PTBR.variations.form.cancel,
    bodyHtml: `<div class="field"><label>${I18N_PTBR.variations.form.product} *</label><select name="productId" required>${products}</select></div>
      <div class="field"><label>${I18N_PTBR.variations.form.name} *</label><input name="name" value="${escapeHtml(
      initial.name || ""
    )}" required /></div>
      <div class="field"><label>${I18N_PTBR.variations.form.barcode}</label><input name="barcode" value="${escapeHtml(
      initial.barcode || ""
    )}" /></div>
      <div class="field-row"><div class="field"><label>${I18N_PTBR.variations.form.price}</label><input name="price" type="number" min="0" step="0.01" value="${escapeHtml(
      String(initial.price ?? "")
    )}" /></div><div class="field"><label>${I18N_PTBR.variations.form.cost}</label><input name="cost" type="number" min="0" step="0.01" value="${escapeHtml(
      String(initial.cost ?? "")
    )}" /></div></div>
      <div class="field"><label>${I18N_PTBR.variations.form.status}</label><select name="status"><option value="active" ${
      initial.active ? "selected" : ""
    }>${I18N_PTBR.variations.form.status_active}</option><option value="inactive" ${
      !initial.active ? "selected" : ""
    }>${I18N_PTBR.variations.form.status_inactive}</option></select></div>
      <div class="field"><label>${I18N_PTBR.variations.form.attributes}</label><div id="varAttrRows" class="variation-attr-editor-list">${(
      attrs.length ? attrs : [["", ""]]
    )
      .map(
        ([k, v]) =>
          `<div class="variation-attr-editor-row"><input name="attrKey" placeholder="${escapeHtml(
            I18N_PTBR.variations.form.attr_key
          )}" value="${escapeHtml(k)}"/><input name="attrValue" placeholder="${escapeHtml(
            I18N_PTBR.variations.form.attr_value
          )}" value="${escapeHtml(v)}"/><button type="button" class="btn sm ghost" data-remove-attr-row><i data-lucide="trash-2"></i></button></div>`
      )
      .join("")}</div><button type="button" class="btn sm ghost" id="addVarAttrBtn"><i data-lucide="plus"></i>${
      I18N_PTBR.variations.form.add_attr
    }</button></div>`,
    onOpen: (overlay) => {
      const rows = overlay.querySelector("#varAttrRows");
      overlay.querySelector("#addVarAttrBtn")?.addEventListener("click", () => {
        rows.insertAdjacentHTML(
          "beforeend",
          `<div class="variation-attr-editor-row"><input name="attrKey" placeholder="${escapeHtml(
            I18N_PTBR.variations.form.attr_key
          )}"/><input name="attrValue" placeholder="${escapeHtml(
            I18N_PTBR.variations.form.attr_value
          )}"/><button type="button" class="btn sm ghost" data-remove-attr-row><i data-lucide="trash-2"></i></button></div>`
        );
        refreshIcons();
      });
      rows.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-remove-attr-row]");
        if (!btn) return;
        btn.closest(".variation-attr-editor-row")?.remove();
        if (!rows.children.length) {
          rows.insertAdjacentHTML(
            "beforeend",
            `<div class="variation-attr-editor-row"><input name="attrKey" placeholder="${escapeHtml(
              I18N_PTBR.variations.form.attr_key
            )}"/><input name="attrValue" placeholder="${escapeHtml(
              I18N_PTBR.variations.form.attr_value
            )}"/><button type="button" class="btn sm ghost" data-remove-attr-row><i data-lucide="trash-2"></i></button></div>`
          );
          refreshIcons();
        }
      });
    },
    onSubmit: async (formData, helpers) => {
      const product_id = Number(formData.get("productId"));
      const rawName = String(formData.get("name") || "");
      const name = compact(rawName);
      const barcode = compact(formData.get("barcode"));
      const price = toNum(formData.get("price"));
      const cost = toNum(formData.get("cost"));

      if (!product_id) return (helpers.setError(I18N_PTBR.variations.form.select_product_error), false);
      if (!name) return (helpers.setError(I18N_PTBR.variations.form.name_required), false);
      if (rawName.trim() !== name) return (helpers.setError(I18N_PTBR.variations.form.name_trim), false);
      if (price != null && price < 0) return (helpers.setError(I18N_PTBR.variations.form.price_error), false);
      if (cost != null && cost < 0) return (helpers.setError(I18N_PTBR.variations.form.cost_error), false);

      if (barcode) {
        const dup = (state.variations.data?.skus || []).some(
          (r) => Number(r.id) !== Number(row?.id) && normalize(r.barcode) === normalize(barcode)
        );
        if (dup) return (helpers.setError(I18N_PTBR.variations.form.barcode_unique), false);
      }

      const attributes = {};
      const keys = formData.getAll("attrKey");
      const vals = formData.getAll("attrValue");
      for (let i = 0; i < keys.length; i += 1) {
        const k = compact(keys[i]);
        const v = compact(vals[i]);
        if (!k && !v) continue;
        if (!k) return (helpers.setError(I18N_PTBR.variations.form.attr_key_required), false);
        if (!v) return (helpers.setError(I18N_PTBR.variations.form.attr_value_required), false);
        attributes[k] = v;
      }

      const payload = {
        product_id,
        name,
        barcode: barcode || null,
        price: price == null ? null : price,
        cost: cost == null ? null : cost,
        active: String(formData.get("status")) !== "inactive",
        attributes,
      };

      let saved = null;
      try {
        if (isEdit && !state.variations.demoMode && state.variations.mode === "api") {
          saved = await updateVariation(row.id, payload);
        } else if (!isEdit && !state.variations.demoMode && state.variations.mode === "api") {
          saved = await createVariation(payload);
        } else {
          const id = isEdit ? Number(row.id) : nextId(state.variations.data?.skus || []);
          saved = {
            ...row,
            id,
            ...payload,
            sku_code: row?.sku_code || `VAR-${String(id).padStart(5, "0")}`,
            created_at: row?.created_at || now,
            updated_at: now,
          };
        }
      } catch {
        return (helpers.setError(I18N_PTBR.variations.form.save_error), false);
      }

      upsertVariation(saved, !isEdit);
      showToast({
        title: I18N_PTBR.variations.title,
        message: isEdit
          ? I18N_PTBR.variations.form.save_success_edit
          : isDuplicate
          ? I18N_PTBR.variations.form.save_success_duplicate
          : I18N_PTBR.variations.form.save_success_create,
        type: "success",
      });
      return true;
    },
  });
}

function openDetails(row, view) {
  const product = view.maps.productById.get(Number(row.product_id));
  openDrawer({
    title: I18N_PTBR.variations.details.title,
    subtitle: variationName(row),
    bodyHtml: `<section class="drawer-section"><h4>${I18N_PTBR.variations.details.summary}</h4><div class="drawer-grid"><div><small>${I18N_PTBR.variations.details.status}</small><strong>${statusLabel(
      row.active
    )}</strong></div><div><small>${I18N_PTBR.variations.details.barcode}</small><strong>${escapeHtml(
      row.barcode || I18N_PTBR.variations.details.value_not_available
    )}</strong></div></div></section>
      <section class="drawer-section"><h4>${I18N_PTBR.variations.details.product}</h4><div class="drawer-grid"><div><small>${I18N_PTBR.variations.filters.product}</small><strong>${escapeHtml(
      product?.name || `Produto ${row.product_id}`
    )}</strong></div></div><div class="drawer-inline-actions"><button type="button" class="btn sm ghost" data-open-product-page>${I18N_PTBR.variations.actions.view_product}</button></div></section>
      <section class="drawer-section"><h4>${I18N_PTBR.variations.details.attributes}</h4>${
        attrsText(row.attributes)
          ? `<p class="section-subtitle">${escapeHtml(attrsText(row.attributes))}</p>`
          : `<p class="section-subtitle">${I18N_PTBR.variations.details.no_attributes}</p>`
      }</section>
      <section class="drawer-section"><h4>${I18N_PTBR.variations.details.pricing}</h4><div class="drawer-grid"><div><small>${I18N_PTBR.variations.details.price}</small><strong>${fmtMoney(
      row.price
    )}</strong></div><div><small>${I18N_PTBR.variations.details.cost}</small><strong>${fmtMoney(
      row.cost
    )}</strong></div></div></section>
      <section class="drawer-section"><h4>${I18N_PTBR.variations.details.metadata}</h4><div class="drawer-grid"><div><small>${I18N_PTBR.variations.details.created_at}</small><strong>${formatDateTimePtBr(
      row.created_at
    )}</strong></div><div><small>${I18N_PTBR.variations.details.updated_at}</small><strong>${formatDateTimePtBr(
      row.updated_at || row.created_at
    )}</strong></div></div></section>`,
    footerHtml: `<div class="drawer-footer"><button class="btn ghost" type="button" data-close-drawer>${I18N_PTBR.variations.details.close}</button><button class="btn ghost" type="button" data-edit-var>${I18N_PTBR.variations.details.edit}</button><button class="btn ghost" type="button" data-dup-var>${I18N_PTBR.variations.details.duplicate}</button><button class="btn primary" type="button" data-moves-var>${I18N_PTBR.variations.details.view_moves}</button></div>`,
    onOpen: (overlay) => {
      overlay.querySelector("[data-edit-var]")?.addEventListener("click", () => openForm("edit", row));
      overlay.querySelector("[data-dup-var]")?.addEventListener("click", () => openForm("duplicate", row));
      overlay.querySelector("[data-open-product-page]")?.addEventListener("click", () => {
        window.location.hash = "#/produtos";
      });
      overlay.querySelector("[data-moves-var]")?.addEventListener("click", () => {
        updateMovementsFilter("itemQuery", row.barcode || row.sku_code || variationName(row));
        window.location.hash = "#/movimentacoes";
        showToast({
          title: I18N_PTBR.variations.title,
          message: I18N_PTBR.variations.toasts.moved_to_movements,
          type: "success",
        });
      });
    },
  });
}

function exportCsv(view) {
  if (!view.rows.length) {
    showToast({
      title: I18N_PTBR.variations.title,
      message: I18N_PTBR.variations.toasts.csv_empty,
      type: "error",
    });
    return;
  }

  const rows = view.rows.map((r) => ({
    variacao: variationName(r),
    produto: view.maps.productById.get(Number(r.product_id))?.name || `Produto ${r.product_id}`,
    atributos: attrsText(r.attributes) || I18N_PTBR.variations.details.no_attributes,
    codigo_barras: r.barcode || I18N_PTBR.variations.table.no_barcode_value,
    preco: fmtMoney(r.price),
    custo: fmtMoney(r.cost),
    status: statusLabel(r.active),
  }));

  downloadCsv({
    filename: `variacoes_${DateTime.now().toFormat("yyyy-LL-dd")}.csv`,
    columns: [
      { key: "variacao", label: "Variacao" },
      { key: "produto", label: "Produto" },
      { key: "atributos", label: "Atributos" },
      { key: "codigo_barras", label: "Codigo de barras" },
      { key: "preco", label: "Preco" },
      { key: "custo", label: "Custo" },
      { key: "status", label: "Status" },
    ],
    rows,
  });

  showToast({
    title: I18N_PTBR.variations.title,
    message: I18N_PTBR.variations.toasts.csv_success,
    type: "success",
  });
}

function bind(view) {
  const bindInput = (id, key) =>
    document.getElementById(id)?.addEventListener("input", (event) => updateFilter(key, event.target.value));
  const bindChange = (id, key) =>
    document.getElementById(id)?.addEventListener("change", (event) => updateFilter(key, event.target.value));

  const productSearchInput = document.getElementById("varProductSearch");
  const productSelect = document.getElementById("varProductFilter");
  const allProducts = state.variations.data?.products || [];

  function rebuildProductOptions(term = "") {
    if (!(productSelect instanceof HTMLSelectElement)) return;

    const selected = String(state.variations.filters.productId || "all");
    const query = normalize(term);
    const list = allProducts.filter((product) => {
      if (!query) return true;
      if (String(product.id) === selected) return true;
      return normalize(product.name).includes(query);
    });

    productSelect.innerHTML = [
      `<option value=\"all\">${I18N_PTBR.variations.filters.product_all}</option>`,
      ...list.map((product) => `<option value=\"${product.id}\">${escapeHtml(product.name)}</option>`),
    ].join("");
    productSelect.value = selected;
  }

  if (productSearchInput) {
    productSearchInput.addEventListener("input", (event) => {
      rebuildProductOptions(event.target.value);
    });
  }
  rebuildProductOptions(productSearchInput?.value || "");

  bindChange("varProductFilter", "productId");
  bindChange("varStatusFilter", "status");
  bindInput("varPriceMin", "priceMin");
  bindInput("varPriceMax", "priceMax");
  bindInput("varCostMin", "costMin");
  bindInput("varCostMax", "costMax");
  bindChange("varBarcodeFilter", "hasBarcode");
  bindInput("varSearchInput", "searchQuery");

  document.querySelectorAll("[data-variation-attr-filter]").forEach((el) => {
    el.addEventListener("change", () => {
      updateVariationsAttributeFilter(el.getAttribute("data-variation-attr-filter"), el.value);
    });
  });

  document.getElementById("toggleVarFiltersBtn")?.addEventListener("click", () => {
    toggleVariationsFiltersCollapsed();
  });

  document.getElementById("newVarBtn")?.addEventListener("click", () => {
    openForm("create");
  });

  document.getElementById("exportVarBtn")?.addEventListener("click", () => {
    exportCsv(view);
  });

  document.getElementById("clearVarFiltersBtn")?.addEventListener("click", () => {
    clearVariationsFilters();
    setVariationsFiltersCollapsed(false);
    showToast({
      title: I18N_PTBR.variations.title,
      message: I18N_PTBR.variations.toasts.filters_cleared,
      type: "success",
    });
    if (state.variations.mode === "api" && !state.variations.demoMode) {
      debouncedServerRefresh();
    }
  });

  document.getElementById("refreshVarBtn")?.addEventListener("click", () => {
    refreshData({ feedback: true });
  });

  document.getElementById("prevVarPageBtn")?.addEventListener("click", () => {
    setVariationsPage(view.page.page - 1);
  });

  document.getElementById("nextVarPageBtn")?.addEventListener("click", () => {
    setVariationsPage(view.page.page + 1);
  });

  document.getElementById("sortVarNameBtn")?.addEventListener("click", () => {
    setVariationsSort(
      "name",
      state.variations.sort.key === "name" && state.variations.sort.order === "asc" ? "desc" : "asc"
    );
  });

  document.getElementById("sortVarPriceBtn")?.addEventListener("click", () => {
    setVariationsSort(
      "price",
      state.variations.sort.key === "price" && state.variations.sort.order === "asc" ? "desc" : "asc"
    );
  });

  document.getElementById("sortVarStatusBtn")?.addEventListener("click", () => {
    setVariationsSort(
      "status",
      state.variations.sort.key === "status" && state.variations.sort.order === "asc" ? "desc" : "asc"
    );
  });

  document.querySelectorAll("[data-var-chip]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.getAttribute("data-var-chip");
      if (key === "priceRange") {
        updateVariationsFilter("priceMin", "");
        updateVariationsFilter("priceMax", "");
        return;
      }
      if (key === "costRange") {
        updateVariationsFilter("costMin", "");
        updateVariationsFilter("costMax", "");
        return;
      }
      if (key?.startsWith("attr:")) {
        updateVariationsAttributeFilter(key.slice(5), "all");
        return;
      }
      if (key === "searchQuery") {
        updateFilter("searchQuery", "");
        return;
      }
      if (key) {
        updateFilter(key, "all");
      }
    });
  });

  const byId = new Map(view.rows.map((row) => [Number(row.id), row]));

  document.querySelectorAll("[data-var-detail]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const row = byId.get(Number(button.getAttribute("data-var-detail")));
      if (row) openDetails(row, view);
    });
  });

  document.querySelectorAll("[data-var-edit]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const row = byId.get(Number(button.getAttribute("data-var-edit")));
      if (row) openForm("edit", row);
    });
  });

  document.querySelectorAll("[data-var-toggle]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const row = byId.get(Number(button.getAttribute("data-var-toggle")));
      if (!row) return;

      try {
        let saved = null;
        if (!state.variations.demoMode && state.variations.mode === "api") {
          saved = await updateVariation(row.id, { active: !row.active });
        } else {
          saved = { ...row, active: !row.active, updated_at: DateTime.now().toISO() };
        }

        upsertVariation(saved);
        showToast({
          title: I18N_PTBR.variations.title,
          message: I18N_PTBR.variations.toasts.status_updated,
          type: "success",
        });
      } catch {
        showToast({
          title: I18N_PTBR.variations.title,
          message: I18N_PTBR.variations.form.save_error,
          type: "error",
        });
      }
    });
  });

  document.querySelectorAll("[data-var-row]").forEach((rowEl) => {
    rowEl.addEventListener("click", (event) => {
      if (event.target.closest("button,input,select,a")) return;
      const row = byId.get(Number(rowEl.getAttribute("data-var-row")));
      if (row) openDetails(row, view);
    });

    rowEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      const row = byId.get(Number(rowEl.getAttribute("data-var-row")));
      if (row) openDetails(row, view);
    });
  });
}

function maybeConsumePrefill() {
  if (prefillHandled) return false;
  prefillHandled = true;

  let payload = null;
  try {
    payload = JSON.parse(window.localStorage.getItem("ESTOQUE_VARIACOES_PREFILL") || "null");
  } catch {
    payload = null;
  }

  window.localStorage.removeItem("ESTOQUE_VARIACOES_PREFILL");
  if (!payload) return false;

  const wantsCreate = String(payload.mode || "").toLowerCase() === "create";
  if (wantsCreate) {
    prefillCreate = true;
  }

  const id = Number(payload.product_id);
  if (id > 0) {
    prefillProductId = id;
    if (String(state.variations.filters.productId) !== String(id)) {
      updateVariationsFilter("productId", String(id));
      return true;
    }
  }

  return false;
}

function bindShortcut() {
  if (shortcutBound) return;
  shortcutBound = true;

  document.addEventListener("keydown", (event) => {
    if (state.route !== "variacoes" || event.key !== "/") return;

    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable)
    ) {
      return;
    }

    event.preventDefault();
    document.getElementById("varSearchInput")?.focus();
  });
}

export function renderVariations() {
  bindShortcut();

  const page = document.getElementById("pageContent");
  if (!page) return;

  if (!state.variations.loaded && !state.variations.loading) {
    refreshData();
  }

  if (state.variations.loading || !state.variations.loaded) {
    page.innerHTML = loadingMarkup();
    refreshIcons();
    applyReveal(page);
    return;
  }

  if (maybeConsumePrefill()) {
    return;
  }

  const view = getView();
  page.innerHTML = renderLoaded(view);
  refreshIcons();
  applyReveal(page);
  initTooltips(page);
  bind(view);

  if (prefillCreate) {
    prefillCreate = false;
    openForm("create");
  }
}
