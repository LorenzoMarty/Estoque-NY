import { createStockMovement, loadMovementsPayload } from "./api.js";
import { I18N_PTBR, MOVE_TYPE_PTBR } from "./i18n.js";
import {
  clearMovementsFilters,
  mutateMovementsData,
  setMovementsFiltersCollapsed,
  setMovementsLoading,
  setMovementsPage,
  setMovementsPayload,
  setMovementsSort,
  state,
  toggleMovementsFiltersCollapsed,
  updateMovementsFilter,
} from "./state.js";
import {
  applyReveal,
  copyToClipboard,
  initTooltips,
  openDrawer,
  refreshIcons,
  showToast,
} from "./ui.js";
import {
  clamp,
  debounce,
  downloadCsv,
  escapeHtml,
  formatDateTimePtBr,
  formatHourMinutePtBr,
  formatInt,
  formatSignedInt,
  resolvePeriodRange,
  toDatetimeLocalValue,
  toIsoFromDatetimeLocal,
} from "./utils.js";

const { DateTime } = window.luxon;

const SERVER_FILTER_KEYS = new Set([
  "branchId",
  "locationId",
  "period",
  "customFrom",
  "customTo",
  "type",
  "itemQuery",
]);

let refreshSequence = 0;
let shortcutBound = false;

function mapPeriodLabel(period) {
  if (period === "7") return I18N_PTBR.movements.filters.period_7;
  if (period === "30") return I18N_PTBR.movements.filters.period_30;
  if (period === "90") return I18N_PTBR.movements.filters.period_90;
  if (period === "custom") return I18N_PTBR.movements.filters.period_custom;
  return period;
}

function typeFamily(moveType) {
  if (moveType === "RECEIPT") return "entry";
  if (moveType === "ISSUE") return "issue";
  if (moveType === "ADJUSTMENT") return "adjustment";
  if (String(moveType || "").startsWith("TRANSFER")) return "transfer";
  return "other";
}

function moveTypeInfo(moveType) {
  const family = typeFamily(moveType);
  if (family === "entry") {
    return {
      family,
      label: I18N_PTBR.movements.filters.type_entry,
      className: "type-pill-entry",
      tooltip: "Entrada registrada no estoque.",
    };
  }

  if (family === "issue") {
    return {
      family,
      label: I18N_PTBR.movements.filters.type_issue,
      className: "type-pill-issue",
      tooltip: "Saída registrada no estoque.",
    };
  }

  if (family === "adjustment") {
    return {
      family,
      label: I18N_PTBR.movements.filters.type_adjustment,
      className: "type-pill-adjustment",
      tooltip: "Ajuste manual por contagem ou correção.",
    };
  }

  return {
    family,
    label: I18N_PTBR.movements.filters.type_transfer,
    className: "type-pill-transfer",
    tooltip: "Transferência entre filiais.",
  };
}

function getMaps(data) {
  const branchById = new Map((data?.branches || []).map((branch) => [branch.id, branch]));
  const locationById = new Map((data?.locations || []).map((location) => [location.id, location]));
  const itemById = new Map((data?.items || []).map((item) => [item.id, item]));
  return { branchById, locationById, itemById };
}

function locationOptionsByBranch(data, branchId) {
  if (String(branchId || "all") === "all") {
    return data.locations || [];
  }
  return (data.locations || []).filter(
    (location) => Number(location.branch_id) === Number(branchId)
  );
}

