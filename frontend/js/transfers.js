
/*
  Bibliotecas via CDN usadas nesta pagina:
  - Luxon: datas, prazos e formatacao pt-BR.
  - Tippy.js + Popper: tooltips acessiveis.
  - Lucide: icones SVG consistentes.

  Configuracao da API:
  - Ajuste `API_BASE_URL` em `frontend/js/api.js`.

  Endpoints consumidos:
  - GET `/stock/transfers`
  - POST `/stock/transfers`
  - POST `/stock/transfers/{id}/ship`
  - POST `/stock/transfers/{id}/receive`
  - POST `/stock/transfers/{id}/cancel`
  - GET `/branches`
  - GET `/locations`
  - GET `/skus`

  Modo demonstracao:
  - Se qualquer chamada da API falhar, a pagina entra automaticamente em modo
    demonstracao com dataset simulado (5 filiais, 100+ transferencias) e
    banner discreto de aviso.
*/

import {
  cancelTransfer,
  createTransfer,
  loadTransfersPayload,
  receiveTransfer,
  shipTransfer,
} from "./api.js";
import { I18N_PTBR } from "./i18n.js";
import {
  clearTransfersFilters,
  mutateTransfersData,
  setTransfersFiltersCollapsed,
  setTransfersLoading,
  setTransfersPage,
  setTransfersPayload,
  setTransfersSort,
  state,
  toggleTransfersFiltersCollapsed,
  updateTransfersFilter,
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
  DRAFT: 0,
  SHIPPED: 1,
  RECEIVED: 2,
  CANCELLED: 3,
};

let refreshSequence = 0;
let shortcutBound = false;

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

function mapPeriodLabel(period) {
  if (period === "7") return I18N_PTBR.transfers.filters.period_7;
  if (period === "30") return I18N_PTBR.transfers.filters.period_30;
  if (period === "90") return I18N_PTBR.transfers.filters.period_90;
  if (period === "custom") return I18N_PTBR.transfers.filters.period_custom;
  return period;
}

function statusLabel(status) {
  if (status === "DRAFT") return I18N_PTBR.transfers.filters.status_draft;
  if (status === "SHIPPED") return I18N_PTBR.transfers.filters.status_shipped;
  if (status === "RECEIVED") return I18N_PTBR.transfers.filters.status_received;
  return I18N_PTBR.transfers.filters.status_cancelled;
}

function statusClass(status) {
  if (status === "DRAFT") return "transfer-status-draft";
  if (status === "SHIPPED") return "transfer-status-shipped";
  if (status === "RECEIVED") return "transfer-status-received";
  return "transfer-status-cancelled";
}

function getMaps(data) {
  return {
    branchById: new Map((data?.branches || []).map((branch) => [Number(branch.id), branch])),
    locationById: new Map((data?.locations || []).map((location) => [Number(location.id), location])),
    itemById: new Map((data?.items || []).map((item) => [Number(item.id), item])),
  };
}

function getTransferItems(transfer) {
  return Array.isArray(transfer?.items) ? transfer.items : [];
}

function getTransferTotalQty(transfer) {
  return getTransferItems(transfer).reduce((acc, item) => acc + Number(item.qty || 0), 0);
}

function getTransferTotalReceived(transfer) {
  return getTransferItems(transfer).reduce((acc, item) => {
    const qtyReceived = Number(item.qty_received);
    if (Number.isFinite(qtyReceived)) {
      return acc + qtyReceived;
    }
    return acc + (transfer.status === "RECEIVED" ? Number(item.qty || 0) : 0);
  }, 0);
}

function isDelayedTransfer(transfer) {
  if (transfer.status !== "SHIPPED") return false;
  const expected = DateTime.fromISO(String(transfer.expected_receipt_at || ""));
  if (!expected.isValid) return false;
  return expected < DateTime.now();
}

function resolveRouteLabel(transfer, maps) {
  const fromBranch = maps.branchById.get(Number(transfer.from_branch_id));
  const toBranch = maps.branchById.get(Number(transfer.to_branch_id));
  return `${fromBranch?.name || "-"} -> ${toBranch?.name || "-"}`;
}

function transferItemSearchText(transfer) {
  return getTransferItems(transfer)
    .map((item) => `${item.sku_name || ""} ${item.sku_code || ""} ${item.barcode || ""}`)
    .join(" ");
}

function compareTransfers(left, right) {
  const orderMultiplier = state.transfers.sort.order === "asc" ? 1 : -1;
  const key = state.transfers.sort.key;

  if (key === "status") {
    const statusDiff =
      (STATUS_SORT_ORDER[left.status] || 0) - (STATUS_SORT_ORDER[right.status] || 0);
    if (statusDiff !== 0) return statusDiff * orderMultiplier;
  }

  const leftDate = DateTime.fromISO(String(left.created_at || "")).toMillis();
  const rightDate = DateTime.fromISO(String(right.created_at || "")).toMillis();
  if (leftDate !== rightDate) {
    return (leftDate - rightDate) * orderMultiplier;
  }

  return (Number(left.id || 0) - Number(right.id || 0)) * orderMultiplier;
}

function buildActiveChips(view) {
  const filters = state.transfers.filters;
  const chips = [];

  if (filters.status !== "all") {
    chips.push({
      key: "status",
      label: `${I18N_PTBR.transfers.chips.status}: ${statusLabel(filters.status)}`,
    });
  }

  if (filters.fromBranchId !== "all") {
    chips.push({
      key: "fromBranchId",
      label: `${I18N_PTBR.transfers.chips.from_branch}: ${
        view.maps.branchById.get(Number(filters.fromBranchId))?.name || filters.fromBranchId
      }`,
    });
  }

  if (filters.toBranchId !== "all") {
    chips.push({
      key: "toBranchId",
      label: `${I18N_PTBR.transfers.chips.to_branch}: ${
        view.maps.branchById.get(Number(filters.toBranchId))?.name || filters.toBranchId
      }`,
    });
  }

  if (filters.period !== "30") {
    chips.push({
      key: "period",
      label: `${I18N_PTBR.transfers.chips.period}: ${mapPeriodLabel(filters.period)}`,
    });
  }

  if (filters.period === "custom") {
    chips.push({
      key: "customRange",
      label: `${I18N_PTBR.transfers.chips.custom_range}: ${filters.customFrom} -> ${filters.customTo}`,
    });
  }

  if (filters.productQuery) {
    chips.push({
      key: "productQuery",
      label: `${I18N_PTBR.transfers.chips.product}: ${filters.productQuery}`,
    });
  }

  if (filters.delayedOnly) {
    chips.push({
      key: "delayedOnly",
      label: `${I18N_PTBR.transfers.chips.delayed_only}: ${I18N_PTBR.transfers.table.delayed_tag}`,
    });
  }

  return chips;
}

