
/*
  Bibliotecas via CDN usadas nesta pagina:
  - Luxon: datas, horarios e duracao.
  - Tippy.js + Popper: tooltips acessiveis.
  - Lucide: icones SVG consistentes.

  Configuracao da API:
  - Ajuste `API_BASE_URL` em `frontend/js/api.js`.

  Endpoints consumidos:
  - GET `/stock/inventory-counts`
  - POST `/stock/inventory-counts`
  - PATCH `/stock/inventory-counts/{id}/lines`
  - POST `/stock/inventory-counts/{id}/close`
  - POST `/stock/inventory-counts/{id}/post`
  - POST `/stock/inventory-counts/{id}/cancel`
  - GET `/branches`
  - GET `/locations`
  - GET `/catalog/skus`

  Modo demonstracao:
  - Em falha da API, a pagina entra automaticamente em modo demo
    com dados simulados e banner discreto.
*/

import {
  cancelInventoryCount,
  closeInventoryCount,
  createInventoryCount,
  loadInventoryCountsPayload,
  patchInventoryCountLines,
  postInventoryCount,
} from "./api.js";
import {
  buildCounterLines,
  buildCounterPatchPayload,
  computeCounterProgress,
  computeCounterSummary,
  diffSeverity,
  isCounterEditable,
  searchCounterLineIndex,
  updateCounterLine,
} from "./counter.js";
import { I18N_PTBR } from "./i18n.js";
import {
  clearInventoryCountFilters,
  mutateInventoryCountData,
  setInventoryCountActiveCount,
  setInventoryCountFiltersCollapsed,
  setInventoryCountLoading,
  setInventoryCountPage,
  setInventoryCountPayload,
  setInventoryCountSort,
  state,
  toggleInventoryCountFiltersCollapsed,
  updateInventoryCountFilter,
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
  resolvePeriodRange,
} from "./utils.js";

const { DateTime } = window.luxon;

const STATUS_SORT_ORDER = {
  OPEN: 0,
  CLOSED: 1,
  POSTED: 2,
  CANCELLED: 3,
};

let refreshSequence = 0;
let shortcutBound = false;
let keepLineFocusSkuId = null;
let flashLineSkuId = null;
let scannerFocusRequested = false;

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return compact(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function nextId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id || 0)), 0) + 1;
}

