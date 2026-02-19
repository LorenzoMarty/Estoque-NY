/*
  Bibliotecas via CDN usadas nesta pagina:
  - Chart.js: graficos de linha, barras e donut.
  - Luxon: datas, periodos e comparacoes temporais.
  - Tippy.js + Popper: tooltips ricos e acessiveis.
  - Lucide: icones SVG consistentes.

  Configuracao da API:
  - Ajuste `API_BASE_URL` em `frontend/js/api.js`.

  Endpoints consumidos:
  - GET `/reports/stock/valuation`
  - GET `/reports/stock/turnover`
  - GET `/reports/stock/abc`
  - GET `/reports/stock/movements`
  - GET `/branches`
  - GET `/locations` (opcional)
  - GET `/categories`, `/products`, `/skus` (opcionais para enriquecer filtros)

  Modo demonstracao:
  - Em falha da API, a pagina entra automaticamente em modo demo
    com dados simulados coerentes e banner discreto.
*/

import { loadReportsPayload } from "./api.js";
import { I18N_PTBR } from "./i18n.js";
import {
  clearReportsFilters,
  setReportsLoading,
  setReportsPayload,
  state,
  updateReportsFilter,
} from "./state.js";
import { renderReportsCharts, destroyReportsCharts } from "./reports_charts.js";
import { copyReportsSummary, exportReportsCsv, exportReportsPdf } from "./reports_export.js";
import { applyReveal, initTooltips, refreshIcons, showToast } from "./ui.js";
import {
  debounce,
  escapeHtml,
  formatDateTimePtBr,
  formatHourMinutePtBr,
  formatInt,
  resolvePeriodRange,
} from "./utils.js";

const { DateTime } = window.luxon;

const SERVER_FILTER_KEYS = new Set(["branchId", "period", "customFrom", "customTo"]);