function buildView() {
  const data = state.transfers.data;
  if (!data) {
    return {
      maps: { branchById: new Map(), locationById: new Map(), itemById: new Map() },
      rows: [],
      rowsPaged: [],
      chips: [],
      pageInfo: {
        page: 1,
        totalPages: 1,
        totalRows: 0,
        start: 0,
        end: 0,
      },
      kpis: {
        open: 0,
        waitingShip: 0,
        inTransit: 0,
        delayed: 0,
      },
    };
  }

  const maps = getMaps(data);
  const filters = state.transfers.filters;
  const searchTerm = normalize(filters.productQuery);
  const periodRange = resolvePeriodRange(filters);

  const rows = (data.transfers || []).filter((transfer) => {
    const createdAt = DateTime.fromISO(String(transfer.created_at || ""));
    if (!createdAt.isValid) return false;
    if (createdAt < periodRange.from || createdAt > periodRange.to) return false;

    if (filters.status !== "all" && String(transfer.status) !== String(filters.status)) {
      return false;
    }

    if (
      filters.fromBranchId !== "all" &&
      Number(transfer.from_branch_id) !== Number(filters.fromBranchId)
    ) {
      return false;
    }

    if (
      filters.toBranchId !== "all" &&
      Number(transfer.to_branch_id) !== Number(filters.toBranchId)
    ) {
      return false;
    }

    if (filters.delayedOnly && !isDelayedTransfer(transfer)) {
      return false;
    }

    if (searchTerm) {
      const haystack = normalize(`${transfer.transfer_code || ""} ${transferItemSearchText(transfer)}`);
      if (!haystack.includes(searchTerm)) {
        return false;
      }
    }

    return true;
  });

  rows.sort(compareTransfers);

  const totalRows = rows.length;
  const pageSize = state.transfers.pagination.pageSize;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = clamp(state.transfers.pagination.page, 1, totalPages);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const rowsPaged = rows.slice(startIndex, endIndex);
  const chips = buildActiveChips({ maps });

  return {
    maps,
    rows,
    rowsPaged,
    chips,
    pageInfo: {
      page,
      totalPages,
      totalRows,
      start: totalRows ? startIndex + 1 : 0,
      end: Math.min(endIndex, totalRows),
    },
    kpis: {
      open: rows.filter((row) => ["DRAFT", "SHIPPED"].includes(String(row.status))).length,
      waitingShip: rows.filter((row) => String(row.status) === "DRAFT").length,
      inTransit: rows.filter((row) => String(row.status) === "SHIPPED").length,
      delayed: rows.filter((row) => isDelayedTransfer(row)).length,
    },
  };
}