function formatCurrency(value) {
  if (!Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(Number(value));
}

function mapPeriodLabel(period) {
  if (period === "7") return I18N_PTBR.inventory_count.filters.period_7;
  if (period === "30") return I18N_PTBR.inventory_count.filters.period_30;
  if (period === "90") return I18N_PTBR.inventory_count.filters.period_90;
  if (period === "custom") return I18N_PTBR.inventory_count.filters.period_custom;
  return period;
}

function countStatusLabel(status) {
  if (status === "OPEN") return I18N_PTBR.inventory_count.filters.status_open;
  if (status === "CLOSED") return I18N_PTBR.inventory_count.filters.status_closed;
  if (status === "POSTED") return I18N_PTBR.inventory_count.filters.status_posted;
  return I18N_PTBR.inventory_count.filters.status_cancelled;
}

function countStatusClass(status) {
  if (status === "OPEN") return "count-status-open";
  if (status === "CLOSED") return "count-status-closed";
  if (status === "POSTED") return "count-status-posted";
  return "count-status-cancelled";
}

function getMaps(data) {
  const branchById = new Map((data?.branches || []).map((branch) => [Number(branch.id), branch]));
  const locationById = new Map((data?.locations || []).map((location) => [Number(location.id), location]));
  const itemById = new Map((data?.items || []).map((item) => [Number(item.id), item]));

  return {
    branchById,
    locationById,
    itemById,
  };
}

function defaultCountHistory(count) {
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

function enrichCount(rawCount, data, usersById = new Map()) {
  const maps = getMaps(data);
  const lines = buildCounterLines(rawCount, maps.itemById);
  const summary = computeCounterSummary(lines);
  const progress = computeCounterProgress(lines);
  const responsibleName =
    compact(rawCount.responsible_name) ||
    usersById.get(String(rawCount.created_by || ""))?.name ||
    `Usuario ${rawCount.created_by || "-"}`;

  return {
    ...rawCount,
    count_code: compact(rawCount.count_code) || `CNT-${String(rawCount.id || 0).padStart(6, "0")}`,
    status: String(rawCount.status || "OPEN").toUpperCase(),
    responsible_name: responsibleName,
    lines,
    divergence_count: summary.divergentItems,
    counted_lines: progress.counted,
    total_lines: progress.total,
    history: Array.isArray(rawCount.history) ? rawCount.history : defaultCountHistory(rawCount),
    last_saved_at: rawCount.last_saved_at || rawCount.started_at,
  };
}

function getResponsibleOptions(counts = []) {
  const map = new Map();
  counts.forEach((count) => {
    const name = compact(count.responsible_name);
    if (!name) return;
    map.set(name.toLowerCase(), name);
  });
  return Array.from(map.values()).sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function locationsForBranch(data, branchId) {
  if (String(branchId || "all") === "all") {
    return data?.locations || [];
  }

  return (data?.locations || []).filter((location) => Number(location.branch_id) === Number(branchId));
}

function sortCounts(rows) {
  return rows.sort((left, right) => {
    const key = state.inventoryCount.sort.key;
    const direction = state.inventoryCount.sort.order === "asc" ? 1 : -1;

    if (key === "status") {
      const statusDiff =
        (STATUS_SORT_ORDER[String(left.status || "OPEN")] || 0) -
        (STATUS_SORT_ORDER[String(right.status || "OPEN")] || 0);
      if (statusDiff !== 0) return statusDiff * direction;
    }

    const leftDate = DateTime.fromISO(String(left.started_at || "")).toMillis();
    const rightDate = DateTime.fromISO(String(right.started_at || "")).toMillis();
    if (leftDate !== rightDate) {
      return (leftDate - rightDate) * direction;
    }

    return (Number(left.id || 0) - Number(right.id || 0)) * direction;
  });
}

function buildActiveChips(view) {
  const filters = state.inventoryCount.filters;
  const chips = [];

  if (filters.status !== "all") {
    chips.push({
      key: "status",
      label: `${I18N_PTBR.inventory_count.chips.status}: ${countStatusLabel(filters.status)}`,
    });
  }

  if (filters.branchId !== "all") {
    chips.push({
      key: "branchId",
      label: `${I18N_PTBR.inventory_count.chips.branch}: ${
        view.maps.branchById.get(Number(filters.branchId))?.name || filters.branchId
      }`,
    });
  }

  if (filters.locationId !== "all") {
    chips.push({
      key: "locationId",
      label: `${I18N_PTBR.inventory_count.chips.location}: ${
        view.maps.locationById.get(Number(filters.locationId))?.name || filters.locationId
      }`,
    });
  }

  if (filters.period !== "30") {
    chips.push({
      key: "period",
      label: `${I18N_PTBR.inventory_count.chips.period}: ${mapPeriodLabel(filters.period)}`,
    });
  }

  if (filters.period === "custom") {
    chips.push({
      key: "customRange",
      label: `${I18N_PTBR.inventory_count.chips.custom_range}: ${filters.customFrom} -> ${filters.customTo}`,
    });
  }

  if (filters.responsible !== "all") {
    chips.push({
      key: "responsible",
      label: `${I18N_PTBR.inventory_count.chips.responsible}: ${filters.responsible}`,
    });
  }

  if (filters.divergenceOnly) {
    chips.push({
      key: "divergenceOnly",
      label: `${I18N_PTBR.inventory_count.chips.divergence_only}: ON`,
    });
  }

  return chips;
}

function buildView() {
  const data = state.inventoryCount.data;
  if (!data) {
    return {
      maps: { branchById: new Map(), locationById: new Map(), itemById: new Map() },
      rows: [],
      rowsPaged: [],
      chips: [],
      responsibleOptions: [],
      pageInfo: { page: 1, totalPages: 1, totalRows: 0, start: 0, end: 0 },
      kpis: {
        open: 0,
        divergentItems: 0,
        adjustments: 0,
        lastCountIso: null,
      },
    };
  }

  const maps = getMaps(data);
  const filters = state.inventoryCount.filters;
  const periodRange = resolvePeriodRange(filters);
  const usersById = new Map((data.users || []).map((user) => [String(user.id), user]));

  const rows = (data.counts || [])
    .map((count) => enrichCount(count, data, usersById))
    .filter((count) => {
      const startedAt = DateTime.fromISO(String(count.started_at || ""));
      if (!startedAt.isValid) return false;
      if (startedAt < periodRange.from || startedAt > periodRange.to) return false;

      if (filters.status !== "all" && String(count.status) !== String(filters.status)) {
        return false;
      }

      if (filters.branchId !== "all" && Number(count.branch_id) !== Number(filters.branchId)) {
        return false;
      }

      if (filters.locationId !== "all" && Number(count.location_id) !== Number(filters.locationId)) {
        return false;
      }

      if (filters.responsible !== "all") {
        if (normalize(count.responsible_name) !== normalize(filters.responsible)) {
          return false;
        }
      }

      if (filters.divergenceOnly && Number(count.divergence_count || 0) <= 0) {
        return false;
      }

      return true;
    });

  sortCounts(rows);

  const totalRows = rows.length;
  const pageSize = state.inventoryCount.pagination.pageSize;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = clamp(state.inventoryCount.pagination.page, 1, totalPages);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  return {
    maps,
    rows,
    rowsPaged: rows.slice(startIndex, endIndex),
    chips: buildActiveChips({ maps }),
    responsibleOptions: getResponsibleOptions(rows),
    pageInfo: {
      page,
      totalPages,
      totalRows,
      start: totalRows ? startIndex + 1 : 0,
      end: Math.min(endIndex, totalRows),
    },
    kpis: {
      open: rows.filter((row) => row.status === "OPEN").length,
      divergentItems: rows.reduce((acc, row) => acc + Number(row.divergence_count || 0), 0),
      adjustments: rows.filter((row) => row.status === "POSTED").length,
      lastCountIso: rows[0]?.started_at || null,
    },
  };
}

function findCountById(countId) {
  const data = state.inventoryCount.data;
  if (!data) return null;

  const usersById = new Map((data.users || []).map((user) => [String(user.id), user]));
  const row = (data.counts || []).find((count) => Number(count.id) === Number(countId));
  if (!row) return null;
  return enrichCount(row, data, usersById);
}

function upsertCountOnState(nextCount, options = {}) {
  if (!nextCount) return;
  const data = state.inventoryCount.data;
  if (!data) return;

  const usersById = new Map((data.users || []).map((user) => [String(user.id), user]));
  const enriched = enrichCount(nextCount, data, usersById);

  mutateInventoryCountData((draft) => {
    if (!Array.isArray(draft.counts)) {
      draft.counts = [];
    }

    const index = draft.counts.findIndex((count) => Number(count.id) === Number(enriched.id));
    if (index >= 0) {
      draft.counts[index] = enriched;
      return;
    }

    if (options.prepend === false) {
      draft.counts.push(enriched);
    } else {
      draft.counts.unshift(enriched);
    }
  });
}

function renderChipList(chips) {
  if (!chips.length) {
    return `<small class="chips-empty">Sem filtros ativos.</small>`;
  }

  return chips
    .map(
      (chip) => `
        <button class="filter-chip" data-remove-count-filter="${escapeHtml(chip.key)}" aria-label="${
        I18N_PTBR.inventory_count.actions.clear_chip
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
          <i data-lucide="clipboard-list"></i>
          <button class="kpi-help" data-tippy-content="${
            I18N_PTBR.inventory_count.kpis.open.tooltip
          }" aria-label="Ajuda contagens abertas"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.inventory_count.kpis.open.label}</p>
        <strong>${formatInt(view.kpis.open)}</strong>
      </article>

      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="triangle-alert"></i>
          <button class="kpi-help" data-tippy-content="${
            I18N_PTBR.inventory_count.kpis.divergent_items.tooltip
          }" aria-label="Ajuda divergencias"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.inventory_count.kpis.divergent_items.label}</p>
        <strong>${formatInt(view.kpis.divergentItems)}</strong>
      </article>

      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="check-check"></i>
          <button class="kpi-help" data-tippy-content="${
            I18N_PTBR.inventory_count.kpis.adjustments.tooltip
          }" aria-label="Ajuda ajustes"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.inventory_count.kpis.adjustments.label}</p>
        <strong>${formatInt(view.kpis.adjustments)}</strong>
      </article>

      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="history"></i>
          <button class="kpi-help" data-tippy-content="${
            I18N_PTBR.inventory_count.kpis.last_count.tooltip
          }" aria-label="Ajuda ultima contagem"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.inventory_count.kpis.last_count.label}</p>
        <strong>${
          view.kpis.lastCountIso ? formatDateTimePtBr(view.kpis.lastCountIso) : "-"
        }</strong>
      </article>
    </section>
  `;
}

function renderRows(view) {
  if (!view.rowsPaged.length) {
    return `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <i data-lucide="inbox"></i>
            <span>${I18N_PTBR.inventory_count.table.empty}</span>
          </div>
        </td>
      </tr>
    `;
  }

  return view.rowsPaged
    .map((count) => {
      const branch = view.maps.branchById.get(Number(count.branch_id));
      const location = view.maps.locationById.get(Number(count.location_id));

      return `
        <tr class="count-row">
          <td><strong>${escapeHtml(count.count_code)}</strong></td>
          <td>${escapeHtml(branch?.name || "-")} / ${escapeHtml(location?.name || "-")}</td>
          <td>${escapeHtml(count.responsible_name || "-")}</td>
          <td>${formatInt(count.counted_lines)} / ${formatInt(count.total_lines)}</td>
          <td>${formatInt(count.divergence_count)}</td>
          <td><span class="count-status-pill ${countStatusClass(count.status)}">${escapeHtml(
        countStatusLabel(count.status)
      )}</span></td>
          <td>${formatDateTimePtBr(count.started_at)}</td>
          <td>
            <div class="row-actions">
              <button class="btn sm ghost" data-count-action="open" data-count-id="${count.id}">${
        I18N_PTBR.inventory_count.actions.open
      }</button>
              <button class="btn sm ghost" data-count-action="close" data-count-id="${count.id}" ${
        count.status === "OPEN" ? "" : "disabled"
      }>${I18N_PTBR.inventory_count.actions.close}</button>
              <button class="btn sm ghost" data-count-action="post" data-count-id="${count.id}" ${
        count.status === "CLOSED" ? "" : "disabled"
      }>${I18N_PTBR.inventory_count.actions.apply}</button>
              <button class="btn sm ghost" data-count-action="cancel" data-count-id="${count.id}" ${
        ["OPEN", "CLOSED"].includes(count.status) ? "" : "disabled"
      }>${I18N_PTBR.inventory_count.actions.cancel}</button>
              <button class="btn sm ghost" data-count-action="details" data-count-id="${count.id}">${
        I18N_PTBR.inventory_count.actions.details
      }</button>
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
          <div class="skeleton line" style="width: 240px;"></div>
          <div class="skeleton line" style="width: 460px; margin-top: 8px;"></div>
        </div>
        <div style="display:flex; gap:8px;">
          <div class="skeleton block" style="width: 150px; height: 42px;"></div>
          <div class="skeleton block" style="width: 130px; height: 42px;"></div>
        </div>
      </div>
      <div class="skeleton block" style="margin-top: 14px; height: 180px;"></div>
    </section>

    <section class="mini-kpi-grid">
      ${new Array(4)
        .fill("<article class='mini-kpi-card'><div class='skeleton block' style='height:96px;'></div></article>")
        .join("")}
    </section>

    <section class="panel table-card reveal">
      <div class="skeleton line" style="width: 300px;"></div>
      <div class="skeleton block" style="height: 360px; margin-top: 10px;"></div>
    </section>
  `;
}

function renderListState(view) {
  const data = state.inventoryCount.data;
  const filters = state.inventoryCount.filters;
  const filtersCollapsed = state.inventoryCount.ui.filtersCollapsed;
  const locationOptions = locationsForBranch(data, filters.branchId);
  const customDisabled = filters.period !== "custom";
  const pageInfo = view.pageInfo;
  const sortDateArrow =
    state.inventoryCount.sort.key === "started_at"
      ? state.inventoryCount.sort.order === "desc"
        ? "↓"
        : "↑"
      : "";
  const sortStatusArrow =
    state.inventoryCount.sort.key === "status"
      ? state.inventoryCount.sort.order === "desc"
        ? "↓"
        : "↑"
      : "";

  const statusOptionsMarkup = `
    <option value="all" ${filters.status === "all" ? "selected" : ""}>${
      I18N_PTBR.inventory_count.filters.status_all
    }</option>
    <option value="OPEN" ${filters.status === "OPEN" ? "selected" : ""}>${
      I18N_PTBR.inventory_count.filters.status_open
    }</option>
    <option value="CLOSED" ${filters.status === "CLOSED" ? "selected" : ""}>${
      I18N_PTBR.inventory_count.filters.status_closed
    }</option>
    <option value="POSTED" ${filters.status === "POSTED" ? "selected" : ""}>${
      I18N_PTBR.inventory_count.filters.status_posted
    }</option>
    <option value="CANCELLED" ${filters.status === "CANCELLED" ? "selected" : ""}>${
      I18N_PTBR.inventory_count.filters.status_cancelled
    }</option>
  `;

  const branchOptionsMarkup = [
    `<option value="all">${I18N_PTBR.inventory_count.filters.branch_all}</option>`,
    ...(data.branches || []).map(
      (branch) =>
        `<option value="${branch.id}" ${
          String(branch.id) === String(filters.branchId) ? "selected" : ""
        }>${escapeHtml(branch.name)}</option>`
    ),
  ].join("");

  const locationOptionsMarkup = [
    `<option value="all">${I18N_PTBR.inventory_count.filters.location_all}</option>`,
    ...locationOptions.map(
      (location) =>
        `<option value="${location.id}" ${
          String(location.id) === String(filters.locationId) ? "selected" : ""
        }>${escapeHtml(location.name)}</option>`
    ),
  ].join("");

  const responsibleOptionsMarkup = [
    `<option value="all">${I18N_PTBR.inventory_count.filters.responsible_all}</option>`,
    ...view.responsibleOptions.map(
      (responsible) =>
        `<option value="${escapeHtml(responsible)}" ${
          String(responsible) === String(filters.responsible) ? "selected" : ""
        }>${escapeHtml(responsible)}</option>`
    ),
  ].join("");

  return `
    <section class="panel pad reveal">
      ${
        state.inventoryCount.showDemoBanner
          ? `<div class="banner"><i data-lucide="flask-conical"></i>${I18N_PTBR.mode_demo_banner}</div>`
          : ""
      }
      <div class="page-head" style="margin-top:${state.inventoryCount.showDemoBanner ? "12px" : "0"};">
        <div>
          <div class="breadcrumbs">${I18N_PTBR.inventory_count.breadcrumb}</div>
          <h1>${I18N_PTBR.inventory_count.title}</h1>
          <p class="section-subtitle">${I18N_PTBR.inventory_count.subtitle}</p>
          <small>${I18N_PTBR.last_update}: <strong>${formatHourMinutePtBr(
    state.inventoryCount.lastUpdatedIso || data.generated_at
  )}</strong></small>
        </div>
        <div class="movements-actions">
          <button class="btn primary" id="newInventoryCountBtn"><i data-lucide="plus"></i>${
            I18N_PTBR.inventory_count.actions.new
          }</button>
          <button class="btn" id="exportInventoryCountBtn"><i data-lucide="download"></i>${
            I18N_PTBR.inventory_count.actions.export_report
          }</button>
          <button class="btn ghost" id="clearInventoryCountFiltersBtn"><i data-lucide="x-circle"></i>${
            I18N_PTBR.inventory_count.actions.clear_filters
          }</button>
        </div>
      </div>

      <div class="movements-filter-toolbar">
        <button
          class="btn sm ghost"
          id="toggleInventoryCountFiltersBtn"
          aria-expanded="${filtersCollapsed ? "false" : "true"}"
          aria-controls="inventoryCountFiltersPanel"
        >
          <i data-lucide="${filtersCollapsed ? "chevron-down" : "chevron-up"}"></i>
          ${
            filtersCollapsed
              ? I18N_PTBR.inventory_count.actions.filter_show
              : I18N_PTBR.inventory_count.actions.filter_hide
          }
        </button>
        <small class="section-subtitle">${
          view.rows.length
        } ${I18N_PTBR.inventory_count.filters.result_count}</small>
      </div>

      <div class="movements-filters ${filtersCollapsed ? "is-collapsed" : ""}" id="inventoryCountFiltersPanel">
        <div class="movements-filter-grid count-filter-grid">
          <div class="field">
            <label for="countStatusFilter">${I18N_PTBR.inventory_count.filters.status}</label>
            <select id="countStatusFilter">${statusOptionsMarkup}</select>
          </div>

          <div class="field">
            <label for="countBranchFilter">${I18N_PTBR.inventory_count.filters.branch}</label>
            <select id="countBranchFilter">${branchOptionsMarkup}</select>
          </div>

          <div class="field">
            <label for="countLocationFilter">${I18N_PTBR.inventory_count.filters.location}</label>
            <select id="countLocationFilter">${locationOptionsMarkup}</select>
          </div>

          <div class="field">
            <label for="countPeriodFilter">${I18N_PTBR.inventory_count.filters.period}</label>
            <select id="countPeriodFilter">
              <option value="7" ${filters.period === "7" ? "selected" : ""}>${
                I18N_PTBR.inventory_count.filters.period_7
              }</option>
              <option value="30" ${filters.period === "30" ? "selected" : ""}>${
                I18N_PTBR.inventory_count.filters.period_30
              }</option>
              <option value="90" ${filters.period === "90" ? "selected" : ""}>${
                I18N_PTBR.inventory_count.filters.period_90
              }</option>
              <option value="custom" ${filters.period === "custom" ? "selected" : ""}>${
                I18N_PTBR.inventory_count.filters.period_custom
              }</option>
            </select>
          </div>

          <div class="field">
            <label for="countResponsibleFilter">${I18N_PTBR.inventory_count.filters.responsible}</label>
            <select id="countResponsibleFilter">${responsibleOptionsMarkup}</select>
          </div>

          <div class="field count-toggle-field">
            <label for="countDivergenceOnlyToggle">${I18N_PTBR.inventory_count.filters.divergence_only}</label>
            <label class="transfer-toggle-inline">
              <input id="countDivergenceOnlyToggle" type="checkbox" ${
                filters.divergenceOnly ? "checked" : ""
              } />
              <span>${I18N_PTBR.inventory_count.filters.divergence_only}</span>
            </label>
          </div>

          <div class="field">
            <label for="countCustomFrom">${I18N_PTBR.inventory_count.filters.custom_from}</label>
            <input id="countCustomFrom" type="date" value="${filters.customFrom}" ${
    customDisabled ? "disabled" : ""
  } />
          </div>

          <div class="field">
            <label for="countCustomTo">${I18N_PTBR.inventory_count.filters.custom_to}</label>
            <input id="countCustomTo" type="date" value="${filters.customTo}" ${
    customDisabled ? "disabled" : ""
  } />
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
          <h2 class="section-title">${I18N_PTBR.inventory_count.table.title}</h2>
          <p class="section-subtitle">${I18N_PTBR.inventory_count.table.subtitle}</p>
        </div>
        <div class="table-tools">
          <button class="btn sm ghost" id="refreshInventoryCountBtn"><i data-lucide="refresh-cw"></i>${
            I18N_PTBR.inventory_count.actions.refresh
          }</button>
        </div>
      </div>

      <div class="table-wrap movements-table-wrap count-table-wrap">
        <table class="count-table">
          <thead>
            <tr>
              <th>${I18N_PTBR.inventory_count.table.code}</th>
              <th>${I18N_PTBR.inventory_count.table.branch_location}</th>
              <th>${I18N_PTBR.inventory_count.table.responsible}</th>
              <th>${I18N_PTBR.inventory_count.table.items_counted}</th>
              <th>${I18N_PTBR.inventory_count.table.divergences}</th>
              <th>
                <button class="table-sort-btn" id="countSortStatusBtn" aria-label="${escapeHtml(
                  I18N_PTBR.inventory_count.table.sort_status
                )}">
                  ${I18N_PTBR.inventory_count.table.status} ${sortStatusArrow}
                </button>
              </th>
              <th>
                <button class="table-sort-btn" id="countSortDateBtn" aria-label="${escapeHtml(
                  I18N_PTBR.inventory_count.table.sort_date
                )}">
                  ${I18N_PTBR.inventory_count.table.created_at} ${sortDateArrow}
                </button>
              </th>
              <th>${I18N_PTBR.inventory_count.table.actions}</th>
            </tr>
          </thead>
          <tbody>
            ${renderRows(view)}
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <small>${I18N_PTBR.inventory_count.table.showing} ${pageInfo.start}-${pageInfo.end} ${
    I18N_PTBR.inventory_count.table.of
  } ${pageInfo.totalRows}</small>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn sm ghost" id="countPrevPageBtn" ${
            pageInfo.page <= 1 ? "disabled" : ""
          }>Anterior</button>
          <small>${I18N_PTBR.inventory_count.table.page} ${pageInfo.page} ${
    I18N_PTBR.inventory_count.table.of
  } ${pageInfo.totalPages}</small>
          <button class="btn sm ghost" id="countNextPageBtn" ${
            pageInfo.page >= pageInfo.totalPages ? "disabled" : ""
          }>Proxima</button>
        </div>
      </div>
    </section>
  `;
}

function buildExecutionView() {
  const activeCountId = state.inventoryCount.ui.activeCountId;
  if (activeCountId == null) return null;

  const count = findCountById(activeCountId);
  if (!count) return null;

  const data = state.inventoryCount.data;
  const maps = getMaps(data);
  const branch = maps.branchById.get(Number(count.branch_id));
  const location = maps.locationById.get(Number(count.location_id));
  const lines = Array.isArray(count.lines) ? count.lines : [];

  return {
    count,
    branch,
    location,
    lines,
    progress: computeCounterProgress(lines),
    summary: computeCounterSummary(lines),
    editable: isCounterEditable(count.status),
  };
}

function renderExecutionRows(execution) {
  if (!execution.lines.length) {
    return `
      <tr>
        <td colspan="5">
          <div class="empty-state">
            <i data-lucide="inbox"></i>
            <span>Sem itens para esta contagem.</span>
          </div>
        </td>
      </tr>
    `;
  }

  return execution.lines
    .map((line, index) => {
      const status =
        line.counted_qty == null
          ? "pending"
          : diffSeverity(line.diff_qty, line.system_qty) === "equal"
          ? "equal"
          : diffSeverity(line.diff_qty, line.system_qty) === "critical"
          ? "critical"
          : "warning";
      const statusLabel =
        status === "pending"
          ? I18N_PTBR.inventory_count.execution.status_pending
          : status === "equal"
          ? I18N_PTBR.inventory_count.execution.status_equal
          : status === "critical"
          ? I18N_PTBR.inventory_count.execution.status_critical
          : I18N_PTBR.inventory_count.execution.status_warning;
      const diffValue = Number(line.diff_qty || 0);
      const diffClass = diffValue === 0 ? "" : diffValue > 0 ? "qty-neg" : "qty-pos";

      return `
        <tr class="count-line-row ${status} ${flashLineSkuId === Number(line.sku_id) ? "is-updated" : ""}" data-line-row-sku="${line.sku_id}">
          <td>
            <div class="item-stack">
              <strong>${escapeHtml(line.sku_name || `Variacao ${line.sku_id}`)}</strong>
              <small>${escapeHtml(line.sku_code || `VAR-${line.sku_id}`)} ${
        line.barcode ? `• ${escapeHtml(line.barcode)}` : ""
      }</small>
            </div>
          </td>
          <td class="qty-cell">${formatInt(line.system_qty)}</td>
          <td>
            <input
              class="count-line-input"
              type="number"
              min="0"
              step="1"
              value="${line.counted_qty == null ? "" : Number(line.counted_qty)}"
              data-line-input-sku="${line.sku_id}"
              data-line-input-index="${index}"
              aria-label="Quantidade contada do item ${escapeHtml(line.sku_name || String(line.sku_id))}"
              ${execution.editable ? "" : "disabled"}
            />
          </td>
          <td class="qty-cell ${diffClass}">${diffValue > 0 ? "+" : ""}${formatInt(diffValue)}</td>
          <td><span class="count-line-status ${status}">${escapeHtml(statusLabel)}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderExecutionState(execution) {
  return `
    <section class="panel pad reveal count-exec-shell">
      <header class="count-exec-header border-gradient">
        <div>
          <div class="breadcrumbs">${I18N_PTBR.inventory_count.breadcrumb}</div>
          <h1>${I18N_PTBR.inventory_count.execution.title}</h1>
          <p class="section-subtitle">${escapeHtml(execution.count.count_code)} • ${escapeHtml(
    execution.branch?.name || "-"
  )} / ${escapeHtml(execution.location?.name || "-")} • ${escapeHtml(
    execution.count.responsible_name || "-"
  )}</p>
          <div class="count-exec-progress-wrap">
            <small>${I18N_PTBR.inventory_count.execution.progress}: ${execution.progress.percent}%</small>
            <div class="count-exec-progress"><span style="width:${execution.progress.percent}%;"></span></div>
          </div>
        </div>
        <div class="count-exec-actions">
          <button class="btn ghost" id="backToCountListBtn"><i data-lucide="arrow-left"></i>${
            I18N_PTBR.inventory_count.actions.back_list
          }</button>
          <button class="btn ghost" id="saveCountLinesBtn" ${
            execution.editable ? "" : "disabled"
          }><i data-lucide="save"></i>${I18N_PTBR.inventory_count.actions.save}</button>
          <button class="btn ghost" id="closeCountBtn" ${
            execution.count.status === "OPEN" ? "" : "disabled"
          }><i data-lucide="lock"></i>${I18N_PTBR.inventory_count.actions.close_count}</button>
          <button class="btn ghost" id="postCountBtn" ${
            execution.count.status === "CLOSED" ? "" : "disabled"
          }><i data-lucide="check-check"></i>${I18N_PTBR.inventory_count.actions.apply}</button>
          <button class="btn ghost" id="cancelCountBtn" ${
            ["OPEN", "CLOSED"].includes(execution.count.status) ? "" : "disabled"
          }><i data-lucide="x-circle"></i>${I18N_PTBR.inventory_count.actions.cancel_count}</button>
        </div>
      </header>

      <div class="count-exec-grid">
        <section class="panel pad count-exec-main">
          <div class="field count-scanner-field">
            <label for="countScannerInput">${I18N_PTBR.inventory_count.execution.scanner_label}</label>
            <input
              id="countScannerInput"
              type="search"
              class="count-scanner-input"
              placeholder="${escapeHtml(I18N_PTBR.inventory_count.execution.scanner_placeholder)}"
            />
          </div>

          <div class="table-wrap count-lines-table-wrap">
            <table class="count-lines-table">
              <thead>
                <tr>
                  <th>${I18N_PTBR.inventory_count.execution.product}</th>
                  <th>${I18N_PTBR.inventory_count.execution.system_qty}</th>
                  <th>${I18N_PTBR.inventory_count.execution.counted_qty}</th>
                  <th>${I18N_PTBR.inventory_count.execution.diff_qty}</th>
                  <th>${I18N_PTBR.inventory_count.execution.status}</th>
                </tr>
              </thead>
              <tbody>
                ${renderExecutionRows(execution)}
              </tbody>
            </table>
          </div>
        </section>

        <aside class="panel pad count-exec-side">
          <h2 class="section-title">Resumo</h2>
          <div class="count-summary-grid">
            <div><small>${I18N_PTBR.inventory_count.execution.total_items}</small><strong>${formatInt(
    execution.summary.totalItems
  )}</strong></div>
            <div><small>${I18N_PTBR.inventory_count.execution.counted_items}</small><strong>${formatInt(
    execution.summary.countedItems
  )}</strong></div>
            <div><small>${I18N_PTBR.inventory_count.execution.divergent_items}</small><strong>${formatInt(
    execution.summary.divergentItems
  )}</strong></div>
            <div><small>${I18N_PTBR.inventory_count.execution.diff_units}</small><strong>${
    execution.summary.diffUnits > 0 ? "+" : ""
  }${formatInt(execution.summary.diffUnits)}</strong></div>
            <div><small>${I18N_PTBR.inventory_count.execution.diff_value}</small><strong>${formatCurrency(
    execution.summary.diffValue
  )}</strong></div>
            <div><small>Status</small><strong>${escapeHtml(countStatusLabel(execution.count.status))}</strong></div>
          </div>
          ${execution.editable ? "" : `<small class=\"section-subtitle\">${I18N_PTBR.inventory_count.execution.read_only}</small>`}
        </aside>
      </div>
    </section>
  `;
}

function appendCountHistory(count, type, label, atIso) {
  const history = Array.isArray(count.history) ? [...count.history] : [];
  history.push({
    key: `${type}-${count.id}-${Date.now()}`,
    type,
    label,
    at: atIso,
    by: "Operador FreeShop",
  });
  history.sort((left, right) => {
    const leftMs = DateTime.fromISO(String(left.at || "")).toMillis();
    const rightMs = DateTime.fromISO(String(right.at || "")).toMillis();
    if (Number.isNaN(leftMs) || Number.isNaN(rightMs)) return 0;
    return leftMs - rightMs;
  });
  return history;
}

function applyLocalCountTransition(count, action) {
  const nowIso = DateTime.now().toISO();
  const updated = {
    ...count,
    lines: (count.lines || []).map((line) => ({ ...line })),
    history: Array.isArray(count.history) ? [...count.history] : [],
  };

  if (action === "close" && count.status === "OPEN") {
    updated.status = "CLOSED";
    updated.closed_at = nowIso;
    updated.history = appendCountHistory(updated, "closed", "Contagem fechada", nowIso);
    return updated;
  }

  if (action === "post" && count.status === "CLOSED") {
    updated.status = "POSTED";
    updated.posted_at = nowIso;
    updated.lines = updated.lines.map((line) => ({ ...line, posted: true }));
    updated.history = appendCountHistory(updated, "posted", "Ajustes aplicados", nowIso);
    return updated;
  }

  if (action === "cancel" && ["OPEN", "CLOSED"].includes(count.status)) {
    updated.status = "CANCELLED";
    updated.cancelled_at = nowIso;
    updated.history = appendCountHistory(updated, "cancelled", "Contagem cancelada", nowIso);
    return updated;
  }

  return null;
}

async function runCountAction(count, action) {
  let confirmMessage = "";
  if (action === "close") {
    confirmMessage = I18N_PTBR.inventory_count.execution.close_confirm;
  } else if (action === "post") {
    confirmMessage = I18N_PTBR.inventory_count.execution.post_confirm;
  } else if (action === "cancel") {
    const first = window.confirm(I18N_PTBR.inventory_count.execution.cancel_confirm_1);
    if (!first) return false;
    const second = window.confirm(I18N_PTBR.inventory_count.execution.cancel_confirm_2);
    if (!second) return false;
  }

  if (action !== "cancel") {
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return false;
  }

  try {
    let updated = null;

    if (!state.inventoryCount.demoMode && state.inventoryCount.mode === "api") {
      if (action === "close") {
        updated = await closeInventoryCount(count.id);
      } else if (action === "post") {
        updated = await postInventoryCount(count.id);
      } else if (action === "cancel") {
        updated = await cancelInventoryCount(count.id);
      }
    } else {
      updated = applyLocalCountTransition(count, action);
    }

    if (!updated) {
      throw new Error("count_action_failed");
    }

    upsertCountOnState(updated);

    const successMessage =
      action === "close"
        ? I18N_PTBR.inventory_count.execution.closed_ok
        : action === "post"
        ? I18N_PTBR.inventory_count.execution.posted_ok
        : I18N_PTBR.inventory_count.execution.cancelled_ok;

    showToast({
      title: I18N_PTBR.inventory_count.title,
      message: successMessage,
      type: "success",
    });

    return true;
  } catch {
    const errorMessage =
      action === "close"
        ? I18N_PTBR.inventory_count.execution.close_error
        : action === "post"
        ? I18N_PTBR.inventory_count.execution.post_error
        : I18N_PTBR.inventory_count.execution.cancel_error;

    showToast({
      title: I18N_PTBR.inventory_count.title,
      message: errorMessage,
      type: "error",
    });

    return false;
  }
}

async function saveCountLines(execution) {
  const linesPayload = buildCounterPatchPayload(execution.lines);

  try {
    if (!state.inventoryCount.demoMode && state.inventoryCount.mode === "api") {
      const updated = await patchInventoryCountLines(execution.count.id, linesPayload);
      upsertCountOnState(updated);
    } else {
      mutateInventoryCountData((draft) => {
        const count = (draft.counts || []).find((row) => Number(row.id) === Number(execution.count.id));
        if (!count) return;
        count.last_saved_at = DateTime.now().toISO();
        count.history = appendCountHistory(count, "saved", "Contagem salva", count.last_saved_at);
      });
    }

    showToast({
      title: I18N_PTBR.inventory_count.title,
      message: I18N_PTBR.inventory_count.execution.saved,
      type: "success",
    });
  } catch {
    showToast({
      title: I18N_PTBR.inventory_count.title,
      message: I18N_PTBR.inventory_count.execution.save_error,
      type: "error",
    });
  }
}

function openCountDetails(count) {
  const maps = getMaps(state.inventoryCount.data);
  const branch = maps.branchById.get(Number(count.branch_id));
  const location = maps.locationById.get(Number(count.location_id));
  const lines = Array.isArray(count.lines) ? count.lines : [];
  const summary = computeCounterSummary(lines);
  const history = Array.isArray(count.history) ? count.history : [];

  openDrawer({
    title: I18N_PTBR.inventory_count.details.title,
    subtitle: `${count.count_code} • ${countStatusLabel(count.status)}`,
    bodyHtml: `
      <section class="drawer-section">
        <h4>${I18N_PTBR.inventory_count.details.summary}</h4>
        <div class="drawer-grid">
          <div><small>${I18N_PTBR.inventory_count.details.code}</small><strong>${escapeHtml(count.count_code)}</strong></div>
          <div><small>${I18N_PTBR.inventory_count.details.status}</small><strong>${escapeHtml(countStatusLabel(count.status))}</strong></div>
          <div><small>${I18N_PTBR.inventory_count.details.branch}</small><strong>${escapeHtml(branch?.name || "-")}</strong></div>
          <div><small>${I18N_PTBR.inventory_count.details.location}</small><strong>${escapeHtml(location?.name || "-")}</strong></div>
          <div><small>${I18N_PTBR.inventory_count.details.responsible}</small><strong>${escapeHtml(count.responsible_name || "-")}</strong></div>
          <div><small>${I18N_PTBR.inventory_count.details.started_at}</small><strong>${formatDateTimePtBr(count.started_at)}</strong></div>
          <div><small>${I18N_PTBR.inventory_count.details.closed_at}</small><strong>${formatDateTimePtBr(count.closed_at)}</strong></div>
          <div><small>${I18N_PTBR.inventory_count.details.posted_at}</small><strong>${formatDateTimePtBr(count.posted_at)}</strong></div>
          <div><small>${I18N_PTBR.inventory_count.details.cancelled_at}</small><strong>${formatDateTimePtBr(count.cancelled_at)}</strong></div>
        </div>
      </section>

      <section class="drawer-section">
        <h4>${I18N_PTBR.inventory_count.details.divergence}</h4>
        <div class="drawer-grid">
          <div><small>${I18N_PTBR.inventory_count.details.total_items}</small><strong>${formatInt(summary.totalItems)}</strong></div>
          <div><small>${I18N_PTBR.inventory_count.details.counted_items}</small><strong>${formatInt(summary.countedItems)}</strong></div>
          <div><small>${I18N_PTBR.inventory_count.details.divergent_items}</small><strong>${formatInt(summary.divergentItems)}</strong></div>
          <div><small>${I18N_PTBR.inventory_count.details.diff_units}</small><strong>${summary.diffUnits > 0 ? "+" : ""}${formatInt(summary.diffUnits)}</strong></div>
          <div><small>${I18N_PTBR.inventory_count.details.diff_value}</small><strong>${formatCurrency(summary.diffValue)}</strong></div>
        </div>
      </section>

      <section class="drawer-section">
        <h4>${I18N_PTBR.inventory_count.details.history}</h4>
        ${
          history.length
            ? `<div class="transfer-timeline">${history
                .map(
                  (event) =>
                    `<div class="transfer-timeline-item"><span class="transfer-timeline-dot"></span><div><strong>${escapeHtml(
                      event.label || "-"
                    )}</strong><small>${formatDateTimePtBr(event.at)} • ${escapeHtml(event.by || "-")}</small></div></div>`
                )
                .join("")}</div>`
            : `<p class="section-subtitle">${I18N_PTBR.inventory_count.details.no_history}</p>`
        }
      </section>
    `,
    footerHtml: `
      <div class="drawer-footer">
        <button class="btn ghost" type="button" data-close-drawer>${I18N_PTBR.inventory_count.details.close}</button>
      </div>
    `,
  });
}

function buildLocalNewCount(payload) {
  const nowIso = DateTime.now().toISO();
  const data = state.inventoryCount.data;
  const items = data?.items || [];
  const countId = nextId(data?.counts || []);
  const lineTarget = Math.max(120, Math.min(260, Math.floor(items.length * 0.5)));
  const selected = [];
  const used = new Set();

  while (selected.length < lineTarget && used.size < items.length) {
    const index = Math.floor(Math.random() * items.length);
    const item = items[index];
    if (!item) break;
    if (used.has(Number(item.id))) continue;
    used.add(Number(item.id));
    selected.push({
      id: selected.length + 1,
      count_id: countId,
      sku_id: Number(item.id),
      system_qty: Math.max(0, Math.floor(Math.random() * 180)),
      counted_qty: null,
      diff_qty: 0,
      posted: false,
    });
  }

  return {
    id: countId,
    count_code: `CNT-${String(countId).padStart(6, "0")}`,
    branch_id: Number(payload.branch_id),
    location_id: Number(payload.location_id),
    status: "OPEN",
    started_at: nowIso,
    closed_at: null,
    posted_at: null,
    cancelled_at: null,
    created_by: "local",
    responsible_name: payload.responsible_name || "Operador FreeShop",
    lines: selected,
    history: [
      {
        key: `created-${countId}`,
        type: "created",
        label: "Contagem aberta",
        at: nowIso,
        by: payload.responsible_name || "Operador FreeShop",
      },
    ],
    last_saved_at: nowIso,
  };
}

function openNewCountDrawer(view) {
  const data = state.inventoryCount.data;
  if (!data) return;

  const branches = data.branches || [];
  const defaultBranchId =
    state.inventoryCount.filters.branchId !== "all"
      ? String(state.inventoryCount.filters.branchId)
      : String(branches[0]?.id || "");

  openDrawer({
    title: I18N_PTBR.inventory_count.create.title,
    subtitle: I18N_PTBR.inventory_count.create.subtitle,
    submitLabel: I18N_PTBR.inventory_count.actions.new_confirm,
    cancelLabel: I18N_PTBR.drawer.cancel,
    bodyHtml: `
      <div class="field">
        <label for="newCountBranch">${I18N_PTBR.inventory_count.create.branch} *</label>
        <select id="newCountBranch" name="branchId" required>
          ${branches
            .map(
              (branch) =>
                `<option value="${branch.id}" ${
                  String(branch.id) === defaultBranchId ? "selected" : ""
                }>${escapeHtml(branch.name)}</option>`
            )
            .join("")}
        </select>
      </div>

      <div class="field">
        <label for="newCountLocation">${I18N_PTBR.inventory_count.create.location} *</label>
        <select id="newCountLocation" name="locationId" required></select>
      </div>

      <div class="field">
        <label for="newCountResponsible">${I18N_PTBR.inventory_count.create.responsible}</label>
        <input id="newCountResponsible" name="responsible" type="text" value="Operador FreeShop" />
      </div>
    `,
    onOpen: (overlay) => {
      const branchSelect = overlay.querySelector("#newCountBranch");
      const locationSelect = overlay.querySelector("#newCountLocation");

      function refreshLocationOptions() {
        const options = locationsForBranch(data, branchSelect.value);
        locationSelect.innerHTML = options
          .map((location) => `<option value="${location.id}">${escapeHtml(location.name)}</option>`)
          .join("");

        if (!options.length) {
          locationSelect.innerHTML = `<option value="">Sem local disponivel</option>`;
        }
      }

      refreshLocationOptions();
      branchSelect.addEventListener("change", refreshLocationOptions);
    },
    onSubmit: async (formData, helpers) => {
      const branchId = Number(formData.get("branchId"));
      const locationId = Number(formData.get("locationId"));
      const responsibleName = compact(formData.get("responsible"));

      if (!branchId || !locationId) {
        helpers.setError(I18N_PTBR.inventory_count.create.required_error);
        return false;
      }

      try {
        let created = null;
        if (!state.inventoryCount.demoMode && state.inventoryCount.mode === "api") {
          created = await createInventoryCount({
            branch_id: branchId,
            location_id: locationId,
            scope: "ALL",
          });
          created.responsible_name = responsibleName || created.responsible_name;
        } else {
          created = buildLocalNewCount({
            branch_id: branchId,
            location_id: locationId,
            responsible_name: responsibleName,
          });
        }

        if (!created) {
          throw new Error("count_create_failed");
        }

        upsertCountOnState(created, { prepend: true });
        setInventoryCountActiveCount(created.id);
        scannerFocusRequested = true;

        showToast({
          title: I18N_PTBR.inventory_count.title,
          message: I18N_PTBR.inventory_count.create.success,
          type: "success",
        });
        return true;
      } catch {
        helpers.setError(I18N_PTBR.inventory_count.create.error);
        return false;
      }
    },
  });
}

function exportReport(view) {
  const today = DateTime.now().toFormat("yyyy-LL-dd");
  const activeExecution = buildExecutionView();

  if (activeExecution) {
    const linesRows = activeExecution.lines.map((line) => ({
      codigo_contagem: activeExecution.count.count_code,
      item: line.sku_name || `Variacao ${line.sku_id}`,
      variacao: line.sku_code || "",
      barcode: line.barcode || "",
      qtd_sistema: formatInt(line.system_qty),
      qtd_contada: line.counted_qty == null ? "" : formatInt(line.counted_qty),
      diferenca: `${Number(line.diff_qty || 0) > 0 ? "+" : ""}${formatInt(line.diff_qty)}`,
      status: line.diff_qty === 0 ? "Igual" : "Divergencia",
    }));

    downloadCsv({
      filename: `contagem_${today}.csv`,
      columns: [
        { key: "codigo_contagem", label: "Codigo da contagem" },
        { key: "item", label: "Produto" },
        { key: "variacao", label: "Variacao" },
        { key: "barcode", label: "Codigo de barras" },
        { key: "qtd_sistema", label: "Qtd sistema" },
        { key: "qtd_contada", label: "Qtd contada" },
        { key: "diferenca", label: "Diferenca" },
        { key: "status", label: "Status" },
      ],
      rows: linesRows,
    });

    showToast({
      title: I18N_PTBR.inventory_count.title,
      message: I18N_PTBR.inventory_count.toasts.csv_success,
      type: "success",
    });
    return;
  }

  if (!view.rows.length) {
    showToast({
      title: I18N_PTBR.inventory_count.title,
      message: I18N_PTBR.inventory_count.toasts.csv_empty,
      type: "error",
    });
    return;
  }

  const rows = view.rows.map((count) => ({
    codigo: count.count_code,
    filial_local: `${
      view.maps.branchById.get(Number(count.branch_id))?.name || "-"
    } / ${view.maps.locationById.get(Number(count.location_id))?.name || "-"}`,
    responsavel: count.responsible_name || "-",
    itens_contados: `${formatInt(count.counted_lines)} / ${formatInt(count.total_lines)}`,
    divergencias: formatInt(count.divergence_count),
    status: countStatusLabel(count.status),
    criado_em: formatDateTimePtBr(count.started_at),
  }));

  downloadCsv({
    filename: `contagem_${today}.csv`,
    columns: [
      { key: "codigo", label: "Codigo da contagem" },
      { key: "filial_local", label: "Filial / Local" },
      { key: "responsavel", label: "Responsavel" },
      { key: "itens_contados", label: "Itens contados" },
      { key: "divergencias", label: "Divergencias" },
      { key: "status", label: "Status" },
      { key: "criado_em", label: "Data de criacao" },
    ],
    rows,
  });

  showToast({
    title: I18N_PTBR.inventory_count.title,
    message: I18N_PTBR.inventory_count.toasts.csv_success,
    type: "success",
  });
}

async function refreshInventoryCountData({ feedback = false } = {}) {
  const currentRequest = ++refreshSequence;
  setInventoryCountLoading(true);
  const payload = await loadInventoryCountsPayload(state.inventoryCount.filters, state.inventoryCount.sort);

  if (currentRequest !== refreshSequence) {
    return payload;
  }

  setInventoryCountPayload(payload);

  if (feedback) {
    if (payload.mode === "demo") {
      showToast({
        title: I18N_PTBR.inventory_count.title,
        message: I18N_PTBR.inventory_count.toasts.fallback_demo,
        type: "error",
      });
    } else {
      showToast({
        title: I18N_PTBR.inventory_count.title,
        message: I18N_PTBR.inventory_count.toasts.refreshed,
        type: "success",
      });
    }
  }

  return payload;
}

const debouncedApiRefresh = debounce(() => {
  if (state.inventoryCount.mode === "api" && !state.inventoryCount.demoMode) {
    refreshInventoryCountData();
  }
}, 360);

function resetSingleFilter(filterKey) {
  if (filterKey === "status") {
    updateInventoryCountFilter("status", "all");
    return;
  }

  if (filterKey === "branchId" || filterKey === "locationId") {
    updateInventoryCountFilter(filterKey, "all");
    return;
  }

  if (filterKey === "period") {
    updateInventoryCountFilter("period", "30");
    return;
  }

  if (filterKey === "customRange") {
    updateInventoryCountFilter("period", "30");
    return;
  }

  if (filterKey === "responsible") {
    updateInventoryCountFilter("responsible", "all");
    return;
  }

  if (filterKey === "divergenceOnly") {
    updateInventoryCountFilter("divergenceOnly", false);
  }
}

function bindListEvents(view) {
  const statusFilter = document.getElementById("countStatusFilter");
  const branchFilter = document.getElementById("countBranchFilter");
  const locationFilter = document.getElementById("countLocationFilter");
  const periodFilter = document.getElementById("countPeriodFilter");
  const responsibleFilter = document.getElementById("countResponsibleFilter");
  const divergenceToggle = document.getElementById("countDivergenceOnlyToggle");
  const customFrom = document.getElementById("countCustomFrom");
  const customTo = document.getElementById("countCustomTo");
  const prevPage = document.getElementById("countPrevPageBtn");
  const nextPage = document.getElementById("countNextPageBtn");
  const refreshButton = document.getElementById("refreshInventoryCountBtn");
  const newButton = document.getElementById("newInventoryCountBtn");
  const exportButton = document.getElementById("exportInventoryCountBtn");
  const clearButton = document.getElementById("clearInventoryCountFiltersBtn");
  const toggleFiltersButton = document.getElementById("toggleInventoryCountFiltersBtn");
  const sortDateButton = document.getElementById("countSortDateBtn");
  const sortStatusButton = document.getElementById("countSortStatusBtn");

  statusFilter?.addEventListener("change", (event) => {
    updateInventoryCountFilter("status", event.target.value);
    debouncedApiRefresh();
  });

  branchFilter?.addEventListener("change", (event) => {
    updateInventoryCountFilter("branchId", event.target.value);
    if (state.inventoryCount.filters.locationId !== "all") {
      const locationStillValid = locationsForBranch(state.inventoryCount.data, event.target.value).some(
        (location) => Number(location.id) === Number(state.inventoryCount.filters.locationId)
      );
      if (!locationStillValid) {
        updateInventoryCountFilter("locationId", "all");
      }
    }
    debouncedApiRefresh();
  });

  locationFilter?.addEventListener("change", (event) => {
    updateInventoryCountFilter("locationId", event.target.value);
    debouncedApiRefresh();
  });

  periodFilter?.addEventListener("change", (event) => {
    updateInventoryCountFilter("period", event.target.value);
    debouncedApiRefresh();
  });

  responsibleFilter?.addEventListener("change", (event) => {
    updateInventoryCountFilter("responsible", event.target.value);
  });

  divergenceToggle?.addEventListener("change", (event) => {
    updateInventoryCountFilter("divergenceOnly", Boolean(event.target.checked));
  });

  customFrom?.addEventListener("change", (event) => {
    updateInventoryCountFilter("period", "custom");
    updateInventoryCountFilter("customFrom", event.target.value);
    debouncedApiRefresh();
  });

  customTo?.addEventListener("change", (event) => {
    updateInventoryCountFilter("period", "custom");
    updateInventoryCountFilter("customTo", event.target.value);
    debouncedApiRefresh();
  });

  prevPage?.addEventListener("click", () => {
    setInventoryCountPage(view.pageInfo.page - 1);
  });

  nextPage?.addEventListener("click", () => {
    setInventoryCountPage(view.pageInfo.page + 1);
  });

  refreshButton?.addEventListener("click", () => {
    refreshInventoryCountData({ feedback: true });
  });

  newButton?.addEventListener("click", () => {
    openNewCountDrawer(view);
  });

  exportButton?.addEventListener("click", () => {
    exportReport(view);
  });

  clearButton?.addEventListener("click", () => {
    clearInventoryCountFilters();
    setInventoryCountFiltersCollapsed(false);
    showToast({
      title: I18N_PTBR.inventory_count.title,
      message: I18N_PTBR.inventory_count.toasts.filters_cleared,
      type: "success",
    });
    debouncedApiRefresh();
  });

  toggleFiltersButton?.addEventListener("click", () => {
    toggleInventoryCountFiltersCollapsed();
  });

  sortDateButton?.addEventListener("click", () => {
    const nextOrder =
      state.inventoryCount.sort.key === "started_at" && state.inventoryCount.sort.order === "desc"
        ? "asc"
        : "desc";
    setInventoryCountSort("started_at", nextOrder);
    debouncedApiRefresh();
  });

  sortStatusButton?.addEventListener("click", () => {
    const nextOrder =
      state.inventoryCount.sort.key === "status" && state.inventoryCount.sort.order === "asc"
        ? "desc"
        : "asc";
    setInventoryCountSort("status", nextOrder);
    debouncedApiRefresh();
  });

  const rowsById = new Map(view.rows.map((row) => [Number(row.id), row]));

  document.querySelectorAll("[data-count-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const countId = Number(button.getAttribute("data-count-id"));
      const action = button.getAttribute("data-count-action");
      const count = rowsById.get(countId);
      if (!count || !action) return;

      if (action === "open") {
        setInventoryCountActiveCount(count.id);
        scannerFocusRequested = true;
        return;
      }

      if (action === "details") {
        openCountDetails(count);
        return;
      }

      await runCountAction(count, action);
    });
  });

  document.querySelectorAll("[data-remove-count-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-remove-count-filter");
      if (!key) return;
      resetSingleFilter(key);
      debouncedApiRefresh();
    });
  });
}

function bindExecutionEvents(execution) {
  const scannerInput = document.getElementById("countScannerInput");
  const backButton = document.getElementById("backToCountListBtn");
  const saveButton = document.getElementById("saveCountLinesBtn");
  const closeButton = document.getElementById("closeCountBtn");
  const postButton = document.getElementById("postCountBtn");
  const cancelButton = document.getElementById("cancelCountBtn");

  backButton?.addEventListener("click", () => {
    setInventoryCountActiveCount(null);
    keepLineFocusSkuId = null;
  });

  saveButton?.addEventListener("click", () => {
    saveCountLines(execution);
  });

  closeButton?.addEventListener("click", async () => {
    const latest = findCountById(execution.count.id);
    if (!latest) return;
    await runCountAction(latest, "close");
  });

  postButton?.addEventListener("click", async () => {
    const latest = findCountById(execution.count.id);
    if (!latest) return;
    await runCountAction(latest, "post");
  });

  cancelButton?.addEventListener("click", async () => {
    const latest = findCountById(execution.count.id);
    if (!latest) return;
    const cancelled = await runCountAction(latest, "cancel");
    if (cancelled) {
      setInventoryCountActiveCount(null);
      keepLineFocusSkuId = null;
    }
  });

  scannerInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();

    const query = String(scannerInput.value || "").trim();
    const currentCount = findCountById(execution.count.id);
    const lines = currentCount?.lines || execution.lines;
    const lineIndex = searchCounterLineIndex(lines, query);

    if (lineIndex < 0) {
      showToast({
        title: I18N_PTBR.inventory_count.title,
        message: I18N_PTBR.inventory_count.execution.scanner_not_found,
        type: "error",
      });
      scannerInput.select();
      return;
    }

    const target = document.querySelector(`[data-line-input-index="${lineIndex}"]`);
    if (target instanceof HTMLElement) {
      target.focus();
      if (target.select) {
        target.select();
      }
      target.closest("tr")?.classList.add("is-scanner-hit");
      window.setTimeout(() => {
        target.closest("tr")?.classList.remove("is-scanner-hit");
      }, 900);
      target.closest("tr")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  document.querySelectorAll("[data-line-input-sku]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const skuId = Number(input.getAttribute("data-line-input-sku"));
      if (!Number.isFinite(skuId)) return;

      keepLineFocusSkuId = skuId;
      flashLineSkuId = skuId;

      mutateInventoryCountData((draft) => {
        const count = (draft.counts || []).find((row) => Number(row.id) === Number(execution.count.id));
        if (!count) return;
        count.lines = updateCounterLine(count.lines || [], skuId, event.target.value);
      });

      window.setTimeout(() => {
        if (flashLineSkuId === skuId) {
          flashLineSkuId = null;
          setInventoryCountActiveCount(execution.count.id);
        }
      }, 650);
    });

    input.addEventListener("keydown", (event) => {
      if (!["Enter", "ArrowDown", "ArrowUp"].includes(event.key)) {
        return;
      }
      event.preventDefault();

      const currentIndex = Number(input.getAttribute("data-line-input-index"));
      const nextIndex =
        event.key === "ArrowUp" ? currentIndex - 1 : currentIndex + 1;
      const nextInput = document.querySelector(`[data-line-input-index="${nextIndex}"]`);
      if (nextInput instanceof HTMLElement) {
        nextInput.focus();
        if (nextInput.select) {
          nextInput.select();
        }
      }
    });
  });

  if (keepLineFocusSkuId != null) {
    const target = document.querySelector(`[data-line-input-sku="${keepLineFocusSkuId}"]`);
    if (target instanceof HTMLElement) {
      target.focus();
      target.select?.();
    }
  } else if (scannerFocusRequested) {
    scannerFocusRequested = false;
    scannerInput?.focus();
  }
}

function bindShortcut() {
  if (shortcutBound) return;
  shortcutBound = true;

  document.addEventListener("keydown", (event) => {
    if (state.route !== "contagem") return;
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
    const activeCountId = state.inventoryCount.ui.activeCountId;
    const nextTarget = activeCountId != null ? "countScannerInput" : "countResponsibleFilter";
    document.getElementById(nextTarget)?.focus();
  });
}

export function renderInventoryCount() {
  bindShortcut();

  const pageContent = document.getElementById("pageContent");
  if (!pageContent) return;

  if (!state.inventoryCount.loaded && !state.inventoryCount.loading) {
    refreshInventoryCountData();
  }

  if (state.inventoryCount.loading || !state.inventoryCount.loaded) {
    pageContent.innerHTML = renderLoadingState();
    refreshIcons();
    applyReveal(pageContent);
    return;
  }

  const execution = buildExecutionView();
  if (execution) {
    pageContent.innerHTML = renderExecutionState(execution);
    refreshIcons();
    applyReveal(pageContent);
    initTooltips(pageContent);
    bindExecutionEvents(execution);
    return;
  }

  const view = buildView();
  pageContent.innerHTML = renderListState(view);

  refreshIcons();
  applyReveal(pageContent);
  initTooltips(pageContent);
  bindListEvents(view);
}