function getUsers(data) {
  const fromData = Array.isArray(data?.users) ? data.users : [];
  const map = new Map();

  fromData.forEach((user) => {
    const id = String(user.id ?? user.name ?? "");
    const name = String(user.name ?? "");
    if (!id || !name) return;
    map.set(id, { id, name });
  });

  (data?.moves || []).forEach((move) => {
    const id = String(move.created_by || move.user_name || "");
    const name = String(move.user_name || `Usuário ${move.created_by || "-"}`);
    if (!id) return;
    if (!map.has(id)) {
      map.set(id, { id, name });
    }
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function getReasons(data) {
  const defaults = [
    I18N_PTBR.movements.filters.reason_count,
    I18N_PTBR.movements.filters.reason_correction,
    I18N_PTBR.movements.filters.reason_damage,
    I18N_PTBR.movements.filters.reason_expiry,
    I18N_PTBR.movements.filters.reason_manual,
  ];
  const set = new Set(defaults.map((reason) => reason.toLowerCase()));
  const reasons = [...defaults];

  (data?.moves || []).forEach((move) => {
    if (typeFamily(move.move_type) !== "adjustment") return;
    const current = String(move.reason || "").trim();
    if (!current) return;
    const normalized = current.toLowerCase();
    if (set.has(normalized)) return;
    set.add(normalized);
    reasons.push(current);
  });

  return reasons;
}

function buildActiveChips(view) {
  const filters = state.movements.filters;
  const chips = [];
  const maps = view.maps;
  const usersById = new Map(view.users.map((user) => [String(user.id), user]));

  if (filters.branchId !== "all") {
    chips.push({
      key: "branchId",
      label: `${I18N_PTBR.movements.chips.branch}: ${
        maps.branchById.get(Number(filters.branchId))?.name || filters.branchId
      }`,
    });
  }

  if (filters.locationId !== "all") {
    chips.push({
      key: "locationId",
      label: `${I18N_PTBR.movements.chips.location}: ${
        maps.locationById.get(Number(filters.locationId))?.name || filters.locationId
      }`,
    });
  }

  if (filters.period !== "30") {
    chips.push({
      key: "period",
      label: `${I18N_PTBR.movements.chips.period}: ${mapPeriodLabel(filters.period)}`,
    });
  }

  if (filters.period === "custom") {
    chips.push({
      key: "customRange",
      label: `${I18N_PTBR.movements.chips.custom_range}: ${filters.customFrom} -> ${filters.customTo}`,
    });
  }

  if (filters.type !== "all") {
    chips.push({
      key: "type",
      label: `${I18N_PTBR.movements.chips.type}: ${
        filters.type === "entry"
          ? I18N_PTBR.movements.filters.type_entry
          : filters.type === "issue"
          ? I18N_PTBR.movements.filters.type_issue
          : filters.type === "adjustment"
          ? I18N_PTBR.movements.filters.type_adjustment
          : I18N_PTBR.movements.filters.type_transfer
      }`,
    });
  }

  if (filters.itemQuery) {
    chips.push({
      key: "itemQuery",
      label: `${I18N_PTBR.movements.chips.item}: ${filters.itemQuery}`,
    });
  }

  if (filters.userId !== "all") {
    chips.push({
      key: "userId",
      label: `${I18N_PTBR.movements.chips.user}: ${
        usersById.get(String(filters.userId))?.name || filters.userId
      }`,
    });
  }

  if (filters.qtyMin !== "") {
    chips.push({
      key: "qtyMin",
      label: `${I18N_PTBR.movements.chips.qty_min}: ${filters.qtyMin}`,
    });
  }

  if (filters.qtyMax !== "") {
    chips.push({
      key: "qtyMax",
      label: `${I18N_PTBR.movements.chips.qty_max}: ${filters.qtyMax}`,
    });
  }

  if (filters.reason) {
    chips.push({
      key: "reason",
      label: `${I18N_PTBR.movements.chips.reason}: ${filters.reason}`,
    });
  }

  return chips;
}

function isAtypicalMove(move, threshold) {
  const absQty = Math.abs(Number(move.qty || 0));
  if (absQty >= threshold) return true;

  const reason = String(move.reason || "").toLowerCase();
  if (
    typeFamily(move.move_type) === "adjustment" &&
    (reason.includes("manual") || reason.includes("corre")) &&
    absQty >= Math.max(10, threshold * 0.4)
  ) {
    return true;
  }

  return false;
}

function parseNumericFilter(rawValue) {
  const normalized = String(rawValue || "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildView() {
  const data = state.movements.data;
  if (!data) {
    return {
      maps: { branchById: new Map(), locationById: new Map(), itemById: new Map() },
      users: [],
      reasons: [],
      rows: [],
      rowsPaged: [],
      chips: [],
      kpis: {
        totalMoves: 0,
        entryQty: 0,
        issueQty: 0,
        adjustmentCount: 0,
        adjustmentAbs: 0,
        atypicalCount: 0,
      },
      pageInfo: {
        page: 1,
        totalPages: 1,
        totalRows: 0,
        start: 0,
        end: 0,
      },
      atypicalThreshold: 40,
      periodRange: resolvePeriodRange(state.movements.filters),
    };
  }

  const maps = getMaps(data);
  const users = getUsers(data);
  const reasons = getReasons(data);
  const periodRange = resolvePeriodRange(state.movements.filters);
  const filters = state.movements.filters;
  const itemTerm = String(filters.itemQuery || "").trim().toLowerCase();
  const reasonTerm = String(filters.reason || "").trim().toLowerCase();
  const qtyMin = parseNumericFilter(filters.qtyMin);
  const qtyMax = parseNumericFilter(filters.qtyMax);

  const rows = (data.moves || []).filter((move) => {
    const occurred = DateTime.fromISO(String(move.occurred_at || ""));
    if (!occurred.isValid) return false;
    if (occurred < periodRange.from || occurred > periodRange.to) return false;

    if (String(filters.branchId) !== "all" && Number(move.branch_id) !== Number(filters.branchId)) {
      return false;
    }

    if (
      String(filters.locationId) !== "all" &&
      Number(move.location_id) !== Number(filters.locationId)
    ) {
      return false;
    }

    const family = typeFamily(move.move_type);
    if (filters.type !== "all" && family !== filters.type) {
      return false;
    }

    if (itemTerm) {
      const item = maps.itemById.get(move.sku_id);
      const searchText =
        `${item?.name || ""} ${item?.sku_code || ""} ${item?.barcode || ""} ${
          move.reference_id || ""
        }`.toLowerCase();
      if (!searchText.includes(itemTerm)) return false;
    }

    if (String(filters.userId) !== "all") {
      const userId = String(filters.userId);
      const moveUserId = String(move.created_by || "");
      const moveUserName = String(move.user_name || "").toLowerCase();
      if (moveUserId !== userId && moveUserName !== userId.toLowerCase()) {
        return false;
      }
    }

    const absQty = Math.abs(Number(move.qty || 0));
    if (qtyMin != null && absQty < qtyMin) return false;
    if (qtyMax != null && absQty > qtyMax) return false;

    if (reasonTerm) {
      if (family !== "adjustment") return false;
      const currentReason = String(move.reason || "").toLowerCase();
      if (!currentReason.includes(reasonTerm)) return false;
    }

    return true;
  });

  rows.sort((left, right) => {
    const leftDate = DateTime.fromISO(String(left.occurred_at || "")).toMillis();
    const rightDate = DateTime.fromISO(String(right.occurred_at || "")).toMillis();
    if (state.movements.sort.order === "asc") {
      if (leftDate !== rightDate) return leftDate - rightDate;
      return Number(left.id || 0) - Number(right.id || 0);
    }
    if (leftDate !== rightDate) return rightDate - leftDate;
    return Number(right.id || 0) - Number(left.id || 0);
  });

  const quantities = rows.map((row) => Math.abs(Number(row.qty || 0))).sort((a, b) => a - b);
  const percentileIndex = quantities.length ? Math.floor(quantities.length * 0.9) : 0;
  const atypicalThreshold = Math.max(40, quantities[percentileIndex] || 0);

  const kpis = {
    totalMoves: rows.length,
    entryQty: rows
      .filter((row) => typeFamily(row.move_type) === "entry")
      .reduce((acc, row) => acc + Math.abs(Number(row.qty || 0)), 0),
    issueQty: rows
      .filter((row) => typeFamily(row.move_type) === "issue")
      .reduce((acc, row) => acc + Math.abs(Number(row.qty || 0)), 0),
    adjustmentCount: rows.filter((row) => typeFamily(row.move_type) === "adjustment").length,
    adjustmentAbs: rows
      .filter((row) => typeFamily(row.move_type) === "adjustment")
      .reduce((acc, row) => acc + Math.abs(Number(row.qty || 0)), 0),
    atypicalCount: rows.filter((row) => isAtypicalMove(row, atypicalThreshold)).length,
  };

  const totalRows = rows.length;
  const pageSize = state.movements.pagination.pageSize;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = clamp(state.movements.pagination.page, 1, totalPages);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const rowsPaged = rows.slice(startIndex, endIndex);
  const chips = buildActiveChips({
    maps,
    users,
  });

  return {
    maps,
    users,
    reasons,
    rows,
    rowsPaged,
    chips,
    kpis,
    pageInfo: {
      page,
      totalPages,
      totalRows,
      start: totalRows ? startIndex + 1 : 0,
      end: Math.min(endIndex, totalRows),
    },
    atypicalThreshold,
    periodRange,
  };
}

function renderChipList(chips) {
  if (!chips.length) {
    return `<small class="chips-empty">Sem filtros ativos.</small>`;
  }

  return chips
    .map(
      (chip) => `
        <button class="filter-chip" data-remove-filter="${escapeHtml(chip.key)}" aria-label="${
        I18N_PTBR.movements.actions.clear_chip
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
          <i data-lucide="list-checks"></i>
          <button class="kpi-help" data-tippy-content="${
            I18N_PTBR.movements.kpis.total_moves.tooltip
          }" aria-label="Ajuda total de movimentações"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.movements.kpis.total_moves.label}</p>
        <strong>${formatInt(view.kpis.totalMoves)}</strong>
      </article>

      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="arrow-down-circle"></i>
          <button class="kpi-help" data-tippy-content="${
            I18N_PTBR.movements.kpis.entries.tooltip
          }" aria-label="Ajuda entradas"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.movements.kpis.entries.label}</p>
        <strong>${formatInt(view.kpis.entryQty)}</strong>
      </article>

      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="arrow-up-circle"></i>
          <button class="kpi-help" data-tippy-content="${
            I18N_PTBR.movements.kpis.issues.tooltip
          }" aria-label="Ajuda saídas"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.movements.kpis.issues.label}</p>
        <strong>${formatInt(view.kpis.issueQty)}</strong>
      </article>

      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="sliders-horizontal"></i>
          <button class="kpi-help" data-tippy-content="${
            I18N_PTBR.movements.kpis.adjustments.tooltip
          }" aria-label="Ajuda ajustes"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.movements.kpis.adjustments.label}</p>
        <strong>${formatInt(view.kpis.adjustmentCount)}</strong>
        <small>${I18N_PTBR.movements.kpis.abs_total}: ${formatInt(view.kpis.adjustmentAbs)}</small>
      </article>

      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="triangle-alert"></i>
          <button class="kpi-help" data-tippy-content="${
            I18N_PTBR.movements.kpis.atypical.tooltip
          }" aria-label="Ajuda atípicos"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.movements.kpis.atypical.label}</p>
        <strong>${formatInt(view.kpis.atypicalCount)}</strong>
      </article>
    </section>
  `;
}

function renderRows(view) {
  if (!view.rowsPaged.length) {
    return `
      <tr>
        <td colspan="9">
          <div class="empty-state">
            <i data-lucide="inbox"></i>
            <span>${I18N_PTBR.movements.table.empty}</span>
          </div>
        </td>
      </tr>
    `;
  }

  return view.rowsPaged
    .map((move) => {
      const info = moveTypeInfo(move.move_type);
      const branch = view.maps.branchById.get(move.branch_id);
      const location = view.maps.locationById.get(move.location_id);
      const item = view.maps.itemById.get(move.sku_id);
      const qty = Number(move.qty || 0);
      const isAtypical = isAtypicalMove(move, view.atypicalThreshold);
      const reference = move.reference_id || "-";
      const qtyClass = qty >= 0 ? "qty-pos" : "qty-neg";
      const variationLabel =
        item?.sku_code || item?.barcode || `Variação ${String(move.sku_id || "-")}`;

      return `
        <tr class="${isAtypical ? "is-atypical-row" : ""}">
          <td>${formatDateTimePtBr(move.occurred_at)}</td>
          <td>
            <span class="type-pill ${info.className}" data-tippy-content="${escapeHtml(info.tooltip)}">
              ${escapeHtml(info.label)}
            </span>
          </td>
          <td>${escapeHtml(branch?.name || "-")}</td>
          <td>${escapeHtml(location?.name || "-")}</td>
          <td>
            <div class="item-stack">
              <strong>${escapeHtml(item?.name || `Variação ${move.sku_id}`)}</strong>
              <small>Variação do produto: ${escapeHtml(variationLabel)}</small>
            </div>
          </td>
          <td class="qty-cell ${qtyClass}">${formatSignedInt(qty)}</td>
          <td>${escapeHtml(move.user_name || `Usuário ${move.created_by || "-"}`)}</td>
          <td>${escapeHtml(reference)}</td>
          <td>
            <button
              class="btn sm ghost"
              data-move-detail-id="${move.id}"
              aria-label="Abrir detalhes da movimentação ${move.id}"
            >${I18N_PTBR.movements.table.details}</button>
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
          <div class="skeleton line" style="width: 220px;"></div>
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
      ${new Array(5)
        .fill("<article class='mini-kpi-card'><div class='skeleton block' style='height:96px;'></div></article>")
        .join("")}
    </section>

    <section class="panel table-card reveal">
      <div class="skeleton line" style="width: 320px;"></div>
      <div class="skeleton block" style="height: 360px; margin-top: 10px;"></div>
    </section>
  `;
}

function renderPermissionState() {
  return `
    <section class="panel pad reveal">
      <div class="permission-state">
        <i data-lucide="shield-alert"></i>
        <h2>${I18N_PTBR.movements.permissions.title}</h2>
        <p>${I18N_PTBR.movements.permissions.subtitle}</p>
        <button class="btn primary" id="retryMovementsPermissionBtn">
          <i data-lucide="refresh-cw"></i>
          ${I18N_PTBR.movements.permissions.retry}
        </button>
      </div>
    </section>
  `;
}

function renderLoadedState(view) {
  const data = state.movements.data;
  const filters = state.movements.filters;
  const filtersCollapsed = state.movements.ui.filtersCollapsed;
  const locationOptions = locationOptionsByBranch(data, filters.branchId);
  const customDisabled = filters.period !== "custom";
  const pageInfo = view.pageInfo;

  const branchOptionsMarkup = [
    `<option value="all">${I18N_PTBR.movements.filters.all_branches}</option>`,
    ...(data.branches || []).map(
      (branch) =>
        `<option value="${branch.id}" ${
          String(filters.branchId) === String(branch.id) ? "selected" : ""
        }>${escapeHtml(branch.name)}</option>`
    ),
  ].join("");

  const locationOptionsMarkup = [
    `<option value="all">${I18N_PTBR.movements.filters.all_locations}</option>`,
    ...locationOptions.map(
      (location) =>
        `<option value="${location.id}" ${
          String(filters.locationId) === String(location.id) ? "selected" : ""
        }>${escapeHtml(location.name)}</option>`
    ),
  ].join("");

  const userOptionsMarkup = [
    `<option value="all">${I18N_PTBR.movements.filters.all_users}</option>`,
    ...view.users.map(
      (user) =>
        `<option value="${escapeHtml(user.id)}" ${
          String(filters.userId) === String(user.id) ? "selected" : ""
        }>${escapeHtml(user.name)}</option>`
    ),
  ].join("");

  const reasonOptionsMarkup = [
    `<option value="">${I18N_PTBR.movements.filters.reason_all}</option>`,
    ...view.reasons.map(
      (reason) =>
        `<option value="${escapeHtml(reason)}" ${
          String(filters.reason) === String(reason) ? "selected" : ""
        }>${escapeHtml(reason)}</option>`
    ),
  ].join("");

  const sortArrow = state.movements.sort.order === "desc" ? "↓" : "↑";
  const sortLabel =
    state.movements.sort.order === "desc"
      ? I18N_PTBR.movements.table.sort_desc
      : I18N_PTBR.movements.table.sort_asc;

  return `
    <section class="panel pad reveal">
      ${
        state.movements.showDemoBanner
          ? `<div class="banner"><i data-lucide="flask-conical"></i>${I18N_PTBR.mode_demo_banner}</div>`
          : ""
      }
      <div class="page-head" style="margin-top:${state.movements.showDemoBanner ? "12px" : "0"};">
        <div>
          <div class="breadcrumbs">${I18N_PTBR.movements.breadcrumb}</div>
          <h1>${I18N_PTBR.movements.title}</h1>
          <p class="section-subtitle">${I18N_PTBR.movements.subtitle}</p>
          <small>${I18N_PTBR.last_update}: <strong>${formatHourMinutePtBr(
            state.movements.lastUpdatedIso || data.generated_at
          )}</strong></small>
        </div>
        <div class="movements-actions">
          <button class="btn primary" id="newMovementBtn">
            <i data-lucide="plus"></i>${I18N_PTBR.movements.actions.new}
          </button>
          <button class="btn" id="exportMovementCsvBtn">
            <i data-lucide="download"></i>${I18N_PTBR.movements.actions.export_csv}
          </button>
          <button class="btn ghost" id="clearMovementFiltersBtn">
            <i data-lucide="x-circle"></i>${I18N_PTBR.movements.actions.clear_filters}
          </button>
        </div>
      </div>

      <div class="movements-filter-toolbar">
        <button
          class="btn sm ghost"
          id="toggleMovementsFiltersBtn"
          aria-expanded="${filtersCollapsed ? "false" : "true"}"
          aria-controls="movementsFiltersPanel"
        >
          <i data-lucide="${filtersCollapsed ? "chevron-down" : "chevron-up"}"></i>
          ${
            filtersCollapsed
              ? I18N_PTBR.movements.actions.filter_show
              : I18N_PTBR.movements.actions.filter_hide
          }
        </button>
        <small class="section-subtitle">${I18N_PTBR.movements.filter_shortcut}</small>
      </div>

      <div class="movements-filters ${filtersCollapsed ? "is-collapsed" : ""}" id="movementsFiltersPanel">
        <div class="movements-filter-grid">
          <div class="field">
            <label for="movementBranchFilter">${I18N_PTBR.movements.filters.branch}</label>
            <select id="movementBranchFilter">${branchOptionsMarkup}</select>
          </div>

          <div class="field">
            <label for="movementLocationFilter">${I18N_PTBR.movements.filters.location}</label>
            <select id="movementLocationFilter">${locationOptionsMarkup}</select>
          </div>

          <div class="field">
            <label for="movementPeriodFilter">${I18N_PTBR.movements.filters.period}</label>
            <select id="movementPeriodFilter">
              <option value="7" ${
                filters.period === "7" ? "selected" : ""
              }>${I18N_PTBR.movements.filters.period_7}</option>
              <option value="30" ${
                filters.period === "30" ? "selected" : ""
              }>${I18N_PTBR.movements.filters.period_30}</option>
              <option value="90" ${
                filters.period === "90" ? "selected" : ""
              }>${I18N_PTBR.movements.filters.period_90}</option>
              <option value="custom" ${
                filters.period === "custom" ? "selected" : ""
              }>${I18N_PTBR.movements.filters.period_custom}</option>
            </select>
          </div>

          <div class="field">
            <label for="movementTypeFilter">${I18N_PTBR.movements.filters.type}</label>
            <select id="movementTypeFilter">
              <option value="all" ${
                filters.type === "all" ? "selected" : ""
              }>${I18N_PTBR.movements.filters.type_all}</option>
              <option value="entry" ${
                filters.type === "entry" ? "selected" : ""
              }>${I18N_PTBR.movements.filters.type_entry}</option>
              <option value="issue" ${
                filters.type === "issue" ? "selected" : ""
              }>${I18N_PTBR.movements.filters.type_issue}</option>
              <option value="adjustment" ${
                filters.type === "adjustment" ? "selected" : ""
              }>${I18N_PTBR.movements.filters.type_adjustment}</option>
              <option value="transfer" ${
                filters.type === "transfer" ? "selected" : ""
              }>${I18N_PTBR.movements.filters.type_transfer}</option>
            </select>
          </div>

          <div class="field movements-filter-item-field">
            <label for="movementItemFilter">${I18N_PTBR.movements.filters.item}</label>
            <input
              id="movementItemFilter"
              type="search"
              value="${escapeHtml(filters.itemQuery)}"
              placeholder="${escapeHtml(I18N_PTBR.movements.filters.item_placeholder)}"
            />
          </div>

          <div class="field">
            <label for="movementUserFilter">${I18N_PTBR.movements.filters.user}</label>
            <select id="movementUserFilter">${userOptionsMarkup}</select>
          </div>

          <div class="field">
            <label for="movementQtyMinFilter">${I18N_PTBR.movements.filters.quantity_min}</label>
            <input id="movementQtyMinFilter" type="number" min="0" step="1" value="${escapeHtml(
              filters.qtyMin
            )}" />
          </div>

          <div class="field">
            <label for="movementQtyMaxFilter">${I18N_PTBR.movements.filters.quantity_max}</label>
            <input id="movementQtyMaxFilter" type="number" min="0" step="1" value="${escapeHtml(
              filters.qtyMax
            )}" />
          </div>

          <div class="field">
            <label for="movementReasonFilter">${I18N_PTBR.movements.filters.reason}</label>
            <select id="movementReasonFilter">${reasonOptionsMarkup}</select>
          </div>

          <div class="field">
            <label for="movementCustomFrom">${I18N_PTBR.movements.filters.custom_from}</label>
            <input id="movementCustomFrom" type="date" value="${filters.customFrom}" ${
    customDisabled ? "disabled" : ""
  } />
          </div>

          <div class="field">
            <label for="movementCustomTo">${I18N_PTBR.movements.filters.custom_to}</label>
            <input id="movementCustomTo" type="date" value="${filters.customTo}" ${
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
          <h2 class="section-title">${I18N_PTBR.movements.table.title}</h2>
          <p class="section-subtitle">${I18N_PTBR.movements.table.subtitle}</p>
        </div>
        <div class="table-tools">
          <button class="btn sm ghost" id="refreshMovementsBtn">
            <i data-lucide="refresh-cw"></i>${I18N_PTBR.movements.actions.refresh}
          </button>
        </div>
      </div>

      <div class="table-wrap movements-table-wrap">
        <table class="movements-table">
          <thead>
            <tr>
              <th>
                <button class="table-sort-btn" id="movementSortDateBtn" aria-label="${escapeHtml(
                  sortLabel
                )}">
                  ${I18N_PTBR.movements.table.date} ${sortArrow}
                </button>
              </th>
              <th>${I18N_PTBR.movements.table.type}</th>
              <th>${I18N_PTBR.movements.table.branch}</th>
              <th>${I18N_PTBR.movements.table.location}</th>
              <th>${I18N_PTBR.movements.table.item}</th>
              <th>${I18N_PTBR.movements.table.quantity}</th>
              <th>${I18N_PTBR.movements.table.user}</th>
              <th>${I18N_PTBR.movements.table.reference}</th>
              <th>${I18N_PTBR.movements.table.action}</th>
            </tr>
          </thead>
          <tbody>
            ${renderRows(view)}
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <small>
          ${I18N_PTBR.movements.table.showing} ${pageInfo.start}-${pageInfo.end} ${
    I18N_PTBR.movements.table.of
  } ${pageInfo.totalRows}
        </small>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn sm ghost" id="movementPrevPageBtn" ${
            pageInfo.page <= 1 ? "disabled" : ""
          }>Anterior</button>
          <small>${I18N_PTBR.movements.table.page} ${pageInfo.page} ${I18N_PTBR.movements.table.of} ${
    pageInfo.totalPages
  }</small>
          <button class="btn sm ghost" id="movementNextPageBtn" ${
            pageInfo.page >= pageInfo.totalPages ? "disabled" : ""
          }>Próxima</button>
        </div>
      </div>
    </section>
  `;
}

async function refreshMovementsData({ feedback = false } = {}) {
  const currentRequest = ++refreshSequence;
  setMovementsLoading(true);
  const payload = await loadMovementsPayload(state.movements.filters);

  if (currentRequest !== refreshSequence) {
    return payload;
  }

  setMovementsPayload(payload);

  if (feedback) {
    if (payload.permissionDenied) {
      showToast({
        title: I18N_PTBR.movements.title,
        message: I18N_PTBR.movements.toasts.permission_denied,
        type: "error",
      });
    } else if (payload.mode === "demo") {
      showToast({
        title: I18N_PTBR.movements.title,
        message: I18N_PTBR.movements.toasts.fallback_demo,
        type: "error",
      });
    } else {
      showToast({
        title: I18N_PTBR.movements.title,
        message: I18N_PTBR.movements.toasts.refreshed,
        type: "success",
      });
    }
  }

  return payload;
}

const debouncedServerRefresh = debounce(() => {
  refreshMovementsData();
}, 320);

function updateFilterAndRefresh(filterKey, value) {
  updateMovementsFilter(filterKey, value);
  if (SERVER_FILTER_KEYS.has(filterKey)) {
    debouncedServerRefresh();
  }
}

function resetSingleFilter(filterKey) {
  if (filterKey === "customRange") {
    updateMovementsFilter("period", "30");
    debouncedServerRefresh();
    return;
  }

  if (filterKey === "branchId" || filterKey === "locationId" || filterKey === "userId") {
    updateMovementsFilter(filterKey, "all");
  } else if (filterKey === "period") {
    updateMovementsFilter("period", "30");
  } else if (filterKey === "type") {
    updateMovementsFilter("type", "all");
  } else if (filterKey === "itemQuery") {
    updateMovementsFilter("itemQuery", "");
  } else if (filterKey === "qtyMin" || filterKey === "qtyMax" || filterKey === "reason") {
    updateMovementsFilter(filterKey, "");
  }

  if (SERVER_FILTER_KEYS.has(filterKey)) {
    debouncedServerRefresh();
  }
}

function nextId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id || 0)), 0) + 1;
}

function buildLocalCreatedMove(payload, data) {
  const quantitySigned =
    payload.moveCategory === "entry"
      ? Number(payload.quantity)
      : payload.moveCategory === "issue"
      ? -Math.abs(Number(payload.quantity))
      : Number(payload.quantityDelta);

  const previousRow = (data.moves || []).find(
    (row) =>
      Number(row.branch_id) === Number(payload.branchId) &&
      Number(row.location_id || 0) === Number(payload.locationId || 0) &&
      Number(row.sku_id) === Number(payload.itemId) &&
      typeof row.balance_after === "number"
  );

  const previousBalance = Number(previousRow?.balance_after || 0);
  const createdId = nextId(data.moves || []);
  const now = payload.occurredAtIso || DateTime.now().toISO();

  return {
    id: createdId,
    branch_id: Number(payload.branchId),
    location_id: Number(payload.locationId || 0),
    sku_id: Number(payload.itemId),
    move_type:
      payload.moveCategory === "entry"
        ? "RECEIPT"
        : payload.moveCategory === "issue"
        ? "ISSUE"
        : "ADJUSTMENT",
    qty: quantitySigned,
    occurred_at: now,
    created_by: "local",
    user_name: "Operador FreeShop",
    reason: payload.reason || "",
    reference_id: payload.referenceId || `UI-MOV-${String(createdId).padStart(6, "0")}`,
    balance_after: previousBalance + quantitySigned,
    transfer_id: null,
    inventory_count_id: null,
  };
}

function openMovementDetails(move, view) {
  const item = view.maps.itemById.get(move.sku_id);
  const branch = view.maps.branchById.get(move.branch_id);
  const location = view.maps.locationById.get(move.location_id);
  const balanceAfter = typeof move.balance_after === "number" ? Number(move.balance_after) : null;
  const quantity = Number(move.qty || 0);
  const balanceBefore = balanceAfter != null ? balanceAfter - quantity : null;

  const relatedIds = [
    { label: "ID da movimentação", value: move.id },
    { label: "transfer_id", value: move.transfer_id },
    { label: "count_id", value: move.inventory_count_id },
    { label: "reference_id", value: move.reference_id },
  ].filter((entry) => entry.value != null && String(entry.value) !== "");

  openDrawer({
    title: I18N_PTBR.movements.details.title,
    subtitle: `${MOVE_TYPE_PTBR[move.move_type] || move.move_type} · ${formatDateTimePtBr(
      move.occurred_at
    )}`,
    bodyHtml: `
      <section class="drawer-section">
        <h4>${I18N_PTBR.movements.details.summary}</h4>
        <div class="drawer-grid">
          <div><small>${I18N_PTBR.movements.details.type}</small><strong>${escapeHtml(
      MOVE_TYPE_PTBR[move.move_type] || move.move_type
    )}</strong></div>
          <div><small>${I18N_PTBR.movements.details.date}</small><strong>${formatDateTimePtBr(
      move.occurred_at
    )}</strong></div>
          <div><small>${I18N_PTBR.movements.details.user}</small><strong>${escapeHtml(
      move.user_name || `Usuário ${move.created_by || "-"}`
    )}</strong></div>
        </div>
      </section>

      <section class="drawer-section">
        <h4>${I18N_PTBR.movements.details.location}</h4>
        <div class="drawer-grid">
          <div><small>${I18N_PTBR.movements.details.branch}</small><strong>${escapeHtml(
      branch?.name || "-"
    )}</strong></div>
          <div><small>${I18N_PTBR.movements.details.local}</small><strong>${escapeHtml(
      location?.name || "-"
    )}</strong></div>
        </div>
      </section>

      <section class="drawer-section">
        <h4>${I18N_PTBR.movements.details.item}</h4>
        <div class="drawer-grid">
          <div><small>${I18N_PTBR.movements.details.item_name}</small><strong>${escapeHtml(
      item?.name || `Variação ${move.sku_id}`
    )}</strong></div>
          <div><small>${I18N_PTBR.movements.details.item_variation}</small><strong>${escapeHtml(
      item?.sku_code || `VAR-${String(move.sku_id).padStart(4, "0")}`
    )}</strong></div>
          <div><small>${I18N_PTBR.movements.details.barcode}</small><strong>${escapeHtml(
      item?.barcode || I18N_PTBR.movements.details.none
    )}</strong></div>
        </div>
      </section>

      <section class="drawer-section">
        <h4>${I18N_PTBR.movements.details.quantity}</h4>
        <div class="drawer-grid">
          <div><small>${I18N_PTBR.movements.details.qty}</small><strong>${formatSignedInt(
      quantity
    )}</strong></div>
          <div><small>${I18N_PTBR.movements.details.balance_before}</small><strong>${
      balanceBefore == null ? I18N_PTBR.movements.details.none : formatInt(balanceBefore)
    }</strong></div>
          <div><small>${I18N_PTBR.movements.details.balance_after}</small><strong>${
      balanceAfter == null ? I18N_PTBR.movements.details.none : formatInt(balanceAfter)
    }</strong></div>
        </div>
      </section>

      <section class="drawer-section">
        <h4>${I18N_PTBR.movements.details.notes}</h4>
        <div class="drawer-grid">
          <div><small>${I18N_PTBR.movements.details.reason}</small><strong>${escapeHtml(
      move.reason || I18N_PTBR.movements.details.none
    )}</strong></div>
          <div><small>${I18N_PTBR.movements.details.observation}</small><strong>${escapeHtml(
      move.reference_id || I18N_PTBR.movements.details.none
    )}</strong></div>
        </div>
      </section>

      <section class="drawer-section">
        <h4>${I18N_PTBR.movements.details.related_ids}</h4>
        ${
          relatedIds.length
            ? `<div class="drawer-grid">${relatedIds
                .map(
                  (entry) =>
                    `<div><small>${escapeHtml(entry.label)}</small><strong>${escapeHtml(
                      entry.value
                    )}</strong></div>`
                )
                .join("")}</div>`
            : `<p class="section-subtitle">${I18N_PTBR.movements.details.none}</p>`
        }
      </section>
    `,
    footerHtml: `
      <div class="drawer-footer">
        <button type="button" class="btn ghost" data-close-drawer>${I18N_PTBR.movements.details.close}</button>
        <button type="button" class="btn ghost" data-copy-move-id>${I18N_PTBR.movements.details.copy_id}</button>
        <button type="button" class="btn primary" data-filter-same-item>${I18N_PTBR.movements.details.same_item}</button>
      </div>
    `,
    onOpen: (overlay, helpers) => {
      overlay.querySelector("[data-copy-move-id]")?.addEventListener("click", async () => {
        try {
          await copyToClipboard(String(move.id));
          showToast({
            title: I18N_PTBR.movements.details.title,
            message: I18N_PTBR.movements.details.copied,
            type: "success",
          });
        } catch {
          showToast({
            title: I18N_PTBR.movements.details.title,
            message: I18N_PTBR.movements.details.copy_error,
            type: "error",
          });
        }
      });

      overlay.querySelector("[data-filter-same-item]")?.addEventListener("click", () => {
        const nextValue = item?.sku_code || item?.name || String(move.sku_id || "");
        updateMovementsFilter("itemQuery", nextValue);
        debouncedServerRefresh();
        helpers.close();
      });
    },
  });
}

function openNewMovementDrawer(view) {
  const data = state.movements.data;
  if (!data) return;

  const branches = data.branches || [];
  const items = data.items || [];
  const defaultBranchId =
    state.movements.filters.branchId !== "all"
      ? String(state.movements.filters.branchId)
      : String(branches[0]?.id || "");
  const defaultLocations = locationOptionsByBranch(data, defaultBranchId);
  const defaultLocationId = String(defaultLocations[0]?.id || "");
  const defaultItemId = String(items[0]?.id || "");
  const nowLocal = toDatetimeLocalValue(DateTime.now().toISO());

  const branchOptions = branches
    .map(
      (branch) =>
        `<option value="${branch.id}" ${
          String(branch.id) === defaultBranchId ? "selected" : ""
        }>${escapeHtml(branch.name)}</option>`
    )
    .join("");
  const itemOptions = items
    .map(
      (item) =>
        `<option value="${item.id}" ${
          String(item.id) === defaultItemId ? "selected" : ""
        }>${escapeHtml(item.name)} - ${escapeHtml(item.sku_code || `VAR-${item.id}`)}</option>`
    )
    .join("");

  openDrawer({
    title: I18N_PTBR.movements.new_move.title,
    subtitle: I18N_PTBR.movements.new_move.subtitle,
    submitLabel: I18N_PTBR.movements.new_move.save,
    cancelLabel: I18N_PTBR.drawer.cancel,
    bodyHtml: `
      <div class="field">
        <label for="newMoveType">${I18N_PTBR.movements.new_move.type_label} *</label>
        <select id="newMoveType" name="moveType" required>
          <option value="entry">${I18N_PTBR.movements.new_move.type_entry}</option>
          <option value="issue">${I18N_PTBR.movements.new_move.type_issue}</option>
          <option value="adjustment">${I18N_PTBR.movements.new_move.type_adjustment}</option>
        </select>
      </div>

      <div class="field">
        <label for="newMoveBranch">${I18N_PTBR.movements.new_move.branch} *</label>
        <select id="newMoveBranch" name="branchId" required>${branchOptions}</select>
      </div>

      <div class="field">
        <label for="newMoveLocation">${I18N_PTBR.movements.new_move.location} *</label>
        <select id="newMoveLocation" name="locationId" required></select>
      </div>

      <div class="field">
        <label for="newMoveItem">${I18N_PTBR.movements.new_move.item} *</label>
        <select id="newMoveItem" name="itemId" required>${itemOptions}</select>
      </div>

      <div class="field">
        <label for="newMoveQuantity">${I18N_PTBR.movements.new_move.quantity} *</label>
        <input id="newMoveQuantity" name="quantity" type="number" min="1" step="1" value="1" required />
      </div>

      <div class="field" id="newMoveDirectionField" hidden>
        <label for="newMoveDirection">${I18N_PTBR.movements.new_move.adjustment_direction}</label>
        <select id="newMoveDirection" name="adjustmentDirection">
          <option value="positive">${I18N_PTBR.movements.new_move.adjustment_positive}</option>
          <option value="negative">${I18N_PTBR.movements.new_move.adjustment_negative}</option>
        </select>
      </div>

      <div class="field">
        <label for="newMoveReason">${I18N_PTBR.movements.new_move.reason}</label>
        <input id="newMoveReason" name="reason" type="text" />
      </div>

      <div class="field">
        <label for="newMoveReference">${I18N_PTBR.movements.new_move.reference}</label>
        <input
          id="newMoveReference"
          name="referenceId"
          type="text"
          placeholder="${escapeHtml(I18N_PTBR.movements.new_move.placeholder_reference)}"
        />
      </div>

      <div class="field">
        <label for="newMoveOccurredAt">${I18N_PTBR.movements.new_move.occurred_at}</label>
        <input id="newMoveOccurredAt" name="occurredAt" type="datetime-local" value="${nowLocal}" />
      </div>
    `,
    onOpen: (overlay) => {
      const moveTypeSelect = overlay.querySelector("#newMoveType");
      const branchSelect = overlay.querySelector("#newMoveBranch");
      const locationSelect = overlay.querySelector("#newMoveLocation");
      const directionField = overlay.querySelector("#newMoveDirectionField");

      function fillLocations() {
        const options = locationOptionsByBranch(data, branchSelect.value);
        locationSelect.innerHTML = options
          .map((location) => `<option value="${location.id}">${escapeHtml(location.name)}</option>`)
          .join("");

        if (!options.length) {
          locationSelect.innerHTML = `<option value="">Sem local disponível</option>`;
        }
      }

      function syncAdjustmentField() {
        directionField.hidden = moveTypeSelect.value !== "adjustment";
      }

      fillLocations();
      if (defaultLocationId) {
        locationSelect.value = defaultLocationId;
      }
      syncAdjustmentField();

      branchSelect.addEventListener("change", fillLocations);
      moveTypeSelect.addEventListener("change", syncAdjustmentField);
    },
    onSubmit: async (formData, helpers) => {
      const moveCategory = String(formData.get("moveType") || "");
      const branchId = Number(formData.get("branchId"));
      const locationId = Number(formData.get("locationId"));
      const itemId = Number(formData.get("itemId"));
      const quantity = Number(formData.get("quantity"));
      const direction = String(formData.get("adjustmentDirection") || "positive");
      const reason = String(formData.get("reason") || "").trim();
      const referenceId = String(formData.get("referenceId") || "").trim();
      const occurredAtIso = toIsoFromDatetimeLocal(String(formData.get("occurredAt") || ""));
      const quantityDelta =
        moveCategory === "adjustment" && direction === "negative" ? -quantity : quantity;

      if (!branchId || !locationId || !itemId || !moveCategory) {
        helpers.setError(I18N_PTBR.movements.new_move.required_error);
        return false;
      }

      if (Number.isNaN(quantity) || quantity <= 0) {
        helpers.setError(I18N_PTBR.movements.new_move.quantity_error);
        return false;
      }

      const payload = {
        moveCategory,
        branchId,
        locationId,
        itemId,
        quantity,
        quantityDelta,
        reason,
        referenceId,
        occurredAtIso,
      };

      try {
        if (!state.movements.demoMode && state.movements.mode === "api") {
          const created = await createStockMovement(payload);
          mutateMovementsData((draft) => {
            draft.moves.unshift({
              ...created,
              user_name: created.user_name || "Operador FreeShop",
            });
          });
        } else {
          mutateMovementsData((draft) => {
            const localMove = buildLocalCreatedMove(payload, draft);
            draft.moves.unshift(localMove);

            if (!Array.isArray(draft.users)) {
              draft.users = [];
            }
            if (!draft.users.some((user) => String(user.name) === "Operador FreeShop")) {
              draft.users.unshift({ id: "local", name: "Operador FreeShop" });
            }
          });
        }
      } catch (error) {
        if (error?.status === 401 || error?.status === 403) {
          helpers.setError(I18N_PTBR.movements.toasts.permission_denied);
        } else {
          helpers.setError(I18N_PTBR.movements.new_move.api_error);
        }
        return false;
      }

      showToast({
        title: I18N_PTBR.movements.title,
        message: I18N_PTBR.movements.new_move.success,
        type: "success",
      });

      return true;
    },
  });
}

function exportCurrentRowsToCsv(view) {
  if (!view.rows.length) {
    showToast({
      title: I18N_PTBR.movements.title,
      message: I18N_PTBR.movements.toasts.csv_empty,
      type: "error",
    });
    return;
  }

  const rows = view.rows.map((move) => {
    const item = view.maps.itemById.get(move.sku_id);
    const branch = view.maps.branchById.get(move.branch_id);
    const location = view.maps.locationById.get(move.location_id);
    return {
      data_hora: formatDateTimePtBr(move.occurred_at),
      tipo: MOVE_TYPE_PTBR[move.move_type] || move.move_type,
      filial: branch?.name || "-",
      local: location?.name || "-",
      item: item?.name || `Variação ${move.sku_id}`,
      variacao: item?.sku_code || "",
      quantidade: formatSignedInt(move.qty),
      usuario: move.user_name || `Usuário ${move.created_by || "-"}`,
      referencia: move.reference_id || "-",
      motivo: move.reason || "-",
    };
  });

  const today = DateTime.now().toFormat("yyyy-LL-dd");
  downloadCsv({
    filename: `movimentacoes_${today}.csv`,
    columns: [
      { key: "data_hora", label: "Data/Hora" },
      { key: "tipo", label: "Tipo" },
      { key: "filial", label: "Filial" },
      { key: "local", label: "Local" },
      { key: "item", label: "Item" },
      { key: "variacao", label: "Variação do produto" },
      { key: "quantidade", label: "Quantidade" },
      { key: "usuario", label: "Usuário" },
      { key: "referencia", label: "Referência" },
      { key: "motivo", label: "Motivo" },
    ],
    rows,
  });

  showToast({
    title: I18N_PTBR.movements.title,
    message: I18N_PTBR.movements.toasts.csv_success,
    type: "success",
  });
}

function bindKeyboardShortcut() {
  if (shortcutBound) return;
  shortcutBound = true;

  document.addEventListener("keydown", (event) => {
    if (state.route !== "movimentacoes") return;
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
    const input = document.getElementById("movementItemFilter");
    if (input instanceof HTMLElement) {
      input.focus();
    }
  });
}

function bindEvents(view) {
  const branchFilter = document.getElementById("movementBranchFilter");
  const locationFilter = document.getElementById("movementLocationFilter");
  const periodFilter = document.getElementById("movementPeriodFilter");
  const typeFilter = document.getElementById("movementTypeFilter");
  const itemFilter = document.getElementById("movementItemFilter");
  const userFilter = document.getElementById("movementUserFilter");
  const qtyMinFilter = document.getElementById("movementQtyMinFilter");
  const qtyMaxFilter = document.getElementById("movementQtyMaxFilter");
  const reasonFilter = document.getElementById("movementReasonFilter");
  const customFrom = document.getElementById("movementCustomFrom");
  const customTo = document.getElementById("movementCustomTo");
  const prevButton = document.getElementById("movementPrevPageBtn");
  const nextButton = document.getElementById("movementNextPageBtn");
  const sortDateButton = document.getElementById("movementSortDateBtn");
  const refreshButton = document.getElementById("refreshMovementsBtn");
  const toggleFiltersButton = document.getElementById("toggleMovementsFiltersBtn");
  const newMovementButton = document.getElementById("newMovementBtn");
  const exportCsvButton = document.getElementById("exportMovementCsvBtn");
  const clearFiltersButton = document.getElementById("clearMovementFiltersBtn");

  branchFilter?.addEventListener("change", (event) => {
    const nextBranchId = event.target.value;
    updateFilterAndRefresh("branchId", nextBranchId);

    if (state.movements.filters.locationId !== "all") {
      const locationStillValid = (state.movements.data?.locations || []).some(
        (location) =>
          Number(location.id) === Number(state.movements.filters.locationId) &&
          Number(location.branch_id) === Number(nextBranchId)
      );
      if (!locationStillValid) {
        updateFilterAndRefresh("locationId", "all");
      }
    }
  });

  locationFilter?.addEventListener("change", (event) => {
    updateFilterAndRefresh("locationId", event.target.value);
  });

  periodFilter?.addEventListener("change", (event) => {
    updateFilterAndRefresh("period", event.target.value);
  });

  typeFilter?.addEventListener("change", (event) => {
    updateFilterAndRefresh("type", event.target.value);
  });

  itemFilter?.addEventListener("input", (event) => {
    updateFilterAndRefresh("itemQuery", event.target.value);
  });

  userFilter?.addEventListener("change", (event) => {
    updateMovementsFilter("userId", event.target.value);
  });

  qtyMinFilter?.addEventListener("input", (event) => {
    updateMovementsFilter("qtyMin", event.target.value);
  });

  qtyMaxFilter?.addEventListener("input", (event) => {
    updateMovementsFilter("qtyMax", event.target.value);
  });

  reasonFilter?.addEventListener("change", (event) => {
    updateMovementsFilter("reason", event.target.value);
  });

  customFrom?.addEventListener("change", (event) => {
    updateMovementsFilter("period", "custom");
    updateFilterAndRefresh("customFrom", event.target.value);
  });

  customTo?.addEventListener("change", (event) => {
    updateMovementsFilter("period", "custom");
    updateFilterAndRefresh("customTo", event.target.value);
  });

  prevButton?.addEventListener("click", () => {
    setMovementsPage(view.pageInfo.page - 1);
  });

  nextButton?.addEventListener("click", () => {
    setMovementsPage(view.pageInfo.page + 1);
  });

  sortDateButton?.addEventListener("click", () => {
    const nextOrder = state.movements.sort.order === "desc" ? "asc" : "desc";
    setMovementsSort("occurred_at", nextOrder);
  });

  refreshButton?.addEventListener("click", () => {
    refreshMovementsData({ feedback: true });
  });

  toggleFiltersButton?.addEventListener("click", () => {
    toggleMovementsFiltersCollapsed();
  });

  newMovementButton?.addEventListener("click", () => {
    openNewMovementDrawer(view);
  });

  exportCsvButton?.addEventListener("click", () => {
    exportCurrentRowsToCsv(view);
  });

  clearFiltersButton?.addEventListener("click", () => {
    clearMovementsFilters();
    setMovementsFiltersCollapsed(false);
    showToast({
      title: I18N_PTBR.movements.title,
      message: I18N_PTBR.movements.toasts.filters_cleared,
      type: "success",
    });
    debouncedServerRefresh();
  });

  document.querySelectorAll("[data-remove-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-remove-filter");
      if (!key) return;
      resetSingleFilter(key);
    });
  });

  document.querySelectorAll("[data-move-detail-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const moveId = Number(button.getAttribute("data-move-detail-id"));
      const move = view.rows.find((row) => Number(row.id) === moveId);
      if (!move) return;
      openMovementDetails(move, view);
    });
  });

  const permissionRetryButton = document.getElementById("retryMovementsPermissionBtn");
  permissionRetryButton?.addEventListener("click", () => {
    refreshMovementsData({ feedback: true });
  });
}

export function renderMovements() {
  bindKeyboardShortcut();

  const pageContent = document.getElementById("pageContent");
  if (!pageContent) return;

  if (!state.movements.loaded && !state.movements.loading) {
    refreshMovementsData();
  }

  if (state.movements.loading || !state.movements.loaded) {
    pageContent.innerHTML = renderLoadingState();
    refreshIcons();
    applyReveal(pageContent);
    return;
  }

  if (state.movements.permissionDenied) {
    pageContent.innerHTML = renderPermissionState();
    refreshIcons();
    applyReveal(pageContent);
    bindEvents(buildView());
    return;
  }

  const view = buildView();
  pageContent.innerHTML = renderLoadedState(view);

  refreshIcons();
  applyReveal(pageContent);
  initTooltips(pageContent);
  bindEvents(view);
}