function renderChipList(chips) {
  if (!chips.length) {
    return `<small class="chips-empty">Sem filtros ativos.</small>`;
  }

  return chips
    .map(
      (chip) => `
        <button class="filter-chip" data-remove-transfer-filter="${escapeHtml(chip.key)}" aria-label="${
        I18N_PTBR.transfers.actions.clear_chip
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
          <i data-lucide="package-check"></i>
          <button class="kpi-help" data-tippy-content="${
            I18N_PTBR.transfers.kpis.open.tooltip
          }" aria-label="Ajuda transferências abertas"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.transfers.kpis.open.label}</p>
        <strong>${formatInt(view.kpis.open)}</strong>
      </article>

      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="clipboard-pen-line"></i>
          <button class="kpi-help" data-tippy-content="${
            I18N_PTBR.transfers.kpis.waiting_ship.tooltip
          }" aria-label="Ajuda aguardando envio"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.transfers.kpis.waiting_ship.label}</p>
        <strong>${formatInt(view.kpis.waitingShip)}</strong>
      </article>

      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="truck"></i>
          <button class="kpi-help" data-tippy-content="${
            I18N_PTBR.transfers.kpis.in_transit.tooltip
          }" aria-label="Ajuda em trânsito"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.transfers.kpis.in_transit.label}</p>
        <strong>${formatInt(view.kpis.inTransit)}</strong>
      </article>

      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="clock-alert"></i>
          <button class="kpi-help" data-tippy-content="${
            I18N_PTBR.transfers.kpis.delayed.tooltip
          }" aria-label="Ajuda atrasadas"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.transfers.kpis.delayed.label}</p>
        <strong>${formatInt(view.kpis.delayed)}</strong>
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
            <span>${I18N_PTBR.transfers.table.empty}</span>
          </div>
        </td>
      </tr>
    `;
  }

  return view.rowsPaged
    .map((transfer) => {
      const delayed = isDelayedTransfer(transfer);
      return `
        <tr class="transfers-row">
          <td><strong>${escapeHtml(transfer.transfer_code || `TRF-${transfer.id}`)}</strong></td>
          <td>${escapeHtml(resolveRouteLabel(transfer, view.maps))}</td>
          <td>${formatInt(getTransferTotalQty(transfer))}</td>
          <td>
            <span class="transfer-status-pill ${statusClass(transfer.status)}">${escapeHtml(
        statusLabel(transfer.status)
      )}</span>
          </td>
          <td>${formatDateTimePtBr(transfer.created_at)}</td>
          <td>
            <div class="transfer-expected-cell">
              <span>${formatDateTimePtBr(transfer.expected_receipt_at)}</span>
              ${
                delayed
                  ? `<small class="transfer-delayed-pill">${I18N_PTBR.transfers.table.delayed_tag}</small>`
                  : ""
              }
            </div>
          </td>
          <td>${escapeHtml(transfer.responsible_name || "-")}</td>
          <td>
            <div class="row-actions">
              <button
                class="btn sm ghost"
                data-transfer-action="details"
                data-transfer-id="${transfer.id}"
                aria-label="Abrir detalhes da transferência ${escapeHtml(
                  transfer.transfer_code || String(transfer.id)
                )}"
              >${I18N_PTBR.transfers.actions.details}</button>
              <button
                class="btn sm ghost"
                data-transfer-action="ship"
                data-transfer-id="${transfer.id}"
                ${transfer.status === "DRAFT" ? "" : "disabled"}
              >${I18N_PTBR.transfers.actions.ship}</button>
              <button
                class="btn sm ghost"
                data-transfer-action="receive"
                data-transfer-id="${transfer.id}"
                ${transfer.status === "SHIPPED" ? "" : "disabled"}
              >${I18N_PTBR.transfers.actions.receive}</button>
              <button
                class="btn sm ghost"
                data-transfer-action="cancel"
                data-transfer-id="${transfer.id}"
                ${transfer.status === "DRAFT" ? "" : "disabled"}
              >${I18N_PTBR.transfers.actions.cancel}</button>
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
          <div class="skeleton line" style="width: 480px; margin-top: 8px;"></div>
        </div>
        <div style="display:flex; gap:8px;">
          <div class="skeleton block" style="width: 160px; height: 42px;"></div>
          <div class="skeleton block" style="width: 140px; height: 42px;"></div>
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

function renderLoadedState(view) {
  const data = state.transfers.data;
  const filters = state.transfers.filters;
  const filtersCollapsed = state.transfers.ui.filtersCollapsed;
  const customDisabled = filters.period !== "custom";
  const pageInfo = view.pageInfo;
  const sortDateArrow =
    state.transfers.sort.key === "created_at"
      ? state.transfers.sort.order === "desc"
        ? "?"
        : "?"
      : "";
  const sortStatusArrow =
    state.transfers.sort.key === "status"
      ? state.transfers.sort.order === "desc"
        ? "?"
        : "?"
      : "";
  const statusOptionsMarkup = `
    <option value="all" ${filters.status === "all" ? "selected" : ""}>${
      I18N_PTBR.transfers.filters.status_all
    }</option>
    <option value="DRAFT" ${filters.status === "DRAFT" ? "selected" : ""}>${
      I18N_PTBR.transfers.filters.status_draft
    }</option>
    <option value="SHIPPED" ${filters.status === "SHIPPED" ? "selected" : ""}>${
      I18N_PTBR.transfers.filters.status_shipped
    }</option>
    <option value="RECEIVED" ${filters.status === "RECEIVED" ? "selected" : ""}>${
      I18N_PTBR.transfers.filters.status_received
    }</option>
    <option value="CANCELLED" ${filters.status === "CANCELLED" ? "selected" : ""}>${
      I18N_PTBR.transfers.filters.status_cancelled
    }</option>
  `;
  const branchOptionsMarkup = [
    `<option value="all">${I18N_PTBR.transfers.filters.all_branches}</option>`,
    ...(data.branches || []).map(
      (branch) =>
        `<option value="${branch.id}" ${
          String(branch.id) === String(filters.fromBranchId) ? "selected" : ""
        }>${escapeHtml(branch.name)}</option>`
    ),
  ].join("");
  const toBranchOptionsMarkup = [
    `<option value="all">${I18N_PTBR.transfers.filters.all_branches}</option>`,
    ...(data.branches || []).map(
      (branch) =>
        `<option value="${branch.id}" ${
          String(branch.id) === String(filters.toBranchId) ? "selected" : ""
        }>${escapeHtml(branch.name)}</option>`
    ),
  ].join("");

  return `
    <section class="panel pad reveal">
      ${
        state.transfers.showDemoBanner
          ? `<div class="banner"><i data-lucide="flask-conical"></i>${I18N_PTBR.mode_demo_banner}</div>`
          : ""
      }

      <div class="page-head" style="margin-top:${state.transfers.showDemoBanner ? "12px" : "0"};">
        <div>
          <div class="breadcrumbs">${I18N_PTBR.transfers.breadcrumb}</div>
          <h1>${I18N_PTBR.transfers.title}</h1>
          <p class="section-subtitle">${I18N_PTBR.transfers.subtitle}</p>
          <small>${I18N_PTBR.last_update}: <strong>${formatHourMinutePtBr(
    state.transfers.lastUpdatedIso || data.generated_at
  )}</strong></small>
        </div>
        <div class="movements-actions">
          <button class="btn primary" id="newTransferBtn"><i data-lucide="plus"></i>${
            I18N_PTBR.transfers.actions.new
          }</button>
          <button class="btn" id="exportTransfersCsvBtn"><i data-lucide="download"></i>${
            I18N_PTBR.transfers.actions.export_csv
          }</button>
          <button class="btn ghost" id="clearTransfersFiltersBtn"><i data-lucide="x-circle"></i>${
            I18N_PTBR.transfers.actions.clear_filters
          }</button>
        </div>
      </div>

      <div class="movements-filter-toolbar">
        <button
          class="btn sm ghost"
          id="toggleTransfersFiltersBtn"
          aria-expanded="${filtersCollapsed ? "false" : "true"}"
          aria-controls="transfersFiltersPanel"
        >
          <i data-lucide="${filtersCollapsed ? "chevron-down" : "chevron-up"}"></i>
          ${
            filtersCollapsed
              ? I18N_PTBR.transfers.actions.filter_show
              : I18N_PTBR.transfers.actions.filter_hide
          }
        </button>
        <small class="section-subtitle">${
          view.rows.length
        } ${I18N_PTBR.transfers.filters.result_count}</small>
      </div>

      <div class="movements-filters ${filtersCollapsed ? "is-collapsed" : ""}" id="transfersFiltersPanel">
        <div class="movements-filter-grid transfers-filter-grid">
          <div class="field">
            <label for="transferStatusFilter">${I18N_PTBR.transfers.filters.status}</label>
            <select id="transferStatusFilter">${statusOptionsMarkup}</select>
          </div>

          <div class="field">
            <label for="transferFromBranchFilter">${I18N_PTBR.transfers.filters.from_branch}</label>
            <select id="transferFromBranchFilter">${branchOptionsMarkup}</select>
          </div>

          <div class="field">
            <label for="transferToBranchFilter">${I18N_PTBR.transfers.filters.to_branch}</label>
            <select id="transferToBranchFilter">${toBranchOptionsMarkup}</select>
          </div>

          <div class="field">
            <label for="transferPeriodFilter">${I18N_PTBR.transfers.filters.period}</label>
            <select id="transferPeriodFilter">
              <option value="7" ${filters.period === "7" ? "selected" : ""}>${
                I18N_PTBR.transfers.filters.period_7
              }</option>
              <option value="30" ${filters.period === "30" ? "selected" : ""}>${
                I18N_PTBR.transfers.filters.period_30
              }</option>
              <option value="90" ${filters.period === "90" ? "selected" : ""}>${
                I18N_PTBR.transfers.filters.period_90
              }</option>
              <option value="custom" ${filters.period === "custom" ? "selected" : ""}>${
                I18N_PTBR.transfers.filters.period_custom
              }</option>
            </select>
          </div>

          <div class="field movements-filter-item-field">
            <label for="transferProductQueryFilter">${I18N_PTBR.transfers.filters.product_query}</label>
            <input
              id="transferProductQueryFilter"
              type="search"
              value="${escapeHtml(filters.productQuery)}"
              placeholder="${escapeHtml(I18N_PTBR.transfers.filters.product_query_placeholder)}"
            />
          </div>

          <div class="field transfer-toggle-field">
            <label for="transferDelayedOnlyFilter">${I18N_PTBR.transfers.filters.delayed_only}</label>
            <label class="transfer-toggle-inline">
              <input id="transferDelayedOnlyFilter" type="checkbox" ${
                filters.delayedOnly ? "checked" : ""
              } />
              <span>${I18N_PTBR.transfers.filters.delayed_only}</span>
            </label>
          </div>

          <div class="field">
            <label for="transferCustomFrom">${I18N_PTBR.transfers.filters.custom_from}</label>
            <input id="transferCustomFrom" type="date" value="${filters.customFrom}" ${
    customDisabled ? "disabled" : ""
  } />
          </div>

          <div class="field">
            <label for="transferCustomTo">${I18N_PTBR.transfers.filters.custom_to}</label>
            <input id="transferCustomTo" type="date" value="${filters.customTo}" ${
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
          <h2 class="section-title">${I18N_PTBR.transfers.table.title}</h2>
          <p class="section-subtitle">${I18N_PTBR.transfers.table.subtitle}</p>
        </div>
        <div class="table-tools">
          <button class="btn sm ghost" id="refreshTransfersBtn">
            <i data-lucide="refresh-cw"></i>${I18N_PTBR.transfers.actions.refresh}
          </button>
        </div>
      </div>

      <div class="table-wrap movements-table-wrap transfers-table-wrap">
        <table class="transfers-table">
          <thead>
            <tr>
              <th>${I18N_PTBR.transfers.table.code}</th>
              <th>${I18N_PTBR.transfers.table.route}</th>
              <th>${I18N_PTBR.transfers.table.items}</th>
              <th>
                <button class="table-sort-btn" id="transferSortStatusBtn" aria-label="${escapeHtml(
                  I18N_PTBR.transfers.table.sort_status
                )}">
                  ${I18N_PTBR.transfers.table.status} ${sortStatusArrow}
                </button>
              </th>
              <th>
                <button class="table-sort-btn" id="transferSortDateBtn" aria-label="${escapeHtml(
                  I18N_PTBR.transfers.table.sort_date
                )}">
                  ${I18N_PTBR.transfers.table.created_at} ${sortDateArrow}
                </button>
              </th>
              <th>${I18N_PTBR.transfers.table.expected_at}</th>
              <th>${I18N_PTBR.transfers.table.responsible}</th>
              <th>${I18N_PTBR.transfers.table.actions}</th>
            </tr>
          </thead>
          <tbody>
            ${renderRows(view)}
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <small>${I18N_PTBR.transfers.table.showing} ${pageInfo.start}-${pageInfo.end} ${
    I18N_PTBR.transfers.table.of
  } ${pageInfo.totalRows}</small>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn sm ghost" id="transferPrevPageBtn" ${
            pageInfo.page <= 1 ? "disabled" : ""
          }>Anterior</button>
          <small>${I18N_PTBR.transfers.table.page} ${pageInfo.page} ${I18N_PTBR.transfers.table.of} ${
    pageInfo.totalPages
  }</small>
          <button class="btn sm ghost" id="transferNextPageBtn" ${
            pageInfo.page >= pageInfo.totalPages ? "disabled" : ""
          }>Próxima</button>
        </div>
      </div>
    </section>
  `;
}

function enrichTransferWithCurrentItems(transfer) {
  const itemById = new Map((state.transfers.data?.items || []).map((item) => [Number(item.id), item]));
  const items = getTransferItems(transfer).map((row, index) => {
    const source = itemById.get(Number(row.sku_id));
    return {
      id: Number(row.id || index + 1),
      transfer_id: Number(row.transfer_id || transfer.id),
      sku_id: Number(row.sku_id || 0),
      qty: Number(row.qty || 0),
      qty_received:
        Number.isFinite(Number(row.qty_received))
          ? Number(row.qty_received)
          : transfer.status === "RECEIVED"
          ? Number(row.qty || 0)
          : 0,
      sku_name: row.sku_name || source?.name || `Variacao ${row.sku_id}`,
      sku_code:
        row.sku_code || source?.sku_code || `VAR-${String(row.sku_id || 0).padStart(4, "0")}`,
      barcode: row.barcode || source?.barcode || "",
    };
  });

  return {
    ...transfer,
    transfer_code:
      compact(transfer.transfer_code) || `TRF-${String(transfer.id || 0).padStart(6, "0")}`,
    responsible_name: compact(transfer.responsible_name) || "Operador FreeShop",
    items,
    history: Array.isArray(transfer.history) ? transfer.history : [],
    related_moves: Array.isArray(transfer.related_moves) ? transfer.related_moves : [],
  };
}

function upsertTransferOnState(transfer, options = {}) {
  if (!transfer) return;
  const normalized = enrichTransferWithCurrentItems(transfer);

  mutateTransfersData((draft) => {
    if (!Array.isArray(draft.transfers)) {
      draft.transfers = [];
    }

    const index = draft.transfers.findIndex((row) => Number(row.id) === Number(normalized.id));
    if (index >= 0) {
      draft.transfers[index] = normalized;
      return;
    }

    if (options.prepend === false) {
      draft.transfers.push(normalized);
    } else {
      draft.transfers.unshift(normalized);
    }
  });
}

function appendHistoryEvent(transfer, type, label, atIso) {
  const history = Array.isArray(transfer.history) ? [...transfer.history] : [];
  history.push({
    key: `${type}-${transfer.id}-${Date.now()}`,
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

function applyLocalTransferAction(transfer, action) {
  const nowIso = DateTime.now().toISO();
  const items = getTransferItems(transfer).map((item) => ({ ...item }));
  const updated = {
    ...transfer,
    items,
    history: Array.isArray(transfer.history) ? [...transfer.history] : [],
    related_moves: Array.isArray(transfer.related_moves) ? [...transfer.related_moves] : [],
  };
  const totalQty = getTransferTotalQty(updated);

  if (action === "ship" && transfer.status === "DRAFT") {
    updated.status = "SHIPPED";
    updated.shipped_at = nowIso;
    updated.expected_receipt_at = DateTime.fromISO(nowIso).plus({ days: 2, hours: 6 }).toISO();
    updated.history = appendHistoryEvent(updated, "shipped", "Transferencia enviada", nowIso);
    updated.related_moves.push({
      id: `${updated.id}-ship-${Date.now()}`,
      move_type: "TRANSFER_SHIP",
      qty: totalQty,
      occurred_at: nowIso,
      reference_id: `${updated.transfer_code}-ENVIO`,
    });
    return updated;
  }

  if (action === "receive" && transfer.status === "SHIPPED") {
    updated.status = "RECEIVED";
    updated.received_at = nowIso;
    updated.items = updated.items.map((item) => ({
      ...item,
      qty_received: Number(item.qty || 0),
    }));
    updated.history = appendHistoryEvent(updated, "received", "Recebimento confirmado", nowIso);
    updated.related_moves.push({
      id: `${updated.id}-receive-${Date.now()}`,
      move_type: "TRANSFER_RECEIVE",
      qty: totalQty,
      occurred_at: nowIso,
      reference_id: `${updated.transfer_code}-RECEB`,
    });
    return updated;
  }

  if (action === "cancel" && transfer.status === "DRAFT") {
    updated.status = "CANCELLED";
    updated.cancelled_at = nowIso;
    updated.history = appendHistoryEvent(updated, "cancelled", "Transferencia cancelada", nowIso);
    return updated;
  }

  return null;
}
function canActionRun(transfer, action) {
  if (action === "ship") return transfer.status === "DRAFT";
  if (action === "receive") return transfer.status === "SHIPPED";
  if (action === "cancel") return transfer.status === "DRAFT";
  return true;
}

async function runTransferAction(transfer, action, options = {}) {
  if (!canActionRun(transfer, action)) return false;

  const confirmMessage =
    action === "ship"
      ? I18N_PTBR.transfers.toasts.confirm_ship
      : action === "receive"
      ? I18N_PTBR.transfers.toasts.confirm_receive
      : I18N_PTBR.transfers.toasts.confirm_cancel;

  const confirmed = window.confirm(confirmMessage);
  if (!confirmed) return false;

  try {
    let updatedTransfer = null;
    if (!state.transfers.demoMode && state.transfers.mode === "api") {
      if (action === "ship") {
        updatedTransfer = await shipTransfer(transfer.id);
      } else if (action === "receive") {
        updatedTransfer = await receiveTransfer(transfer.id);
      } else if (action === "cancel") {
        updatedTransfer = await cancelTransfer(transfer.id);
      }
    } else {
      updatedTransfer = applyLocalTransferAction(transfer, action);
    }

    if (!updatedTransfer) {
      throw new Error("invalid_transfer_action");
    }

    upsertTransferOnState(updatedTransfer);

    const toastMessage =
      action === "ship"
        ? I18N_PTBR.transfers.toasts.status_shipped
        : action === "receive"
        ? I18N_PTBR.transfers.toasts.status_received
        : I18N_PTBR.transfers.toasts.status_cancelled;
    showToast({
      title: I18N_PTBR.transfers.title,
      message: toastMessage,
      type: "success",
    });

    if (options.closeDrawer && typeof options.closeDrawer === "function") {
      options.closeDrawer();
    }
    return true;
  } catch {
    showToast({
      title: I18N_PTBR.transfers.title,
      message: I18N_PTBR.transfers.toasts.status_error,
      type: "error",
    });
    return false;
  }
}

function renderDetailsItemsRows(transfer) {
  const items = getTransferItems(transfer);
  if (!items.length) {
    return `<p class="section-subtitle">${I18N_PTBR.transfers.details.no_items}</p>`;
  }

  return `
    <div class="transfer-detail-items">
      ${items
        .map(
          (item) => `
            <article class="transfer-detail-item">
              <div>
                <strong>${escapeHtml(item.sku_name || `Variacao ${item.sku_id}`)}</strong>
                <small>${escapeHtml(item.sku_code || `VAR-${item.sku_id}`)}</small>
              </div>
              <div class="transfer-detail-qty">
                <span>${I18N_PTBR.transfers.details.qty_sent}: <strong>${formatInt(item.qty)}</strong></span>
                <span>${I18N_PTBR.transfers.details.qty_received}: <strong>${formatInt(
            Number.isFinite(Number(item.qty_received))
              ? item.qty_received
              : transfer.status === "RECEIVED"
              ? item.qty
              : 0
          )}</strong></span>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderDetailsHistory(transfer) {
  const history = Array.isArray(transfer.history) ? transfer.history : [];
  if (!history.length) {
    return `<p class="section-subtitle">${I18N_PTBR.transfers.details.no_history}</p>`;
  }

  return `
    <div class="transfer-timeline">
      ${history
        .map(
          (event) => `
            <div class="transfer-timeline-item">
              <span class="transfer-timeline-dot"></span>
              <div>
                <strong>${escapeHtml(event.label || "-")}</strong>
                <small>${formatDateTimePtBr(event.at)} • ${escapeHtml(event.by || "-")}</small>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderDetailsRelatedMoves(transfer) {
  const relatedMoves = Array.isArray(transfer.related_moves) ? transfer.related_moves : [];
  if (!relatedMoves.length) {
    return `<p class="section-subtitle">${I18N_PTBR.transfers.details.no_history}</p>`;
  }

  return `
    <div class="transfer-related-moves">
      ${relatedMoves
        .map(
          (move) => `
            <div class="transfer-related-row">
              <small>${I18N_PTBR.transfers.details.move_ref}</small>
              <strong>${escapeHtml(move.reference_id || "-")}</strong>
              <span>${formatDateTimePtBr(move.occurred_at)}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function openTransferDetails(transfer, view) {
  const maps = view.maps;
  const fromBranch = maps.branchById.get(Number(transfer.from_branch_id));
  const fromLocation = maps.locationById.get(Number(transfer.from_location_id));
  const toBranch = maps.branchById.get(Number(transfer.to_branch_id));
  const toLocation = maps.locationById.get(Number(transfer.to_location_id));
  const canShip = transfer.status === "DRAFT";
  const canReceive = transfer.status === "SHIPPED";
  const canCancel = transfer.status === "DRAFT";

  openDrawer({
    title: I18N_PTBR.transfers.details.title,
    subtitle: `${transfer.transfer_code || `TRF-${transfer.id}`} • ${statusLabel(transfer.status)}`,
    bodyHtml: `
      <section class="drawer-section">
        <h4>${I18N_PTBR.transfers.details.summary}</h4>
        <div class="drawer-grid">
          <div><small>${I18N_PTBR.transfers.details.code}</small><strong>${escapeHtml(
      transfer.transfer_code || `TRF-${transfer.id}`
    )}</strong></div>
          <div><small>${I18N_PTBR.transfers.details.status}</small><strong>${escapeHtml(
      statusLabel(transfer.status)
    )}</strong></div>
          <div><small>${I18N_PTBR.transfers.details.route}</small><strong>${escapeHtml(
      `${fromBranch?.name || "-"} (${fromLocation?.name || "-"}) -> ${toBranch?.name || "-"} (${toLocation?.name || "-"})`
    )}</strong></div>
          <div><small>${I18N_PTBR.transfers.details.responsible}</small><strong>${escapeHtml(
      transfer.responsible_name || "-"
    )}</strong></div>
          <div><small>${I18N_PTBR.transfers.details.created_at}</small><strong>${formatDateTimePtBr(
      transfer.created_at
    )}</strong></div>
          <div><small>${I18N_PTBR.transfers.details.shipped_at}</small><strong>${formatDateTimePtBr(
      transfer.shipped_at
    )}</strong></div>
          <div><small>${I18N_PTBR.transfers.details.received_at}</small><strong>${formatDateTimePtBr(
      transfer.received_at
    )}</strong></div>
          <div><small>${I18N_PTBR.transfers.details.cancelled_at}</small><strong>${formatDateTimePtBr(
      transfer.cancelled_at
    )}</strong></div>
        </div>
      </section>

      <section class="drawer-section">
        <h4>${I18N_PTBR.transfers.details.items}</h4>
        ${renderDetailsItemsRows(transfer)}
      </section>

      <section class="drawer-section">
        <h4>${I18N_PTBR.transfers.details.history}</h4>
        ${renderDetailsHistory(transfer)}
      </section>

      <section class="drawer-section">
        <h4>${I18N_PTBR.transfers.details.move_ref}</h4>
        ${renderDetailsRelatedMoves(transfer)}
      </section>
    `,
    footerHtml: `
      <div class="drawer-footer">
        <button class="btn ghost" type="button" data-close-drawer>${I18N_PTBR.transfers.details.close}</button>
        ${
          canCancel
            ? `<button class="btn ghost" type="button" data-transfer-drawer-action="cancel">${I18N_PTBR.transfers.actions.cancel}</button>`
            : ""
        }
        ${
          canShip
            ? `<button class="btn ghost" type="button" data-transfer-drawer-action="ship">${I18N_PTBR.transfers.actions.ship}</button>`
            : ""
        }
        ${
          canReceive
            ? `<button class="btn primary" type="button" data-transfer-drawer-action="receive">${I18N_PTBR.transfers.actions.receive}</button>`
            : ""
        }
      </div>
    `,
    onOpen: (overlay, helpers) => {
      overlay.querySelectorAll("[data-transfer-drawer-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          const action = button.getAttribute("data-transfer-drawer-action");
          if (!action) return;
          await runTransferAction(transfer, action, {
            closeDrawer: helpers.close,
          });
        });
      });
    },
  });
}

function buildLocalTransfer(payload, sendNow = false) {
  const rows = state.transfers.data?.transfers || [];
  const createdId = nextId(rows);
  const nowIso = DateTime.now().toISO();
  const code = `TRF-${String(createdId).padStart(6, "0")}`;
  const status = sendNow ? "SHIPPED" : "DRAFT";
  const shippedAt = sendNow ? nowIso : null;
  const expectedAt = DateTime.fromISO(shippedAt || nowIso).plus({ days: 2, hours: 6 }).toISO();
  const items = (payload.items || []).map((item, index) => ({
    id: index + 1,
    transfer_id: createdId,
    sku_id: Number(item.sku_id),
    qty: Number(item.qty),
    qty_received: 0,
  }));

  const transfer = {
    id: createdId,
    transfer_code: code,
    from_branch_id: Number(payload.from_branch_id),
    from_location_id: Number(payload.from_location_id),
    to_branch_id: Number(payload.to_branch_id),
    to_location_id: Number(payload.to_location_id),
    status,
    note: payload.note || "",
    created_by: "local",
    responsible_name: "Operador FreeShop",
    created_at: nowIso,
    shipped_at: shippedAt,
    received_at: null,
    cancelled_at: null,
    expected_receipt_at: expectedAt,
    items,
    history: [],
    related_moves: [],
  };

  transfer.history = appendHistoryEvent(transfer, "created", "Transferencia criada", nowIso);

  if (sendNow) {
    transfer.history = appendHistoryEvent(transfer, "shipped", "Transferencia enviada", nowIso);
    transfer.related_moves.push({
      id: `${createdId}-ship-${Date.now()}`,
      move_type: "TRANSFER_SHIP",
      qty: getTransferTotalQty(transfer),
      occurred_at: nowIso,
      reference_id: `${code}-ENVIO`,
    });
  }

  return transfer;
}
function openTransferWizard(view) {
  const data = state.transfers.data;
  if (!data) return;

  const branches = data.branches || [];
  const locations = data.locations || [];
  const items = data.items || [];
  const defaultFromBranchId =
    state.transfers.filters.fromBranchId !== "all"
      ? String(state.transfers.filters.fromBranchId)
      : String(branches[0]?.id || "");
  const defaultToBranchId =
    state.transfers.filters.toBranchId !== "all"
      ? String(state.transfers.filters.toBranchId)
      : String(branches[1]?.id || branches[0]?.id || "");

  const wizard = {
    step: 1,
    fromBranchId: defaultFromBranchId,
    fromLocationId: "",
    toBranchId: defaultToBranchId,
    toLocationId: "",
    note: "",
    search: "",
    draftItemId: String(items[0]?.id || ""),
    draftQty: "1",
    rows: [],
  };

  function locationsForBranch(branchId) {
    return locations.filter((row) => Number(row.branch_id) === Number(branchId));
  }

  function ensureLocations() {
    const fromOptions = locationsForBranch(wizard.fromBranchId);
    const toOptions = locationsForBranch(wizard.toBranchId);
    if (!fromOptions.some((row) => String(row.id) === String(wizard.fromLocationId))) {
      wizard.fromLocationId = String(fromOptions[0]?.id || "");
    }
    if (!toOptions.some((row) => String(row.id) === String(wizard.toLocationId))) {
      wizard.toLocationId = String(toOptions[0]?.id || "");
    }
  }

  ensureLocations();

  openDrawer({
    title: I18N_PTBR.transfers.wizard.title,
    subtitle: I18N_PTBR.transfers.wizard.subtitle,
    bodyHtml: `
      <div class="transfer-wizard" id="transferWizardRoot">
        <div class="transfer-wizard-progress" id="transferWizardProgress"></div>
        <div class="transfer-wizard-body" id="transferWizardBody"></div>
      </div>
    `,
    footerHtml: `<div class="drawer-footer" id="transferWizardFooter"></div>`,
    onOpen: (overlay, helpers) => {
      overlay.classList.add("transfer-modal-overlay");
      overlay.querySelector(".drawer")?.classList.add("transfer-modal");

      const progressNode = overlay.querySelector("#transferWizardProgress");
      const bodyNode = overlay.querySelector("#transferWizardBody");
      const footerNode = overlay.querySelector("#transferWizardFooter");

      function filteredItems() {
        const term = normalize(wizard.search);
        if (!term) return items;
        return items.filter((item) =>
          normalize(`${item.name || ""} ${item.sku_code || ""} ${item.barcode || ""}`).includes(term)
        );
      }

      function validateStepOne() {
        if (!wizard.fromBranchId || !wizard.fromLocationId || !wizard.toBranchId || !wizard.toLocationId) {
          helpers.setError(I18N_PTBR.transfers.wizard.validation_locations);
          return false;
        }
        if (String(wizard.fromBranchId) === String(wizard.toBranchId)) {
          helpers.setError(I18N_PTBR.transfers.wizard.validation_branch);
          return false;
        }
        return true;
      }

      function validateStepTwo() {
        if (!wizard.rows.length) {
          helpers.setError(I18N_PTBR.transfers.wizard.validation_items);
          return false;
        }
        return true;
      }

      function addDraftItem() {
        const qty = Number(wizard.draftQty);
        if (!wizard.draftItemId || Number.isNaN(qty) || qty <= 0) {
          helpers.setError(I18N_PTBR.transfers.wizard.validation_quantity);
          return;
        }

        const existing = wizard.rows.find((row) => Number(row.sku_id) === Number(wizard.draftItemId));
        if (existing) {
          existing.qty = Number(existing.qty || 0) + qty;
        } else {
          wizard.rows.push({
            sku_id: Number(wizard.draftItemId),
            qty,
          });
        }

        wizard.draftQty = "1";
        helpers.clearError();
        render();
      }

      async function saveTransfer(sendNow = false) {
        if (!validateStepOne() || !validateStepTwo()) return;

        const payload = {
          from_branch_id: Number(wizard.fromBranchId),
          from_location_id: Number(wizard.fromLocationId),
          to_branch_id: Number(wizard.toBranchId),
          to_location_id: Number(wizard.toLocationId),
          note: compact(wizard.note),
          items: wizard.rows.map((row) => ({
            sku_id: Number(row.sku_id),
            qty: Number(row.qty),
          })),
        };

        try {
          let created = null;
          if (!state.transfers.demoMode && state.transfers.mode === "api") {
            created = await createTransfer(payload);
            if (sendNow && created) {
              created = await shipTransfer(created.id);
            }
          } else {
            created = buildLocalTransfer(payload, sendNow);
          }

          if (!created) {
            throw new Error("create_transfer_failed");
          }

          upsertTransferOnState(created, { prepend: true });
          showToast({
            title: I18N_PTBR.transfers.title,
            message: sendNow
              ? I18N_PTBR.transfers.wizard.success_ship
              : I18N_PTBR.transfers.wizard.success_draft,
            type: "success",
          });
          helpers.close();
        } catch {
          helpers.setError(I18N_PTBR.transfers.wizard.save_error);
        }
      }

      function renderProgress() {
        const steps = [
          I18N_PTBR.transfers.wizard.step_1,
          I18N_PTBR.transfers.wizard.step_2,
          I18N_PTBR.transfers.wizard.step_3,
        ];
        return steps
          .map(
            (label, index) => `
              <div class="transfer-wizard-step ${
                wizard.step === index + 1 ? "is-active" : wizard.step > index + 1 ? "is-done" : ""
              }">
                <span>${index + 1}</span>
                <small>${escapeHtml(label)}</small>
              </div>
            `
          )
          .join("");
      }

      function renderStepOne() {
        const fromLocations = locationsForBranch(wizard.fromBranchId);
        const toLocations = locationsForBranch(wizard.toBranchId);
        return `
          <div class="field">
            <label for="wizardFromBranch">${I18N_PTBR.transfers.wizard.from_branch}</label>
            <select id="wizardFromBranch">
              ${branches
                .map(
                  (branch) =>
                    `<option value="${branch.id}" ${
                      String(branch.id) === String(wizard.fromBranchId) ? "selected" : ""
                    }>${escapeHtml(branch.name)}</option>`
                )
                .join("")}
            </select>
          </div>

          <div class="field">
            <label for="wizardFromLocation">${I18N_PTBR.transfers.wizard.from_location}</label>
            <select id="wizardFromLocation">
              ${
                fromLocations.length
                  ? fromLocations
                      .map(
                        (location) =>
                          `<option value="${location.id}" ${
                            String(location.id) === String(wizard.fromLocationId) ? "selected" : ""
                          }>${escapeHtml(location.name)}</option>`
                      )
                      .join("")
                  : `<option value="">${I18N_PTBR.transfers.wizard.no_location}</option>`
              }
            </select>
          </div>

          <div class="field">
            <label for="wizardToBranch">${I18N_PTBR.transfers.wizard.to_branch}</label>
            <select id="wizardToBranch">
              ${branches
                .map(
                  (branch) =>
                    `<option value="${branch.id}" ${
                      String(branch.id) === String(wizard.toBranchId) ? "selected" : ""
                    }>${escapeHtml(branch.name)}</option>`
                )
                .join("")}
            </select>
          </div>

          <div class="field">
            <label for="wizardToLocation">${I18N_PTBR.transfers.wizard.to_location}</label>
            <select id="wizardToLocation">
              ${
                toLocations.length
                  ? toLocations
                      .map(
                        (location) =>
                          `<option value="${location.id}" ${
                            String(location.id) === String(wizard.toLocationId) ? "selected" : ""
                          }>${escapeHtml(location.name)}</option>`
                      )
                      .join("")
                  : `<option value="">${I18N_PTBR.transfers.wizard.no_location}</option>`
              }
            </select>
          </div>

          <div class="field">
            <label for="wizardTransferNote">${I18N_PTBR.transfers.wizard.note}</label>
            <textarea id="wizardTransferNote">${escapeHtml(wizard.note)}</textarea>
          </div>
        `;
      }

      function renderStepTwo() {
        const availableItems = filteredItems();
        const totalQty = wizard.rows.reduce((acc, row) => acc + Number(row.qty || 0), 0);
        return `
          <div class="field">
            <label for="wizardItemSearch">${I18N_PTBR.transfers.wizard.item_search}</label>
            <input
              id="wizardItemSearch"
              type="search"
              value="${escapeHtml(wizard.search)}"
              placeholder="${escapeHtml(I18N_PTBR.transfers.wizard.item_search_placeholder)}"
            />
          </div>

          <div class="field-row">
            <div class="field">
              <label for="wizardItemSelect">${I18N_PTBR.transfers.wizard.item_select}</label>
              <select id="wizardItemSelect">
                ${
                  availableItems.length
                    ? availableItems
                        .map(
                          (item) =>
                            `<option value="${item.id}" ${
                              String(item.id) === String(wizard.draftItemId) ? "selected" : ""
                            }>${escapeHtml(item.name || `Variacao ${item.id}`)} - ${escapeHtml(
                              item.sku_code || `VAR-${item.id}`
                            )}</option>`
                        )
                        .join("")
                    : `<option value="">${I18N_PTBR.transfers.wizard.no_item}</option>`
                }
              </select>
            </div>

            <div class="field">
              <label for="wizardItemQty">${I18N_PTBR.transfers.wizard.quantity}</label>
              <input id="wizardItemQty" type="number" min="1" step="1" value="${escapeHtml(
                wizard.draftQty
              )}" />
            </div>
          </div>

          <div class="transfer-wizard-item-actions">
            <button type="button" class="btn sm ghost" id="wizardAddItemBtn">
              <i data-lucide="plus"></i>${I18N_PTBR.transfers.actions.add_item}
            </button>
            <small class="section-subtitle">${formatInt(totalQty)} itens na transferência</small>
          </div>

          <div class="transfer-wizard-item-list">
            ${
              wizard.rows.length
                ? wizard.rows
                    .map((row, index) => {
                      const source = items.find((item) => Number(item.id) === Number(row.sku_id));
                      return `
                        <div class="transfer-wizard-item-row">
                          <div>
                            <strong>${escapeHtml(source?.name || `Variacao ${row.sku_id}`)}</strong>
                            <small>${escapeHtml(source?.sku_code || `VAR-${row.sku_id}`)}</small>
                          </div>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value="${Number(row.qty || 0)}"
                            data-wizard-item-qty="${index}"
                            aria-label="${I18N_PTBR.transfers.wizard.quantity}"
                          />
                          <button class="btn sm ghost" type="button" data-wizard-remove-item="${index}">
                            ${I18N_PTBR.transfers.actions.remove_item}
                          </button>
                        </div>
                      `;
                    })
                    .join("")
                : `<p class="section-subtitle">${I18N_PTBR.transfers.wizard.validation_items}</p>`
            }
          </div>
        `;
      }

      function renderStepThree() {
        const fromBranch = branches.find((row) => Number(row.id) === Number(wizard.fromBranchId));
        const toBranch = branches.find((row) => Number(row.id) === Number(wizard.toBranchId));
        const fromLocation = locations.find((row) => Number(row.id) === Number(wizard.fromLocationId));
        const toLocation = locations.find((row) => Number(row.id) === Number(wizard.toLocationId));
        const totalQty = wizard.rows.reduce((acc, row) => acc + Number(row.qty || 0), 0);

        return `
          <section class="drawer-section">
            <h4>${I18N_PTBR.transfers.wizard.review_route}</h4>
            <div class="drawer-grid">
              <div><small>${I18N_PTBR.transfers.wizard.from_branch}</small><strong>${escapeHtml(
          `${fromBranch?.name || "-"} (${fromLocation?.name || "-"})`
        )}</strong></div>
              <div><small>${I18N_PTBR.transfers.wizard.to_branch}</small><strong>${escapeHtml(
          `${toBranch?.name || "-"} (${toLocation?.name || "-"})`
        )}</strong></div>
            </div>
          </section>

          <section class="drawer-section">
            <h4>${I18N_PTBR.transfers.wizard.review_items}</h4>
            <div class="transfer-review-list">
              ${wizard.rows
                .map((row) => {
                  const source = items.find((item) => Number(item.id) === Number(row.sku_id));
                  return `
                    <div class="transfer-review-item">
                      <strong>${escapeHtml(source?.name || `Variacao ${row.sku_id}`)}</strong>
                      <span>${formatInt(row.qty)}</span>
                    </div>
                  `;
                })
                .join("")}
            </div>
            <small class="section-subtitle">${I18N_PTBR.transfers.wizard.review_total}: ${formatInt(
          totalQty
        )}</small>
          </section>
        `;
      }

      function renderFooter() {
        if (wizard.step === 1) {
          return `
            <button type="button" class="btn ghost" data-close-drawer>${I18N_PTBR.drawer.cancel}</button>
            <button type="button" class="btn primary" id="wizardNextBtn">${I18N_PTBR.transfers.actions.next}</button>
          `;
        }

        if (wizard.step === 2) {
          return `
            <button type="button" class="btn ghost" id="wizardPrevBtn">${I18N_PTBR.transfers.actions.previous}</button>
            <button type="button" class="btn primary" id="wizardNextBtn">${I18N_PTBR.transfers.actions.next}</button>
          `;
        }

        return `
          <button type="button" class="btn ghost" id="wizardPrevBtn">${I18N_PTBR.transfers.actions.previous}</button>
          <button type="button" class="btn ghost" id="wizardSaveDraftBtn">${I18N_PTBR.transfers.actions.save_draft}</button>
          <button type="button" class="btn primary" id="wizardShipNowBtn">${I18N_PTBR.transfers.actions.ship_now}</button>
        `;
      }

      function bindStepEvents() {
        overlay.querySelector("#wizardFromBranch")?.addEventListener("change", (event) => {
          wizard.fromBranchId = event.target.value;
          ensureLocations();
          render();
        });

        overlay.querySelector("#wizardToBranch")?.addEventListener("change", (event) => {
          wizard.toBranchId = event.target.value;
          ensureLocations();
          render();
        });

        overlay.querySelector("#wizardFromLocation")?.addEventListener("change", (event) => {
          wizard.fromLocationId = event.target.value;
        });

        overlay.querySelector("#wizardToLocation")?.addEventListener("change", (event) => {
          wizard.toLocationId = event.target.value;
        });

        overlay.querySelector("#wizardTransferNote")?.addEventListener("input", (event) => {
          wizard.note = event.target.value;
        });

        overlay.querySelector("#wizardItemSearch")?.addEventListener("input", (event) => {
          wizard.search = event.target.value;
          render();
        });

        overlay.querySelector("#wizardItemSelect")?.addEventListener("change", (event) => {
          wizard.draftItemId = event.target.value;
        });

        overlay.querySelector("#wizardItemQty")?.addEventListener("input", (event) => {
          wizard.draftQty = event.target.value;
        });

        overlay.querySelector("#wizardAddItemBtn")?.addEventListener("click", () => {
          addDraftItem();
        });

        overlay.querySelectorAll("[data-wizard-remove-item]").forEach((button) => {
          button.addEventListener("click", () => {
            const index = Number(button.getAttribute("data-wizard-remove-item"));
            wizard.rows = wizard.rows.filter((_, current) => current !== index);
            render();
          });
        });

        overlay.querySelectorAll("[data-wizard-item-qty]").forEach((input) => {
          input.addEventListener("change", (event) => {
            const index = Number(input.getAttribute("data-wizard-item-qty"));
            const value = Number(event.target.value);
            if (Number.isNaN(value) || value <= 0) {
              helpers.setError(I18N_PTBR.transfers.wizard.validation_quantity);
              event.target.value = String(wizard.rows[index]?.qty || 1);
              return;
            }
            helpers.clearError();
            if (wizard.rows[index]) {
              wizard.rows[index].qty = value;
            }
            render();
          });
        });

        overlay.querySelector("#wizardPrevBtn")?.addEventListener("click", () => {
          wizard.step = clamp(wizard.step - 1, 1, 3);
          helpers.clearError();
          render();
        });

        overlay.querySelector("#wizardNextBtn")?.addEventListener("click", () => {
          if (wizard.step === 1 && !validateStepOne()) return;
          if (wizard.step === 2 && !validateStepTwo()) return;
          wizard.step = clamp(wizard.step + 1, 1, 3);
          helpers.clearError();
          render();
        });

        overlay.querySelector("#wizardSaveDraftBtn")?.addEventListener("click", () => {
          saveTransfer(false);
        });

        overlay.querySelector("#wizardShipNowBtn")?.addEventListener("click", () => {
          saveTransfer(true);
        });
      }

      function render() {
        ensureLocations();
        progressNode.innerHTML = renderProgress();
        bodyNode.innerHTML =
          wizard.step === 1 ? renderStepOne() : wizard.step === 2 ? renderStepTwo() : renderStepThree();
        footerNode.innerHTML = renderFooter();
        refreshIcons();
        bindStepEvents();
      }

      render();
    },
  });
}

async function refreshTransfersData({ feedback = false } = {}) {
  const currentRequest = ++refreshSequence;
  setTransfersLoading(true);
  const payload = await loadTransfersPayload(state.transfers.filters, state.transfers.sort);

  if (currentRequest !== refreshSequence) {
    return payload;
  }

  setTransfersPayload(payload);

  if (feedback) {
    if (payload.mode === "demo") {
      showToast({
        title: I18N_PTBR.transfers.title,
        message: I18N_PTBR.transfers.toasts.fallback_demo,
        type: "error",
      });
    } else {
      showToast({
        title: I18N_PTBR.transfers.title,
        message: I18N_PTBR.transfers.toasts.refreshed,
        type: "success",
      });
    }
  }

  return payload;
}

const debouncedRefresh = debounce(() => {
  if (state.transfers.mode === "api" && !state.transfers.demoMode) {
    refreshTransfersData();
  }
}, 360);

function updateFilter(filterKey, value, options = {}) {
  updateTransfersFilter(filterKey, value, options);
  if (options.refreshApi) {
    debouncedRefresh();
  }
}

function resetSingleFilter(filterKey) {
  if (filterKey === "status") {
    updateTransfersFilter("status", "all");
    return;
  }

  if (filterKey === "fromBranchId" || filterKey === "toBranchId") {
    updateTransfersFilter(filterKey, "all");
    return;
  }

  if (filterKey === "period") {
    updateTransfersFilter("period", "30");
    return;
  }

  if (filterKey === "customRange") {
    updateTransfersFilter("period", "30");
    return;
  }

  if (filterKey === "productQuery") {
    updateTransfersFilter("productQuery", "");
    return;
  }

  if (filterKey === "delayedOnly") {
    updateTransfersFilter("delayedOnly", false);
  }
}

function exportTransfersCsv(view) {
  if (!view.rows.length) {
    showToast({
      title: I18N_PTBR.transfers.title,
      message: I18N_PTBR.transfers.toasts.csv_empty,
      type: "error",
    });
    return;
  }

  const rows = view.rows.map((transfer) => ({
    codigo: transfer.transfer_code || `TRF-${transfer.id}`,
    origem_destino: resolveRouteLabel(transfer, view.maps),
    itens: formatInt(getTransferTotalQty(transfer)),
    status: statusLabel(transfer.status),
    criado_em: formatDateTimePtBr(transfer.created_at),
    previsto_para: formatDateTimePtBr(transfer.expected_receipt_at),
    responsavel: transfer.responsible_name || "-",
  }));
  const today = DateTime.now().toFormat("yyyy-LL-dd");

  downloadCsv({
    filename: `transferencias_${today}.csv`,
    columns: [
      { key: "codigo", label: "Codigo da transferencia" },
      { key: "origem_destino", label: "Origem -> Destino" },
      { key: "itens", label: "Itens (qtd total)" },
      { key: "status", label: "Status" },
      { key: "criado_em", label: "Data de criacao" },
      { key: "previsto_para", label: "Previsao de recebimento" },
      { key: "responsavel", label: "Responsavel" },
    ],
    rows,
  });

  showToast({
    title: I18N_PTBR.transfers.title,
    message: I18N_PTBR.transfers.toasts.csv_success,
    type: "success",
  });
}

function bindKeyboardShortcut() {
  if (shortcutBound) return;
  shortcutBound = true;

  document.addEventListener("keydown", (event) => {
    if (state.route !== "transferencias") return;
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
    const input = document.getElementById("transferProductQueryFilter");
    if (input instanceof HTMLElement) {
      input.focus();
    }
  });
}

function bindEvents(view) {
  const statusFilter = document.getElementById("transferStatusFilter");
  const fromBranchFilter = document.getElementById("transferFromBranchFilter");
  const toBranchFilter = document.getElementById("transferToBranchFilter");
  const periodFilter = document.getElementById("transferPeriodFilter");
  const queryFilter = document.getElementById("transferProductQueryFilter");
  const delayedToggle = document.getElementById("transferDelayedOnlyFilter");
  const customFrom = document.getElementById("transferCustomFrom");
  const customTo = document.getElementById("transferCustomTo");
  const refreshButton = document.getElementById("refreshTransfersBtn");
  const newButton = document.getElementById("newTransferBtn");
  const exportButton = document.getElementById("exportTransfersCsvBtn");
  const clearButton = document.getElementById("clearTransfersFiltersBtn");
  const toggleFiltersButton = document.getElementById("toggleTransfersFiltersBtn");
  const sortDateButton = document.getElementById("transferSortDateBtn");
  const sortStatusButton = document.getElementById("transferSortStatusBtn");
  const prevButton = document.getElementById("transferPrevPageBtn");
  const nextButton = document.getElementById("transferNextPageBtn");

  statusFilter?.addEventListener("change", (event) => {
    updateFilter("status", event.target.value, { refreshApi: true });
  });

  fromBranchFilter?.addEventListener("change", (event) => {
    updateFilter("fromBranchId", event.target.value, { refreshApi: true });
  });

  toBranchFilter?.addEventListener("change", (event) => {
    updateFilter("toBranchId", event.target.value, { refreshApi: true });
  });

  periodFilter?.addEventListener("change", (event) => {
    updateFilter("period", event.target.value, { refreshApi: true });
  });

  queryFilter?.addEventListener("input", (event) => {
    updateTransfersFilter("productQuery", event.target.value);
  });

  delayedToggle?.addEventListener("change", (event) => {
    updateTransfersFilter("delayedOnly", Boolean(event.target.checked));
  });

  customFrom?.addEventListener("change", (event) => {
    updateTransfersFilter("period", "custom");
    updateFilter("customFrom", event.target.value, { refreshApi: true });
  });

  customTo?.addEventListener("change", (event) => {
    updateTransfersFilter("period", "custom");
    updateFilter("customTo", event.target.value, { refreshApi: true });
  });

  refreshButton?.addEventListener("click", () => {
    refreshTransfersData({ feedback: true });
  });

  newButton?.addEventListener("click", () => {
    openTransferWizard(view);
  });

  exportButton?.addEventListener("click", () => {
    exportTransfersCsv(view);
  });

  clearButton?.addEventListener("click", () => {
    clearTransfersFilters();
    setTransfersFiltersCollapsed(false);
    showToast({
      title: I18N_PTBR.transfers.title,
      message: I18N_PTBR.transfers.toasts.filters_cleared,
      type: "success",
    });
    debouncedRefresh();
  });

  toggleFiltersButton?.addEventListener("click", () => {
    toggleTransfersFiltersCollapsed();
  });

  sortDateButton?.addEventListener("click", () => {
    const nextOrder =
      state.transfers.sort.key === "created_at" && state.transfers.sort.order === "desc"
        ? "asc"
        : "desc";
    setTransfersSort("created_at", nextOrder);
  });

  sortStatusButton?.addEventListener("click", () => {
    const nextOrder =
      state.transfers.sort.key === "status" && state.transfers.sort.order === "asc" ? "desc" : "asc";
    setTransfersSort("status", nextOrder);
  });

  prevButton?.addEventListener("click", () => {
    setTransfersPage(view.pageInfo.page - 1);
  });

  nextButton?.addEventListener("click", () => {
    setTransfersPage(view.pageInfo.page + 1);
  });

  const rowsById = new Map(view.rows.map((row) => [Number(row.id), row]));

  document.querySelectorAll("[data-transfer-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const transferId = Number(button.getAttribute("data-transfer-id"));
      const action = button.getAttribute("data-transfer-action");
      const transfer = rowsById.get(transferId);
      if (!transfer || !action) return;

      if (action === "details") {
        openTransferDetails(transfer, view);
        return;
      }

      await runTransferAction(transfer, action);
    });
  });

  document.querySelectorAll("[data-remove-transfer-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-remove-transfer-filter");
      if (!key) return;
      resetSingleFilter(key);
    });
  });
}

export function renderTransfers() {
  bindKeyboardShortcut();

  const pageContent = document.getElementById("pageContent");
  if (!pageContent) return;

  if (!state.transfers.loaded && !state.transfers.loading) {
    refreshTransfersData();
  }

  if (state.transfers.loading || !state.transfers.loaded) {
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