let refreshSequence = 0;
let shortcutBound = false;

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(
    Number(value || 0)
  );
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function shortLabel(value, max = 24) {
  const text = compact(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
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

function mapPeriodLabel(period) {
  if (period === "today") return I18N_PTBR.reports.filters.period_today;
  if (period === "7") return I18N_PTBR.reports.filters.period_7;
  if (period === "30") return I18N_PTBR.reports.filters.period_30;
  if (period === "90") return I18N_PTBR.reports.filters.period_90;
  if (period === "custom") return I18N_PTBR.reports.filters.period_custom;
  return period;
}

function isEntryType(moveType) {
  return ["RECEIPT", "TRANSFER_RECEIVE"].includes(String(moveType || "").toUpperCase());
}

function isIssueType(moveType) {
  return ["ISSUE", "TRANSFER_SHIP"].includes(String(moveType || "").toUpperCase());
}

function isAdjustmentType(moveType) {
  return String(moveType || "").toUpperCase() === "ADJUSTMENT";
}

function getTurnoverClass(turnover) {
  const current = Number(turnover || 0);
  if (current >= 3) return "high";
  if (current >= 1.2) return "medium";
  return "low";
}

function turnoverClassLabel(classKey) {
  if (classKey === "high") return I18N_PTBR.reports.turnover_class.high;
  if (classKey === "medium") return I18N_PTBR.reports.turnover_class.medium;
  return I18N_PTBR.reports.turnover_class.low;
}

function getMaps(data) {
  const branchById = new Map((data?.branches || []).map((branch) => [Number(branch.id), branch]));
  const locationById = new Map(
    (data?.locations || []).map((location) => [Number(location.id), location])
  );
  const itemById = new Map((data?.items || []).map((item) => [Number(item.id), item]));
  const categoryById = new Map(
    (data?.categories || []).map((category) => [Number(category.id), category])
  );
  return {
    branchById,
    locationById,
    itemById,
    categoryById,
  };
}

function buildActiveChips(view) {
  const filters = state.reports.filters;
  const chips = [];

  if (filters.branchId !== "all") {
    chips.push({
      key: "branchId",
      label: `${I18N_PTBR.reports.chips.branch}: ${
        view.maps.branchById.get(Number(filters.branchId))?.name || filters.branchId
      }`,
    });
  }

  if (filters.period !== "30") {
    chips.push({
      key: "period",
      label: `${I18N_PTBR.reports.chips.period}: ${mapPeriodLabel(filters.period)}`,
    });
  }

  if (filters.period === "custom") {
    chips.push({
      key: "customRange",
      label: `${I18N_PTBR.reports.chips.custom_range}: ${filters.customFrom} -> ${filters.customTo}`,
    });
  }

  if (filters.categoryId !== "all") {
    chips.push({
      key: "categoryId",
      label: `${I18N_PTBR.reports.chips.category}: ${
        view.maps.categoryById.get(Number(filters.categoryId))?.name || filters.categoryId
      }`,
    });
  }

  if (filters.productId !== "all") {
    chips.push({
      key: "productId",
      label: `${I18N_PTBR.reports.chips.product}: ${
        view.maps.itemById.get(Number(filters.productId))?.name || filters.productId
      }`,
    });
  }

  return chips;
}

function renderChipList(chips) {
  if (!chips.length) {
    return `<small class="chips-empty">${I18N_PTBR.reports.defaults.empty_chips}</small>`;
  }

  return chips
    .map(
      (chip) => `
        <button class="filter-chip" data-remove-report-filter="${escapeHtml(chip.key)}" aria-label="${
        I18N_PTBR.reports.actions.clear_chip
      }">
          <span>${escapeHtml(chip.label)}</span>
          <i data-lucide="x"></i>
        </button>
      `
    )
    .join("");
}

function buildView() {
  const data = state.reports.data;
  const filters = state.reports.filters;
  const periodRange = resolveReportsPeriodRange(filters);

  if (!data) {
    return {
      maps: {
        branchById: new Map(),
        locationById: new Map(),
        itemById: new Map(),
        categoryById: new Map(),
      },
      branchOptions: [],
      categoryOptions: [],
      productOptions: [],
      chips: [],
      kpis: {
        stockValue: 0,
        storedItems: 0,
        lowStockCount: 0,
        stockoutCount: 0,
        avgTurnover: 0,
      },
      turnoverRows: [],
      abcRows: [],
      criticalAdjustments: [],
      adjustmentCount: 0,
      mostCommonReason: "-",
      charts: {
        flow: { labels: [], entries: [], exits: [] },
        branch: { labels: [], values: [] },
        topOutput: { labels: [], values: [] },
        turnover: { labels: [], values: [], colors: [] },
        abc: { labels: [], values: [], cumulative: [] },
        divergence: { labels: [], values: [] },
      },
      periodRange,
      resultCount: 0,
      filtersLabel: I18N_PTBR.reports.defaults.standard,
    };
  }

  const maps = getMaps(data);
  const branchFilter = String(filters.branchId || "all");
  const categoryFilter = String(filters.categoryId || "all");
  const productFilter = String(filters.productId || "all");

  const branchOptions = data.branches || [];
  const categoryOptions = data.categories || [];
  const productOptions = (data.items || [])
    .filter((item) => {
      if (categoryFilter === "all") return true;
      return String(item.category_id) === categoryFilter;
    })
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "pt-BR"));

  const selectedProductStillAvailable =
    productFilter === "all" ||
    productOptions.some((item) => String(item.id) === String(productFilter));
  const effectiveProductFilter = selectedProductStillAvailable ? productFilter : "all";

  function acceptsBranch(branchId) {
    if (branchFilter === "all") return true;
    return Number(branchId) === Number(branchFilter);
  }

  function acceptsItem(skuId) {
    const item = maps.itemById.get(Number(skuId));
    if (!item) return false;
    if (categoryFilter !== "all" && String(item.category_id) !== String(categoryFilter)) {
      return false;
    }
    if (effectiveProductFilter !== "all" && String(item.id) !== String(effectiveProductFilter)) {
      return false;
    }
    return true;
  }

  function inPeriod(isoDate) {
    const parsed = DateTime.fromISO(String(isoDate || ""));
    return parsed.isValid && parsed >= periodRange.from && parsed <= periodRange.to;
  }

  const valuationRows = (data.valuation_rows || []).filter(
    (row) => acceptsBranch(row.branch_id) && acceptsItem(row.sku_id)
  );

  const scopedMovements = (data.movement_rows || []).filter(
    (row) => acceptsBranch(row.branch_id) && acceptsItem(row.sku_id)
  );
  const movementRowsPeriod = scopedMovements.filter((row) => inPeriod(row.occurred_at));

  const stockBySku = new Map();
  const valuationByBranch = new Map();
  valuationRows.forEach((row) => {
    const skuId = Number(row.sku_id || 0);
    const current = stockBySku.get(skuId) || {
      sku_id: skuId,
      on_hand: 0,
      valuation: 0,
    };
    current.on_hand += Number(row.on_hand || 0);
    current.valuation += Number(row.valuation || 0);
    stockBySku.set(skuId, current);

    const branchId = Number(row.branch_id || 0);
    valuationByBranch.set(
      branchId,
      (valuationByBranch.get(branchId) || 0) + Number(row.valuation || 0)
    );
  });

  let stockValue = 0;
  let storedItems = 0;
  let lowStockCount = 0;
  let stockoutCount = 0;
  stockBySku.forEach((row, skuId) => {
    stockValue += Number(row.valuation || 0);
    storedItems += Number(row.on_hand || 0);
    const reorderPoint = Number(maps.itemById.get(Number(skuId))?.reorder_point || 12);
    if (Number(row.on_hand || 0) <= 0) {
      stockoutCount += 1;
      return;
    }
    if (Number(row.on_hand || 0) <= reorderPoint) {
      lowStockCount += 1;
    }
  });

  const issueRowsPeriod = movementRowsPeriod.filter((row) => isIssueType(row.move_type));
  const issueRowsAll = scopedMovements.filter((row) => isIssueType(row.move_type));

  const flowEntriesByDay = new Map();
  const flowExitsByDay = new Map();
  let dayCursor = periodRange.from.startOf("day");
  while (dayCursor <= periodRange.to.endOf("day")) {
    const key = dayCursor.toISODate();
    flowEntriesByDay.set(key, 0);
    flowExitsByDay.set(key, 0);
    dayCursor = dayCursor.plus({ days: 1 });
  }

  movementRowsPeriod.forEach((row) => {
    const key = DateTime.fromISO(String(row.occurred_at || "")).toISODate();
    if (!key || !flowEntriesByDay.has(key)) return;
    if (isEntryType(row.move_type)) {
      flowEntriesByDay.set(key, (flowEntriesByDay.get(key) || 0) + Math.abs(Number(row.qty || 0)));
      return;
    }
    if (isIssueType(row.move_type)) {
      flowExitsByDay.set(key, (flowExitsByDay.get(key) || 0) + Math.abs(Number(row.qty || 0)));
    }
  });

  const flowLabelsIso = Array.from(flowEntriesByDay.keys());
  const flowLabels = flowLabelsIso.map((iso) =>
    DateTime.fromISO(iso).setLocale("pt-BR").toFormat("dd/LL")
  );
  const flowEntries = flowLabelsIso.map((iso) => flowEntriesByDay.get(iso) || 0);
  const flowExits = flowLabelsIso.map((iso) => flowExitsByDay.get(iso) || 0);

  const outputBySku = new Map();
  issueRowsPeriod.forEach((row) => {
    const skuId = Number(row.sku_id || 0);
    outputBySku.set(skuId, (outputBySku.get(skuId) || 0) + Math.abs(Number(row.qty || 0)));
  });
  const topOutput = Array.from(outputBySku.entries())
    .map(([skuId, qty]) => ({
      sku_id: Number(skuId),
      qty: Number(qty),
      item_name:
        maps.itemById.get(Number(skuId))?.name ||
        `${I18N_PTBR.reports.defaults.variation_fallback} ${skuId}`,
    }))
    .sort((left, right) => right.qty - left.qty)
    .slice(0, 10);

  const issuedBySku = new Map();
  issueRowsPeriod.forEach((row) => {
    const skuId = Number(row.sku_id || 0);
    issuedBySku.set(skuId, (issuedBySku.get(skuId) || 0) + Math.abs(Number(row.qty || 0)));
  });

  const lastIssueBySku = new Map();
  issueRowsAll.forEach((row) => {
    const skuId = Number(row.sku_id || 0);
    const current = lastIssueBySku.get(skuId);
    const occurredAt = String(row.occurred_at || "");
    if (!current || occurredAt > current) {
      lastIssueBySku.set(skuId, occurredAt);
    }
  });

  const turnoverSkuIds = new Set([...stockBySku.keys(), ...issuedBySku.keys()]);
  const turnoverRows = Array.from(turnoverSkuIds)
    .map((skuId) => {
      const item = maps.itemById.get(Number(skuId));
      if (!item) return null;

      const issuedQty = Number(issuedBySku.get(Number(skuId)) || 0);
      const avgStock = Math.max(0, Number(stockBySku.get(Number(skuId))?.on_hand || 0));
      const turnover = avgStock > 0 ? issuedQty / avgStock : issuedQty > 0 ? issuedQty : 0;
      const lastIssueIso = lastIssueBySku.get(Number(skuId));
      const daysInStock = lastIssueIso
        ? Math.max(0, Math.floor(DateTime.now().diff(DateTime.fromISO(lastIssueIso), "days").days))
        : 999;
      const turnoverClass = getTurnoverClass(turnover);

      return {
        sku_id: Number(skuId),
        item_name: item.name || `${I18N_PTBR.reports.defaults.variation_fallback} ${skuId}`,
        item_code: item.sku_code || `VAR-${String(skuId).padStart(5, "0")}`,
        issued_qty: issuedQty,
        avg_stock: avgStock,
        turnover: Number(turnover.toFixed(4)),
        days_in_stock: daysInStock,
        turnover_class: turnoverClass,
        stale: daysInStock > 45,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.issued_qty !== left.issued_qty) return right.issued_qty - left.issued_qty;
      if (right.turnover !== left.turnover) return right.turnover - left.turnover;
      return right.days_in_stock - left.days_in_stock;
    });

  const turnoverForAverage = turnoverRows.filter((row) => row.issued_qty > 0);
  const avgTurnover =
    turnoverForAverage.length > 0
      ? turnoverForAverage.reduce((acc, row) => acc + Number(row.turnover || 0), 0) /
        turnoverForAverage.length
      : 0;

  const abcValueBySku = new Map();
  issueRowsPeriod.forEach((row) => {
    const item = maps.itemById.get(Number(row.sku_id || 0));
    const unitCost = Number(item?.cost || 0);
    const movementValue = Math.abs(Number(row.qty || 0)) * unitCost;
    abcValueBySku.set(
      Number(row.sku_id || 0),
      (abcValueBySku.get(Number(row.sku_id || 0)) || 0) + movementValue
    );
  });

  const sortedAbc = Array.from(abcValueBySku.entries())
    .map(([skuId, movementValue]) => ({
      sku_id: Number(skuId),
      movement_value: Number(movementValue.toFixed(2)),
      item_name:
        maps.itemById.get(Number(skuId))?.name ||
        `${I18N_PTBR.reports.defaults.variation_fallback} ${skuId}`,
    }))
    .sort((left, right) => right.movement_value - left.movement_value);
  const totalAbcValue = sortedAbc.reduce((acc, row) => acc + Number(row.movement_value || 0), 0);
  let cumulative = 0;
  const abcRows = sortedAbc.map((row) => {
    const share = totalAbcValue > 0 ? (Number(row.movement_value || 0) / totalAbcValue) * 100 : 0;
    cumulative += share;
    const className = cumulative <= 80 ? "A" : cumulative <= 95 ? "B" : "C";
    return {
      ...row,
      share_percent: Number(share.toFixed(2)),
      cumulative_percent: Number(cumulative.toFixed(2)),
      class_name: className,
    };
  });

  const adjustmentRows = movementRowsPeriod.filter((row) => isAdjustmentType(row.move_type));
  const adjustmentCount = adjustmentRows.length;
  const reasonFrequency = new Map();
  adjustmentRows.forEach((row) => {
    const reason = compact(row.reason) || I18N_PTBR.reports.defaults.no_reason;
    reasonFrequency.set(reason, (reasonFrequency.get(reason) || 0) + 1);
  });
  const mostCommonReason =
    Array.from(reasonFrequency.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || "-";

  const divergenceByDay = new Map();
  let divergenceCursor = periodRange.from.startOf("day");
  while (divergenceCursor <= periodRange.to.endOf("day")) {
    divergenceByDay.set(divergenceCursor.toISODate(), 0);
    divergenceCursor = divergenceCursor.plus({ days: 1 });
  }
  adjustmentRows.forEach((row) => {
    const key = DateTime.fromISO(String(row.occurred_at || "")).toISODate();
    if (!key || !divergenceByDay.has(key)) return;
    divergenceByDay.set(key, (divergenceByDay.get(key) || 0) + 1);
  });

  const adjustmentAbs = adjustmentRows.map((row) => Math.abs(Number(row.qty || 0))).sort((a, b) => a - b);
  const percentileIndex = adjustmentAbs.length ? Math.floor(adjustmentAbs.length * 0.85) : 0;
  const criticalThreshold = Math.max(10, Number(adjustmentAbs[percentileIndex] || 0));
  const criticalAdjustments = adjustmentRows
    .filter((row) => Math.abs(Number(row.qty || 0)) >= criticalThreshold)
    .sort((left, right) => {
      const qtyDiff = Math.abs(Number(right.qty || 0)) - Math.abs(Number(left.qty || 0));
      if (qtyDiff !== 0) return qtyDiff;
      return String(right.occurred_at || "").localeCompare(String(left.occurred_at || ""));
    })
    .slice(0, 12)
    .map((row) => {
      const branchName = maps.branchById.get(Number(row.branch_id))?.name || "-";
      const itemName =
        maps.itemById.get(Number(row.sku_id))?.name ||
        `${I18N_PTBR.reports.defaults.variation_fallback} ${row.sku_id}`;
      const signed = Number(row.qty || 0);
      const qtyLabel = `${signed > 0 ? "+" : ""}${formatInt(signed)}`;
      return {
        ...row,
        branch_name: branchName,
        item_name: itemName,
        qty_label: qtyLabel,
      };
    });

  const chips = buildActiveChips({ maps });
  const filtersLabel = chips.length
    ? chips.map((chip) => chip.label).join(" | ")
    : I18N_PTBR.reports.defaults.standard;

  return {
    maps,
    branchOptions,
    categoryOptions,
    productOptions,
    chips,
    periodRange,
    resultCount: turnoverRows.length,
    filtersLabel,
    kpis: {
      stockValue,
      storedItems,
      lowStockCount,
      stockoutCount,
      avgTurnover,
    },
    turnoverRows,
    abcRows,
    criticalAdjustments,
    adjustmentCount,
    mostCommonReason,
    charts: {
      flow: {
        labels: flowLabels,
        entries: flowEntries,
        exits: flowExits,
      },
      branch: {
        labels: Array.from(valuationByBranch.keys()).map(
          (branchId) => maps.branchById.get(Number(branchId))?.name || `Filial ${branchId}`
        ),
        values: Array.from(valuationByBranch.values()).map((value) => Number(value.toFixed(2))),
      },
      topOutput: {
        labels: topOutput.map((row) => shortLabel(row.item_name, 20)),
        values: topOutput.map((row) => Number(row.qty || 0)),
      },
      turnover: {
        labels: turnoverRows.slice(0, 15).map((row) => shortLabel(row.item_name, 24)),
        values: turnoverRows.slice(0, 15).map((row) => Number(row.turnover || 0)),
        colors: turnoverRows.slice(0, 15).map((row) =>
          row.turnover_class === "high"
            ? "rgba(34, 197, 94, 0.72)"
            : row.turnover_class === "medium"
            ? "rgba(245, 158, 11, 0.72)"
            : "rgba(239, 68, 68, 0.72)"
        ),
      },
      abc: {
        labels: abcRows.slice(0, 14).map((row) => shortLabel(row.item_name, 20)),
        values: abcRows.slice(0, 14).map((row) => Number(row.movement_value || 0)),
        cumulative: abcRows.slice(0, 14).map((row) => Number(row.cumulative_percent || 0)),
      },
      divergence: {
        labels: Array.from(divergenceByDay.keys()).map((iso) =>
          DateTime.fromISO(iso).setLocale("pt-BR").toFormat("dd/LL")
        ),
        values: Array.from(divergenceByDay.values()),
      },
    },
  };
}

function renderChartOrEmpty({ chartId, ariaLabel, hasData, emptyLabel }) {
  if (!hasData) {
    return `
      <div class="empty-state reports-empty-chart">
        <i data-lucide="chart-no-axes-column"></i>
        <span>${escapeHtml(emptyLabel)}</span>
      </div>
    `;
  }

  return `
    <div class="chart-canvas-wrap">
      <canvas id="${chartId}" aria-label="${escapeHtml(ariaLabel)}"></canvas>
    </div>
  `;
}

function renderTurnoverRows(view) {
  if (!view.turnoverRows.length) {
    return `
      <tr>
        <td colspan="4">
          <div class="empty-state">
            <i data-lucide="inbox"></i>
            <span>${I18N_PTBR.reports.tables.turnover.empty}</span>
          </div>
        </td>
      </tr>
    `;
  }

  return view.turnoverRows
    .slice(0, 28)
    .map((row) => {
      const classLabel = turnoverClassLabel(row.turnover_class);
      return `
        <tr class="${row.stale ? "reports-stale-row" : ""}">
          <td>
            <div class="item-stack">
              <strong>${escapeHtml(row.item_name)}</strong>
              <small>${escapeHtml(row.item_code)}</small>
            </div>
          </td>
          <td>${formatInt(row.issued_qty)}</td>
          <td>${formatInt(row.days_in_stock)}</td>
          <td>
            <span class="reports-turnover-pill ${escapeHtml(`is-${row.turnover_class}`)}">${escapeHtml(
        classLabel
      )}</span>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderAbcRows(view) {
  if (!view.abcRows.length) {
    return `
      <tr>
        <td colspan="3">
          <div class="empty-state">
            <i data-lucide="inbox"></i>
            <span>${I18N_PTBR.reports.tables.abc.empty}</span>
          </div>
        </td>
      </tr>
    `;
  }

  return view.abcRows
    .slice(0, 28)
    .map((row) => {
      return `
        <tr>
          <td>${escapeHtml(row.item_name)}</td>
          <td>${formatPercent(row.share_percent)}</td>
          <td><span class="reports-abc-pill is-${escapeHtml(row.class_name.toLowerCase())}">${escapeHtml(
        row.class_name
      )}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderAdjustmentRows(view) {
  if (!view.criticalAdjustments.length) {
    return `
      <tr>
        <td colspan="5">
          <div class="empty-state">
            <i data-lucide="inbox"></i>
            <span>${I18N_PTBR.reports.tables.adjustments.empty}</span>
          </div>
        </td>
      </tr>
    `;
  }

  return view.criticalAdjustments
    .map((row) => `
      <tr>
        <td>${formatDateTimePtBr(row.occurred_at)}</td>
        <td>${escapeHtml(row.item_name)}</td>
        <td>${escapeHtml(row.branch_name)}</td>
        <td>${escapeHtml(row.reason || "-")}</td>
        <td class="${Number(row.qty || 0) >= 0 ? "qty-pos" : "qty-neg"}">${escapeHtml(row.qty_label)}</td>
      </tr>
    `)
    .join("");
}

function renderLoadingState() {
  return `
    <section class="panel pad reveal">
      <div class="page-head">
        <div>
          <div class="skeleton line" style="width: 180px;"></div>
          <div class="skeleton line" style="width: 420px; margin-top: 8px;"></div>
        </div>
        <div style="display:flex; gap:8px;">
          <div class="skeleton block" style="width: 120px; height: 42px;"></div>
          <div class="skeleton block" style="width: 120px; height: 42px;"></div>
          <div class="skeleton block" style="width: 120px; height: 42px;"></div>
        </div>
      </div>
      <div class="skeleton block" style="margin-top: 14px; height: 170px;"></div>
    </section>

    <section class="reports-kpi-grid">
      ${new Array(5)
        .fill("<article class='mini-kpi-card'><div class='skeleton block' style='height:102px;'></div></article>")
        .join("")}
    </section>

    <section class="panel chart-card reveal">
      <div class="skeleton line" style="width: 260px;"></div>
      <div class="skeleton block" style="height: 280px; margin-top: 10px;"></div>
    </section>
  `;
}

function renderLoadedState(view) {
  const data = state.reports.data;
  const filters = state.reports.filters;
  const customDisabled = filters.period !== "custom";

  const branchOptionsMarkup = [
    `<option value="all">${I18N_PTBR.reports.filters.branch_all}</option>`,
    ...view.branchOptions.map(
      (branch) =>
        `<option value="${branch.id}" ${
          String(filters.branchId) === String(branch.id) ? "selected" : ""
        }>${escapeHtml(branch.name)}</option>`
    ),
  ].join("");

  const categoryOptionsMarkup = [
    `<option value="all">${I18N_PTBR.reports.filters.category_all}</option>`,
    ...view.categoryOptions.map(
      (category) =>
        `<option value="${category.id}" ${
          String(filters.categoryId) === String(category.id) ? "selected" : ""
        }>${escapeHtml(category.name)}</option>`
    ),
  ].join("");

  const productOptionsMarkup = [
    `<option value="all">${I18N_PTBR.reports.filters.product_all}</option>`,
    ...view.productOptions.map(
      (item) =>
        `<option value="${item.id}" ${
          String(filters.productId) === String(item.id) ? "selected" : ""
        }>${escapeHtml(
          item.name ||
            item.sku_code ||
            `${I18N_PTBR.reports.defaults.variation_fallback} ${item.id}`
        )}</option>`
    ),
  ].join("");

  const hasFlowData = view.charts.flow.labels.length > 0;
  const hasBranchData = view.charts.branch.labels.length > 0;
  const hasTopOutputData = view.charts.topOutput.labels.length > 0;
  const hasTurnoverData = view.charts.turnover.labels.length > 0;
  const hasAbcData = view.charts.abc.labels.length > 0;
  const hasDivergenceData = view.charts.divergence.labels.length > 0;

  return `
    <section class="panel pad reveal reports-filter-shell">
      ${
        state.reports.showDemoBanner
          ? `<div class="banner"><i data-lucide="flask-conical"></i>${I18N_PTBR.mode_demo_banner}</div>`
          : ""
      }
      <div class="page-head" style="margin-top:${state.reports.showDemoBanner ? "12px" : "0"};">
        <div>
          <div class="breadcrumbs">${I18N_PTBR.reports.breadcrumb}</div>
          <h1>${I18N_PTBR.reports.title}</h1>
          <p class="section-subtitle">${I18N_PTBR.reports.subtitle}</p>
        </div>
      </div>

      <div class="reports-sticky-toolbar">
        <div class="movements-filter-grid reports-filter-grid">
          <div class="field">
            <label for="reportsBranchFilter">${I18N_PTBR.reports.filters.branch}</label>
            <select id="reportsBranchFilter">${branchOptionsMarkup}</select>
          </div>

          <div class="field">
            <label for="reportsPeriodFilter">${I18N_PTBR.reports.filters.period}</label>
            <select id="reportsPeriodFilter">
              <option value="today" ${filters.period === "today" ? "selected" : ""}>${
                I18N_PTBR.reports.filters.period_today
              }</option>
              <option value="7" ${filters.period === "7" ? "selected" : ""}>${
                I18N_PTBR.reports.filters.period_7
              }</option>
              <option value="30" ${filters.period === "30" ? "selected" : ""}>${
                I18N_PTBR.reports.filters.period_30
              }</option>
              <option value="90" ${filters.period === "90" ? "selected" : ""}>${
                I18N_PTBR.reports.filters.period_90
              }</option>
              <option value="custom" ${filters.period === "custom" ? "selected" : ""}>${
                I18N_PTBR.reports.filters.period_custom
              }</option>
            </select>
          </div>

          <div class="field">
            <label for="reportsCategoryFilter">${I18N_PTBR.reports.filters.category}</label>
            <select id="reportsCategoryFilter">${categoryOptionsMarkup}</select>
          </div>

          <div class="field">
            <label for="reportsProductFilter">${I18N_PTBR.reports.filters.product}</label>
            <select id="reportsProductFilter">${productOptionsMarkup}</select>
          </div>

          <div class="field">
            <label for="reportsCustomFrom">${I18N_PTBR.reports.filters.custom_from}</label>
            <input id="reportsCustomFrom" type="date" value="${filters.customFrom}" ${
    customDisabled ? "disabled" : ""
  } />
          </div>

          <div class="field">
            <label for="reportsCustomTo">${I18N_PTBR.reports.filters.custom_to}</label>
            <input id="reportsCustomTo" type="date" value="${filters.customTo}" ${
    customDisabled ? "disabled" : ""
  } />
          </div>
        </div>

        <div class="reports-filter-actions">
          <button class="btn primary" id="refreshReportsBtn"><i data-lucide="refresh-cw"></i>${
            I18N_PTBR.reports.actions.refresh
          }</button>
          <button class="btn" id="exportReportsCsvBtn"><i data-lucide="download"></i>${
            I18N_PTBR.reports.actions.export_csv
          }</button>
          <button class="btn" id="exportReportsPdfBtn"><i data-lucide="file-text"></i>${
            I18N_PTBR.reports.actions.export_pdf
          }</button>
          <button class="btn ghost" id="clearReportsFiltersBtn"><i data-lucide="eraser"></i>${
            I18N_PTBR.reports.actions.clear_filters
          }</button>
          <small>${I18N_PTBR.last_update}: <strong>${formatHourMinutePtBr(
    state.reports.lastUpdatedIso || data.generated_at
  )}</strong></small>
        </div>
      </div>

      <div class="reports-filter-meta">
        <small>${formatInt(view.resultCount)} ${I18N_PTBR.reports.filters.results}</small>
      </div>

      <div class="filter-chip-list">
        ${renderChipList(view.chips)}
      </div>
    </section>

    <section class="panel pad reveal">
      <div class="table-head">
        <div>
          <h2 class="section-title">${I18N_PTBR.reports.sections.overview.title}</h2>
          <p class="section-subtitle">${I18N_PTBR.reports.sections.overview.subtitle}</p>
        </div>
      </div>

      <div class="reports-kpi-grid">
        <article class="mini-kpi-card border-gradient">
          <div class="mini-kpi-head">
            <i data-lucide="wallet"></i>
            <button class="kpi-help" data-tippy-content="${
              I18N_PTBR.reports.kpis.stock_value.tooltip
            }" aria-label="Ajuda valor total"><i data-lucide="circle-help"></i></button>
          </div>
          <p>${I18N_PTBR.reports.kpis.stock_value.label}</p>
          <strong>${formatCurrency(view.kpis.stockValue)}</strong>
        </article>

        <article class="mini-kpi-card border-gradient">
          <div class="mini-kpi-head">
            <i data-lucide="boxes"></i>
            <button class="kpi-help" data-tippy-content="${
              I18N_PTBR.reports.kpis.stored_items.tooltip
            }" aria-label="Ajuda itens armazenados"><i data-lucide="circle-help"></i></button>
          </div>
          <p>${I18N_PTBR.reports.kpis.stored_items.label}</p>
          <strong>${formatInt(view.kpis.storedItems)}</strong>
        </article>

        <article class="mini-kpi-card border-gradient">
          <div class="mini-kpi-head">
            <i data-lucide="triangle-alert"></i>
            <button class="kpi-help" data-tippy-content="${
              I18N_PTBR.reports.kpis.low_stock.tooltip
            }" aria-label="Ajuda baixo estoque"><i data-lucide="circle-help"></i></button>
          </div>
          <p>${I18N_PTBR.reports.kpis.low_stock.label}</p>
          <strong>${formatInt(view.kpis.lowStockCount)}</strong>
        </article>

        <article class="mini-kpi-card border-gradient">
          <div class="mini-kpi-head">
            <i data-lucide="x-octagon"></i>
            <button class="kpi-help" data-tippy-content="${
              I18N_PTBR.reports.kpis.stockout.tooltip
            }" aria-label="Ajuda rupturas"><i data-lucide="circle-help"></i></button>
          </div>
          <p>${I18N_PTBR.reports.kpis.stockout.label}</p>
          <strong>${formatInt(view.kpis.stockoutCount)}</strong>
        </article>

        <article class="mini-kpi-card border-gradient">
          <div class="mini-kpi-head">
            <i data-lucide="gauge"></i>
            <button class="kpi-help" data-tippy-content="${
              I18N_PTBR.reports.kpis.avg_turnover.tooltip
            }" aria-label="Ajuda giro medio"><i data-lucide="circle-help"></i></button>
          </div>
          <p>${I18N_PTBR.reports.kpis.avg_turnover.label}</p>
          <strong>${Number(view.kpis.avgTurnover || 0).toFixed(2)}</strong>
        </article>
      </div>

      <div class="reports-overview-layout">
        <article class="panel chart-card border-gradient">
          <div class="chart-header">
            <div>
              <h3 class="section-title">${I18N_PTBR.reports.sections.overview.line}</h3>
              <p class="section-subtitle">${view.periodRange.from.toFormat("dd/LL/yyyy")} ate ${view.periodRange.to.toFormat(
    "dd/LL/yyyy"
  )}</p>
            </div>
          </div>
          ${renderChartOrEmpty({
            chartId: "reportsFlowChart",
            ariaLabel: I18N_PTBR.reports.chart.aria_flow,
            hasData: hasFlowData,
            emptyLabel: I18N_PTBR.reports.chart.empty_flow,
          })}
        </article>

        <article class="panel chart-card border-gradient">
          <div class="chart-header">
            <div>
              <h3 class="section-title">${I18N_PTBR.reports.sections.overview.donut}</h3>
            </div>
          </div>
          ${renderChartOrEmpty({
            chartId: "reportsBranchChart",
            ariaLabel: I18N_PTBR.reports.chart.aria_branch,
            hasData: hasBranchData,
            emptyLabel: I18N_PTBR.reports.chart.empty_branch,
          })}
        </article>

        <article class="panel chart-card border-gradient">
          <div class="chart-header">
            <div>
              <h3 class="section-title">${I18N_PTBR.reports.sections.overview.top_output}</h3>
            </div>
          </div>
          ${renderChartOrEmpty({
            chartId: "reportsTopOutputChart",
            ariaLabel: I18N_PTBR.reports.chart.aria_top_output,
            hasData: hasTopOutputData,
            emptyLabel: I18N_PTBR.reports.chart.empty_top_output,
          })}
        </article>
      </div>
    </section>

    <section class="panel pad reveal">
      <div class="table-head">
        <div>
          <h2 class="section-title">${I18N_PTBR.reports.sections.turnover.title}</h2>
          <p class="section-subtitle">${I18N_PTBR.reports.sections.turnover.subtitle}</p>
        </div>
      </div>

      <div class="reports-two-col">
        <article class="panel chart-card border-gradient">
          <div class="chart-header">
            <h3 class="section-title">${I18N_PTBR.reports.sections.turnover.chart}</h3>
          </div>
          ${renderChartOrEmpty({
            chartId: "reportsTurnoverChart",
            ariaLabel: I18N_PTBR.reports.chart.aria_turnover,
            hasData: hasTurnoverData,
            emptyLabel: I18N_PTBR.reports.tables.turnover.empty,
          })}
        </article>

        <article class="panel table-card border-gradient">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>${I18N_PTBR.reports.tables.turnover.product}</th>
                  <th>${I18N_PTBR.reports.tables.turnover.issued_qty}</th>
                  <th>${I18N_PTBR.reports.tables.turnover.days_in_stock}</th>
                  <th>${I18N_PTBR.reports.tables.turnover.turnover_class}</th>
                </tr>
              </thead>
              <tbody>
                ${renderTurnoverRows(view)}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>

    <section class="panel pad reveal">
      <div class="table-head">
        <div>
          <h2 class="section-title">${I18N_PTBR.reports.sections.abc.title}</h2>
          <p class="section-subtitle">${I18N_PTBR.reports.sections.abc.subtitle}</p>
        </div>
      </div>

      <div class="reports-two-col">
        <article class="panel chart-card border-gradient">
          <div class="chart-header">
            <h3 class="section-title">${I18N_PTBR.reports.sections.abc.chart}</h3>
          </div>
          ${renderChartOrEmpty({
            chartId: "reportsAbcChart",
            ariaLabel: I18N_PTBR.reports.chart.aria_abc,
            hasData: hasAbcData,
            emptyLabel: I18N_PTBR.reports.tables.abc.empty,
          })}
        </article>

        <article class="panel table-card border-gradient">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>${I18N_PTBR.reports.tables.abc.product}</th>
                  <th>${I18N_PTBR.reports.tables.abc.share}</th>
                  <th>${I18N_PTBR.reports.tables.abc.class_name}</th>
                </tr>
              </thead>
              <tbody>
                ${renderAbcRows(view)}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>

    <section class="panel pad reveal">
      <div class="table-head">
        <div>
          <h2 class="section-title">${I18N_PTBR.reports.sections.divergence.title}</h2>
          <p class="section-subtitle">${I18N_PTBR.reports.sections.divergence.subtitle}</p>
        </div>
      </div>

      <div class="reports-divergence-kpis">
        <article class="mini-kpi-card border-gradient">
          <p>${I18N_PTBR.reports.sections.divergence.total_adjustments}</p>
          <strong>${formatInt(view.adjustmentCount)}</strong>
        </article>
        <article class="mini-kpi-card border-gradient">
          <p>${I18N_PTBR.reports.sections.divergence.common_reason}</p>
          <strong>${escapeHtml(view.mostCommonReason || "-")}</strong>
        </article>
        <article class="mini-kpi-card border-gradient">
          <p>${I18N_PTBR.reports.sections.divergence.critical_adjustments}</p>
          <strong>${formatInt(view.criticalAdjustments.length)}</strong>
        </article>
      </div>

      <div class="reports-two-col">
        <article class="panel chart-card border-gradient">
          <div class="chart-header">
            <h3 class="section-title">${I18N_PTBR.reports.sections.divergence.trend}</h3>
          </div>
          ${renderChartOrEmpty({
            chartId: "reportsDivergenceChart",
            ariaLabel: I18N_PTBR.reports.chart.aria_divergence,
            hasData: hasDivergenceData,
            emptyLabel: I18N_PTBR.reports.chart.empty_divergence,
          })}
        </article>

        <article class="panel table-card border-gradient">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>${I18N_PTBR.reports.tables.adjustments.date}</th>
                  <th>${I18N_PTBR.reports.tables.adjustments.product}</th>
                  <th>${I18N_PTBR.reports.tables.adjustments.branch}</th>
                  <th>${I18N_PTBR.reports.tables.adjustments.reason}</th>
                  <th>${I18N_PTBR.reports.tables.adjustments.qty}</th>
                </tr>
              </thead>
              <tbody>
                ${renderAdjustmentRows(view)}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>

    <section class="panel pad reveal">
      <div class="table-head">
        <div>
          <h2 class="section-title">${I18N_PTBR.reports.sections.exports.title}</h2>
          <p class="section-subtitle">${I18N_PTBR.reports.sections.exports.subtitle}</p>
        </div>
      </div>

      <div class="reports-export-actions">
        <button class="btn primary" id="reportsExportFullCsvBtn"><i data-lucide="download"></i>${
          I18N_PTBR.reports.actions.export_full_csv
        }</button>
        <button class="btn" id="reportsExportManagerPdfBtn"><i data-lucide="file-text"></i>${
          I18N_PTBR.reports.actions.export_exec_pdf
        }</button>
        <button class="btn ghost" id="reportsCopySummaryBtn"><i data-lucide="copy"></i>${
          I18N_PTBR.reports.actions.copy_summary
        }</button>
      </div>

      <div class="drawer-grid reports-export-meta">
        <div>
          <small>${I18N_PTBR.reports.sections.exports.generated_at}</small>
          <strong>${formatDateTimePtBr(state.reports.lastUpdatedIso || data.generated_at)}</strong>
        </div>
        <div>
          <small>${I18N_PTBR.reports.sections.exports.applied_filters}</small>
          <strong>${escapeHtml(view.filtersLabel)}</strong>
        </div>
      </div>
    </section>
  `;
}

function resetSingleFilter(filterKey) {
  if (filterKey === "branchId") {
    updateReportsFilter("branchId", "all");
    return;
  }
  if (filterKey === "period") {
    updateReportsFilter("period", "30");
    return;
  }
  if (filterKey === "customRange") {
    updateReportsFilter("period", "30");
    return;
  }
  if (filterKey === "categoryId") {
    updateReportsFilter("categoryId", "all");
    updateReportsFilter("productId", "all");
    return;
  }
  if (filterKey === "productId") {
    updateReportsFilter("productId", "all");
  }
}

async function refreshReportsData({ feedback = false } = {}) {
  const currentRequest = ++refreshSequence;
  setReportsLoading(true);
  const payload = await loadReportsPayload(state.reports.filters);

  if (currentRequest !== refreshSequence) {
    return payload;
  }

  setReportsPayload(payload);

  if (feedback) {
    if (payload.mode === "demo") {
      showToast({
        title: I18N_PTBR.reports.title,
        message: I18N_PTBR.reports.toasts.fallback_demo,
        type: "error",
      });
    } else {
      showToast({
        title: I18N_PTBR.reports.title,
        message: I18N_PTBR.reports.toasts.refreshed,
        type: "success",
      });
    }
  }

  return payload;
}

const debouncedServerRefresh = debounce(() => {
  if (state.reports.mode === "api" && !state.reports.demoMode) {
    refreshReportsData();
  }
}, 360);

function bindShortcut() {
  if (shortcutBound) return;
  shortcutBound = true;

  document.addEventListener("keydown", (event) => {
    if (state.route !== "relatorios") return;
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
    document.getElementById("reportsProductFilter")?.focus();
  });
}

function bindEvents() {
  const branchFilter = document.getElementById("reportsBranchFilter");
  const periodFilter = document.getElementById("reportsPeriodFilter");
  const categoryFilter = document.getElementById("reportsCategoryFilter");
  const productFilter = document.getElementById("reportsProductFilter");
  const customFrom = document.getElementById("reportsCustomFrom");
  const customTo = document.getElementById("reportsCustomTo");
  const refreshBtn = document.getElementById("refreshReportsBtn");
  const exportCsvBtn = document.getElementById("exportReportsCsvBtn");
  const exportPdfBtn = document.getElementById("exportReportsPdfBtn");
  const clearFiltersBtn = document.getElementById("clearReportsFiltersBtn");
  const exportFullCsvBtn = document.getElementById("reportsExportFullCsvBtn");
  const exportManagerPdfBtn = document.getElementById("reportsExportManagerPdfBtn");
  const copySummaryBtn = document.getElementById("reportsCopySummaryBtn");

  function maybeRefreshServer(filterKey) {
    if (SERVER_FILTER_KEYS.has(filterKey)) {
      debouncedServerRefresh();
    }
  }

  branchFilter?.addEventListener("change", (event) => {
    updateReportsFilter("branchId", event.target.value);
    maybeRefreshServer("branchId");
  });

  periodFilter?.addEventListener("change", (event) => {
    updateReportsFilter("period", event.target.value);
    maybeRefreshServer("period");
  });

  categoryFilter?.addEventListener("change", (event) => {
    const nextCategoryId = event.target.value;
    updateReportsFilter("categoryId", nextCategoryId);

    if (state.reports.filters.productId !== "all") {
      const stillValid = (state.reports.data?.items || []).some(
        (item) =>
          String(item.id) === String(state.reports.filters.productId) &&
          (String(nextCategoryId) === "all" || String(item.category_id) === String(nextCategoryId))
      );
      if (!stillValid) {
        updateReportsFilter("productId", "all");
      }
    }
  });

  productFilter?.addEventListener("change", (event) => {
    updateReportsFilter("productId", event.target.value);
  });

  customFrom?.addEventListener("change", (event) => {
    updateReportsFilter("period", "custom");
    updateReportsFilter("customFrom", event.target.value);
    maybeRefreshServer("customFrom");
  });

  customTo?.addEventListener("change", (event) => {
    updateReportsFilter("period", "custom");
    updateReportsFilter("customTo", event.target.value);
    maybeRefreshServer("customTo");
  });

  refreshBtn?.addEventListener("click", () => {
    refreshReportsData({ feedback: true });
  });

  clearFiltersBtn?.addEventListener("click", () => {
    clearReportsFilters();
    if (state.reports.mode === "api" && !state.reports.demoMode) {
      refreshReportsData();
    }
    showToast({
      title: I18N_PTBR.reports.title,
      message: I18N_PTBR.reports.toasts.filters_cleared,
      type: "success",
    });
  });

  function runCsvExport() {
    const latestView = buildView();
    const exported = exportReportsCsv(latestView);
    if (!exported) {
      showToast({
        title: I18N_PTBR.reports.title,
        message: I18N_PTBR.reports.toasts.csv_empty,
        type: "error",
      });
      return;
    }
    showToast({
      title: I18N_PTBR.reports.title,
      message: I18N_PTBR.reports.toasts.csv_success,
      type: "success",
    });
  }

  function runPdfExport() {
    exportReportsPdf();
    showToast({
      title: I18N_PTBR.reports.title,
      message: I18N_PTBR.reports.toasts.pdf_hint,
      type: "success",
    });
  }

  exportCsvBtn?.addEventListener("click", runCsvExport);
  exportFullCsvBtn?.addEventListener("click", runCsvExport);
  exportPdfBtn?.addEventListener("click", runPdfExport);
  exportManagerPdfBtn?.addEventListener("click", runPdfExport);

  copySummaryBtn?.addEventListener("click", async () => {
    try {
      const latestView = buildView();
      await copyReportsSummary(latestView, latestView.filtersLabel);
      showToast({
        title: I18N_PTBR.reports.title,
        message: I18N_PTBR.reports.toasts.summary_copied,
        type: "success",
      });
    } catch {
      showToast({
        title: I18N_PTBR.reports.title,
        message: I18N_PTBR.reports.toasts.summary_error,
        type: "error",
      });
    }
  });

  document.querySelectorAll("[data-remove-report-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-remove-report-filter");
      if (!key) return;
      resetSingleFilter(key);
      maybeRefreshServer(key);
    });
  });
}

export function destroyReportsRuntime() {
  destroyReportsCharts();
}

export function renderReports() {
  bindShortcut();

  const pageContent = document.getElementById("pageContent");
  if (!pageContent) return;

  if (!state.reports.loaded && !state.reports.loading) {
    refreshReportsData();
  }

  if (state.reports.loading || !state.reports.loaded) {
    destroyReportsCharts();
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
  renderReportsCharts(view);
  bindEvents(view);
}
