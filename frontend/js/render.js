
import { I18N_PTBR, MOVE_TYPE_PTBR } from "./i18n.js";
import { renderAudit } from "./audit.js";
import {
  ROUTES,
  state,
  getRouteById,
  setRoute,
  setMobileSidebarOpen,
  updateDashboardFilter,
  setMovesPage,
  mutateDashboardData,
} from "./state.js";
import { applyReveal, initTooltips, openDrawer, refreshIcons, showToast } from "./ui.js";
import { renderCadastros } from "./cadastros.js";
import { renderInventoryCount } from "./inventory_counts.js";
import { renderMovements } from "./movements.js";
import { renderProducts } from "./products.js";
import { destroyReportsRuntime, renderReports } from "./reports.js";
import { renderTransfers } from "./transfers.js";
import { renderUsers } from "./users.js";
import { renderVariations } from "./variations.js";

const { DateTime } = window.luxon;

const chartInstances = {
  flow: null,
  topItems: null,
  branchStock: null,
};
const MOBILE_SHELL_BREAKPOINT = 1200;

const callbacks = {
  onRefreshData: async () => {},
  onOpenLogin: () => {},
};

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    Number(value || 0)
  );
}

function formatSigned(value) {
  const signal = value > 0 ? "+" : "";
  return `${signal}${formatNumber(value)}`;
}

function formatDateTime(iso) {
  if (!iso) return "-";
  return DateTime.fromISO(iso).setLocale("pt-BR").toFormat("dd/MM/yyyy HH:mm");
}

function formatHourMinute(iso) {
  if (!iso) return "--:--";
  return DateTime.fromISO(iso).setLocale("pt-BR").toFormat("HH:mm");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getMaps(data) {
  const branchById = new Map((data?.branches || []).map((branch) => [branch.id, branch]));
  const locationById = new Map(
    (data?.locations || []).map((location) => [location.id, location])
  );
  const itemById = new Map((data?.items || []).map((item) => [item.id, item]));
  return { branchById, locationById, itemById };
}

function resolvePeriodRange(filters) {
  const now = DateTime.now();

  if (filters.period === "custom") {
    const from = DateTime.fromISO(filters.customFrom || now.toISODate()).startOf("day");
    const to = DateTime.fromISO(filters.customTo || now.toISODate()).endOf("day");
    if (!from.isValid || !to.isValid || from > to) {
      return {
        from: now.minus({ days: 29 }).startOf("day"),
        to: now.endOf("day"),
      };
    }
    return { from, to };
  }

  const days = Number(filters.period || 30);
  return {
    from: now.minus({ days: days - 1 }).startOf("day"),
    to: now.endOf("day"),
  };
}

function filterByBranch(row, branchFilter) {
  if (branchFilter === "all") return true;
  const branchId = Number(branchFilter);
  if (row.branch_id != null) {
    return Number(row.branch_id) === branchId;
  }
  if (row.from_branch_id != null || row.to_branch_id != null) {
    return Number(row.from_branch_id) === branchId || Number(row.to_branch_id) === branchId;
  }
  return false;
}

function typeFamily(moveType) {
  if (moveType === "RECEIPT") return "receipt";
  if (moveType === "ISSUE") return "issue";
  if (moveType === "ADJUSTMENT") return "adjustment";
  if (String(moveType || "").startsWith("TRANSFER")) return "transfer";
  return "other";
}

function computeTrend(current, previous, invert = false) {
  const safePrevious = Math.max(Math.abs(Number(previous) || 0), 1);
  let raw = ((Number(current || 0) - Number(previous || 0)) / safePrevious) * 100;
  if (invert) raw *= -1;

  const direction = raw > 1 ? "up" : raw < -1 ? "down" : "flat";
  return {
    direction,
    value: Math.abs(raw),
  };
}

function buildDashboardView() {
  const data = state.dashboard.data;

  if (!data) {
    return {
      maps: { branchById: new Map(), locationById: new Map(), itemById: new Map() },
      kpis: [],
      line: { labels: [], entries: [], exits: [] },
      topItems: [],
      stockByBranch: [],
      alerts: [],
      movesPaged: [],
      movePageInfo: { page: 1, totalPages: 1, totalRows: 0, pageStart: 0, pageEnd: 0 },
      periodRange: resolvePeriodRange(state.dashboard.filters),
    };
  }

  const maps = getMaps(data);
  const branchFilter = state.dashboard.filters.branchId;
  const moveTypeFilter = state.dashboard.filters.moveType;
  const searchTerm = state.globalSearch.toLowerCase();
  const periodRange = resolvePeriodRange(state.dashboard.filters);

  const balances = (data.balances || []).filter((balance) => filterByBranch(balance, branchFilter));

  const allMovesInBranch = (data.moves || []).filter((move) => filterByBranch(move, branchFilter));
  const movesInPeriod = allMovesInBranch.filter((move) => {
    const date = DateTime.fromISO(move.occurred_at);
    return date.isValid && date >= periodRange.from && date <= periodRange.to;
  });

  const periodDays = Math.max(1, Math.floor(periodRange.to.diff(periodRange.from, "days").days) + 1);
  const previousFrom = periodRange.from.minus({ days: periodDays });
  const previousTo = periodRange.from.minus({ seconds: 1 });

  const movesInPreviousPeriod = allMovesInBranch.filter((move) => {
    const date = DateTime.fromISO(move.occurred_at);
    return date.isValid && date >= previousFrom && date <= previousTo;
  });

  const filteredMoves = movesInPeriod.filter((move) => {
    if (moveTypeFilter !== "all" && typeFamily(move.move_type) !== moveTypeFilter) {
      return false;
    }

    if (!searchTerm) return true;
    const item = maps.itemById.get(move.sku_id);
    const haystack =
      `${item?.name || ""} ${item?.sku_code || ""} ${item?.barcode || ""} ${move.reference_id || ""}`.toLowerCase();
    return haystack.includes(searchTerm);
  });

  const sortedMoves = filteredMoves.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));

  const totalRows = sortedMoves.length;
  const pageSize = state.dashboard.pagination.pageSize;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = clamp(state.dashboard.pagination.movesPage, 1, totalPages);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const movesPaged = sortedMoves.slice(startIndex, endIndex);

  const totalStock = balances.reduce((acc, balance) => acc + Number(balance.on_hand || 0), 0);

  const uniqueActiveItems = new Set(
    balances
      .filter((balance) => maps.itemById.get(balance.sku_id)?.active !== false)
      .map((balance) => balance.sku_id)
  );

  const ruptures = balances.filter((balance) => Number(balance.on_hand) <= 0).length;
  const lowStock = balances.filter((balance) => {
    const item = maps.itemById.get(balance.sku_id);
    const point = Number(item?.reorder_point || 0);
    return Number(balance.on_hand) > 0 && Number(balance.on_hand) <= point;
  }).length;

  const pendingTransfers = (data.transfers || []).filter(
    (transfer) =>
      filterByBranch(transfer, branchFilter) &&
      ["DRAFT", "SHIPPED"].includes(String(transfer.status || ""))
  ).length;

  const openCounts = (data.counts || []).filter(
    (count) => filterByBranch(count, branchFilter) && String(count.status || "") === "OPEN"
  ).length;

  const netFlowCurrent = movesInPeriod.reduce((acc, move) => acc + Number(move.qty || 0), 0);
  const netFlowPrevious = movesInPreviousPeriod.reduce((acc, move) => acc + Number(move.qty || 0), 0);
  const previousStock = totalStock - netFlowCurrent + netFlowPrevious;

  const currentVarMoved = new Set(movesInPeriod.map((move) => move.sku_id)).size;
  const previousVarMoved = new Set(movesInPreviousPeriod.map((move) => move.sku_id)).size;

  const issuePressureCurrent = movesInPeriod.filter((move) =>
    ["ISSUE", "TRANSFER_SHIP"].includes(move.move_type)
  ).length;
  const issuePressurePrevious = movesInPreviousPeriod.filter((move) =>
    ["ISSUE", "TRANSFER_SHIP"].includes(move.move_type)
  ).length;

  const previousRuptureEstimate = Math.max(
    1,
    Math.round(ruptures + (issuePressurePrevious - issuePressureCurrent) / 8)
  );
  const previousLowStockEstimate = Math.max(
    1,
    Math.round(lowStock + (issuePressurePrevious - issuePressureCurrent) / 10)
  );

  const currentPendingCreated = (data.transfers || []).filter((transfer) => {
    const created = DateTime.fromISO(transfer.created_at || "");
    return created.isValid && created >= periodRange.from && created <= periodRange.to;
  }).length;

  const previousPendingCreated = (data.transfers || []).filter((transfer) => {
    const created = DateTime.fromISO(transfer.created_at || "");
    return created.isValid && created >= previousFrom && created <= previousTo;
  }).length;

  const pendingPreviousEstimate = Math.max(
    0,
    pendingTransfers + (previousPendingCreated - currentPendingCreated)
  );

  const currentOpenCountCreated = (data.counts || []).filter((count) => {
    const created = DateTime.fromISO(count.started_at || "");
    return created.isValid && created >= periodRange.from && created <= periodRange.to;
  }).length;

  const previousOpenCountCreated = (data.counts || []).filter((count) => {
    const created = DateTime.fromISO(count.started_at || "");
    return created.isValid && created >= previousFrom && created <= previousTo;
  }).length;

  const openCountPreviousEstimate = Math.max(
    0,
    openCounts + (previousOpenCountCreated - currentOpenCountCreated)
  );

  const kpis = [
    {
      key: "stock_total",
      icon: "boxes",
      value: totalStock,
      tooltip: "Saldo total de itens disponíveis nas filiais filtradas.",
      trend: computeTrend(totalStock, previousStock),
    },
    {
      key: "active_variations",
      icon: "barcode",
      value: uniqueActiveItems.size,
      tooltip: "Quantidade de variações ativas com saldo e movimentação recente.",
      trend: computeTrend(currentVarMoved, previousVarMoved),
    },
    {
      key: "stockout",
      icon: "alert-octagon",
      value: ruptures,
      tooltip: "Variações em ruptura (saldo menor ou igual a zero).",
      trend: computeTrend(ruptures, previousRuptureEstimate, true),
    },
    {
      key: "low_stock",
      icon: "triangle-alert",
      value: lowStock,
      tooltip: "Itens abaixo do ponto de reposição cadastrado.",
      trend: computeTrend(lowStock, previousLowStockEstimate, true),
    },
    {
      key: "pending_transfers",
      icon: "truck",
      value: pendingTransfers,
      tooltip: "Transferências ainda não recebidas no destino.",
      trend: computeTrend(pendingTransfers, pendingPreviousEstimate, true),
    },
    {
      key: "open_counts",
      icon: "clipboard-check",
      value: openCounts,
      tooltip: "Contagens de estoque abertas e não finalizadas.",
      trend: computeTrend(openCounts, openCountPreviousEstimate, true),
    },
  ];

  const dailyEntries = new Map();
  const dailyExits = new Map();
  let cursor = periodRange.from.startOf("day");
  while (cursor <= periodRange.to.endOf("day")) {
    const key = cursor.toISODate();
    dailyEntries.set(key, 0);
    dailyExits.set(key, 0);
    cursor = cursor.plus({ days: 1 });
  }

  movesInPeriod.forEach((move) => {
    const dayKey = DateTime.fromISO(move.occurred_at).toISODate();
    if (!dailyEntries.has(dayKey)) return;

    if (["RECEIPT", "TRANSFER_RECEIVE"].includes(move.move_type)) {
      dailyEntries.set(dayKey, (dailyEntries.get(dayKey) || 0) + Math.abs(Number(move.qty || 0)));
      return;
    }

    if (["ISSUE", "TRANSFER_SHIP"].includes(move.move_type)) {
      dailyExits.set(dayKey, (dailyExits.get(dayKey) || 0) + Math.abs(Number(move.qty || 0)));
    }
  });

  const lineLabels = Array.from(dailyEntries.keys());
  const line = {
    labels: lineLabels,
    entries: lineLabels.map((label) => dailyEntries.get(label) || 0),
    exits: lineLabels.map((label) => dailyExits.get(label) || 0),
  };

  const topOutputMap = new Map();
  movesInPeriod.forEach((move) => {
    if (!["ISSUE", "TRANSFER_SHIP"].includes(move.move_type)) return;
    const current = topOutputMap.get(move.sku_id) || 0;
    topOutputMap.set(move.sku_id, current + Math.abs(Number(move.qty || 0)));
  });

  const topItems = Array.from(topOutputMap.entries())
    .map(([itemId, qty]) => ({ itemId, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8);

  const stockByBranchMap = new Map();
  balances.forEach((balance) => {
    const current = stockByBranchMap.get(balance.branch_id) || 0;
    stockByBranchMap.set(balance.branch_id, current + Number(balance.on_hand || 0));
  });

  const stockByBranch = Array.from(stockByBranchMap.entries()).map(([branchId, qty]) => ({
    branchId,
    qty,
  }));

  const alerts = (data.alerts || [])
    .filter((alert) => filterByBranch(alert, branchFilter))
    .filter((alert) => {
      if (!searchTerm) return true;
      const item = maps.itemById.get(alert.item_id);
      const text = `${item?.name || ""} ${item?.sku_code || ""} ${alert.note || ""}`.toLowerCase();
      return text.includes(searchTerm);
    })
    .slice(0, 28);

  return {
    maps,
    periodRange,
    kpis,
    line,
    topItems,
    stockByBranch,
    alerts,
    movesPaged,
    movePageInfo: {
      page,
      totalPages,
      totalRows,
      pageStart: totalRows ? startIndex + 1 : 0,
      pageEnd: Math.min(endIndex, totalRows),
    },
  };
}

function renderSidebarNav() {
  const nav = document.getElementById("sidebarNav");
  if (!nav) return;

  const orderedSections = ["operation", "cadastros", "settings"];
  const links = orderedSections
    .map((sectionKey) => {
      const sectionRoutes = ROUTES.filter(
        (route) => !route.hidden && String(route.section || "operation") === sectionKey
      );
      if (!sectionRoutes.length) {
        return "";
      }
      const sectionLabel = I18N_PTBR.nav_sections?.[sectionKey] || sectionKey;
      const sectionLinks = sectionRoutes
        .map((route) => {
          const isActive = state.route === route.id;
          const label = I18N_PTBR.nav[route.navKey] || route.id;
          const badge = route.complete
            ? ""
            : `<span class="nav-badge">${I18N_PTBR.actions.page_under_construction}</span>`;
          return `
            <button class="nav-link ${isActive ? "is-active" : ""}" data-route="${route.id}" aria-label="${label}">
              <i data-lucide="${route.icon}"></i>
              <span class="nav-label">${label}</span>
              ${badge}
            </button>
          `;
        })
        .join("");
      return `
        <section class="nav-section" data-nav-section="${sectionKey}">
          <p class="nav-section-label">${escapeHtml(sectionLabel)}</p>
          ${sectionLinks}
        </section>
      `;
    })
    .join("");

  nav.innerHTML = links;

  nav.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextRoute = button.getAttribute("data-route");
      if (!nextRoute) return;
      window.location.hash = `#/${nextRoute}`;
      setRoute(nextRoute);
      setMobileSidebarOpen(false);
    });
  });
}

function renderKpiCards(view) {
  return view.kpis
    .map((kpi) => {
      const label = I18N_PTBR.dashboard.kpis[kpi.key];
      const trendClass = kpi.trend.direction;
      const trendSymbol =
        kpi.trend.direction === "up" ? "↗" : kpi.trend.direction === "down" ? "↘" : "→";

      return `
        <article class="kpi-card border-gradient reveal">
          <div class="kpi-top">
            <span class="kpi-icon"><i data-lucide="${kpi.icon}"></i></span>
            <button class="kpi-help" type="button" data-tippy-content="${kpi.tooltip}" aria-label="Ajuda ${label}">
              <i data-lucide="circle-help"></i>
            </button>
          </div>
          <p class="kpi-label">${label}</p>
          <p class="kpi-value">${formatNumber(kpi.value)}</p>
          <span class="kpi-trend ${trendClass}">${trendSymbol} ${kpi.trend.value.toFixed(1)}%</span>
        </article>
      `;
    })
    .join("");
}

function renderAlertRows(view) {
  const { maps } = view;

  if (!view.alerts.length) {
    return `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <i data-lucide="inbox"></i>
            <span>${I18N_PTBR.dashboard.alerts.empty}</span>
          </div>
        </td>
      </tr>
    `;
  }

  return view.alerts
    .map((alert) => {
      const severityClass =
        alert.severity === "critical"
          ? "badge-critical"
          : alert.severity === "warning"
          ? "badge-warning"
          : "badge-normal";

      const severityLabel = I18N_PTBR.severity[alert.severity] || I18N_PTBR.severity.normal;
      const typeLabel = I18N_PTBR.alert_type[alert.type] || alert.type;
      const item = maps.itemById.get(alert.item_id);
      const branch = maps.branchById.get(alert.branch_id);

      return `
        <tr>
          <td><span class="badge ${severityClass}">${severityLabel}</span></td>
          <td>${typeLabel}</td>
          <td>${item?.name || "-"}</td>
          <td>${branch?.name || "-"}</td>
          <td>${alert.note || "-"}</td>
          <td>
            <button class="btn sm ghost" data-alert-detail-id="${alert.id}">${I18N_PTBR.actions.details}</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderMoveRows(view) {
  const { maps } = view;

  if (!view.movesPaged.length) {
    return `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <i data-lucide="folder-open"></i>
            <span>${I18N_PTBR.dashboard.recent_moves.no_results}</span>
          </div>
        </td>
      </tr>
    `;
  }

  return view.movesPaged
    .map((move) => {
      const branch = maps.branchById.get(move.branch_id);
      const location = maps.locationById.get(move.location_id);
      const item = maps.itemById.get(move.sku_id);
      const qtyClass = Number(move.qty) >= 0 ? "qty-pos" : "qty-neg";
      const moveTypeLabel = MOVE_TYPE_PTBR[move.move_type] || move.move_type;

      return `
        <tr>
          <td>${formatDateTime(move.occurred_at)}</td>
          <td>${moveTypeLabel}</td>
          <td>${branch?.name || "-"}</td>
          <td>${location?.name || "-"}</td>
          <td>${item?.name || `Variação ${move.sku_id}`}</td>
          <td class="${qtyClass}">${formatSigned(Number(move.qty || 0))}</td>
          <td>${move.user_name || `Usuário ${move.created_by || "-"}`}</td>
          <td>
            <button class="btn sm ghost" data-move-detail-id="${move.id}">${I18N_PTBR.actions.details}</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderDashboardLoading() {
  return `
    <section class="panel pad">
      <div class="page-head">
        <div>
          <div class="skeleton line" style="width: 120px;"></div>
          <div class="skeleton line" style="width: 320px; margin-top: 10px;"></div>
          <div class="skeleton line" style="width: 460px; margin-top: 8px;"></div>
        </div>
        <div class="filters-grid">
          <div class="skeleton block"></div>
          <div class="skeleton block"></div>
          <div class="skeleton block"></div>
          <div class="skeleton block"></div>
        </div>
      </div>
    </section>

    <section class="kpi-grid">
      ${new Array(6).fill("<div class='kpi-card'><div class='skeleton block'></div></div>").join("")}
    </section>

    <section class="content-grid">
      <div class="chart-grid">
        <article class="panel chart-card"><div class="skeleton block"></div><div class="skeleton block" style="margin-top:10px;"></div></article>
        <div class="chart-row">
          <article class="panel chart-card"><div class="skeleton block"></div></article>
          <article class="panel chart-card"><div class="skeleton block"></div></article>
        </div>
      </div>
      <div class="chart-grid">
        <article class="panel pad"><div class="skeleton block"></div><div class="skeleton block" style="margin-top:10px;"></div></article>
        <article class="panel pad"><div class="skeleton block"></div><div class="skeleton block" style="margin-top:10px;"></div></article>
      </div>
    </section>

    <section class="panel table-card">
      <div class="skeleton line" style="width: 240px;"></div>
      <div class="skeleton block" style="margin-top: 10px;"></div>
    </section>
  `;
}

function renderDashboardLoaded(view) {
  const filters = state.dashboard.filters;
  const data = state.dashboard.data;
  const lastUpdate = state.dashboard.lastUpdatedIso || data.generated_at;
  const modeIsDemo = state.dashboard.demoMode;
  const authRequired = state.dashboard.authRequired;
  const topBannerMarkup = authRequired
    ? `<div class="banner"><i data-lucide="lock"></i>${escapeHtml(
        state.dashboard.authMessage || "Faca login para consultar os dados protegidos."
      )}</div>`
    : state.dashboard.showDemoBanner
    ? `<div class="banner"><i data-lucide="flask-conical"></i>${I18N_PTBR.mode_demo_banner}</div>`
    : "";
  const topBannerVisible = Boolean(topBannerMarkup);

  const branchOptions = [
    `<option value="all">${I18N_PTBR.dashboard.all_branches}</option>`,
    ...(data.branches || []).map(
      (branch) =>
        `<option value="${branch.id}" ${
          String(filters.branchId) === String(branch.id) ? "selected" : ""
        }>${branch.name}</option>`
    ),
  ].join("");

  const customDisabled = filters.period !== "custom";

  const pageInfo = view.movePageInfo;

  return `
    <section class="panel pad reveal">
      ${topBannerMarkup}
      <div class="page-head" style="margin-top:${topBannerVisible ? "12px" : "0"};">
        <div>
          <div class="breadcrumbs">${I18N_PTBR.breadcrumb_home} / ${I18N_PTBR.nav.dashboard}</div>
          <h1>${I18N_PTBR.dashboard.title}</h1>
          <p class="section-subtitle">${I18N_PTBR.dashboard.subtitle}</p>
          <small>${I18N_PTBR.last_update}: <strong>${formatHourMinute(lastUpdate)}</strong></small>
        </div>

        <div class="filters-grid">
          <div class="field">
            <label for="filterBranch">${I18N_PTBR.dashboard.branch}</label>
            <select id="filterBranch" aria-label="Filial">${branchOptions}</select>
          </div>

          <div class="field">
            <label for="filterPeriod">${I18N_PTBR.dashboard.period}</label>
            <select id="filterPeriod" aria-label="Período">
              <option value="7" ${filters.period === "7" ? "selected" : ""}>${I18N_PTBR.dashboard.period_7}</option>
              <option value="30" ${filters.period === "30" ? "selected" : ""}>${I18N_PTBR.dashboard.period_30}</option>
              <option value="90" ${filters.period === "90" ? "selected" : ""}>${I18N_PTBR.dashboard.period_90}</option>
              <option value="custom" ${filters.period === "custom" ? "selected" : ""}>${I18N_PTBR.dashboard.custom}</option>
            </select>
          </div>

          <div class="field-row">
            <div class="field">
              <label for="customFrom">Início</label>
              <input id="customFrom" type="date" value="${filters.customFrom}" ${
    customDisabled ? "disabled" : ""
  } aria-label="Data inicial" />
            </div>
            <div class="field">
              <label for="customTo">Fim</label>
              <input id="customTo" type="date" value="${filters.customTo}" ${
    customDisabled ? "disabled" : ""
  } aria-label="Data final" />
            </div>
          </div>

          <div class="field">
            <label>&nbsp;</label>
            <button class="btn primary" id="refreshDashboardBtn"><i data-lucide="refresh-cw"></i>${I18N_PTBR.dashboard.update}</button>
          </div>
        </div>
      </div>
    </section>

    <section class="kpi-grid">${renderKpiCards(view)}</section>

    <section class="content-grid">
      <div class="chart-grid">
        <article class="panel chart-card reveal">
          <div class="chart-header">
            <div>
              <h2 class="section-title">${I18N_PTBR.dashboard.charts.flow}</h2>
              <p class="section-subtitle">${view.periodRange.from.toFormat("dd/LL/yyyy")} até ${view.periodRange.to.toFormat("dd/LL/yyyy")}</p>
            </div>
            <div class="chart-legend">
              <span class="legend-dot" style="background:#2563eb;"></span>${I18N_PTBR.dashboard.charts.entries}
              <span class="legend-dot" style="background:#ef4444;"></span>${I18N_PTBR.dashboard.charts.exits}
            </div>
          </div>
          <div class="chart-canvas-wrap"><canvas id="chartFlow" aria-label="Gráfico de entradas e saídas"></canvas></div>
        </article>

        <div class="chart-row">
          <article class="panel chart-card reveal">
            <div class="chart-header">
              <div>
                <h2 class="section-title">${I18N_PTBR.dashboard.charts.top_output}</h2>
                <p class="section-subtitle">${I18N_PTBR.dashboard.charts.top_output_subtitle}</p>
              </div>
            </div>
            <div class="chart-canvas-wrap sm"><canvas id="chartTopItems" aria-label="Top itens com maior saída"></canvas></div>
          </article>

          <article class="panel chart-card reveal">
            <div class="chart-header">
              <div>
                <h2 class="section-title">${I18N_PTBR.dashboard.charts.branch_distribution}</h2>
                <p class="section-subtitle">${I18N_PTBR.dashboard.charts.branch_distribution_subtitle}</p>
              </div>
            </div>
            <div class="chart-canvas-wrap sm"><canvas id="chartBranchStock" aria-label="Donut de estoque por filial"></canvas></div>
          </article>
        </div>
      </div>

      <div class="chart-grid">
        <article class="panel pad reveal">
          <div class="table-head">
            <div>
              <h2 class="section-title">${I18N_PTBR.dashboard.quick_actions.title}</h2>
              <p class="section-subtitle">${I18N_PTBR.dashboard.quick_actions.subtitle}</p>
            </div>
          </div>
          <div class="quick-actions">
            <button class="action-btn" data-quick-action="entry"><i data-lucide="arrow-down-circle"></i><strong>${I18N_PTBR.dashboard.quick_actions.entry}</strong><small>${I18N_PTBR.dashboard.quick_actions.entry_desc}</small></button>
            <button class="action-btn" data-quick-action="issue"><i data-lucide="arrow-up-circle"></i><strong>${I18N_PTBR.dashboard.quick_actions.issue}</strong><small>${I18N_PTBR.dashboard.quick_actions.issue_desc}</small></button>
            <button class="action-btn" data-quick-action="transfer"><i data-lucide="send"></i><strong>${I18N_PTBR.dashboard.quick_actions.transfer}</strong><small>${I18N_PTBR.dashboard.quick_actions.transfer_desc}</small></button>
            <button class="action-btn" data-quick-action="count"><i data-lucide="clipboard-list"></i><strong>${I18N_PTBR.dashboard.quick_actions.count}</strong><small>${I18N_PTBR.dashboard.quick_actions.count_desc}</small></button>
          </div>
        </article>

        <article class="panel pad reveal">
          <div class="table-head">
            <div>
              <h2 class="section-title">${I18N_PTBR.dashboard.system_status.title}</h2>
              <p class="section-subtitle">${I18N_PTBR.dashboard.system_status.subtitle}</p>
            </div>
          </div>

          <div class="status-list">
            <div class="status-item">
              <strong>${I18N_PTBR.dashboard.system_status.api}</strong>
              <span class="status-chip ${
    state.dashboard.systemStatus.api === "online" ? "status-online" : "status-offline"
  }">
                ${
                  state.dashboard.systemStatus.api === "online"
                    ? I18N_PTBR.dashboard.system_status.online
                    : I18N_PTBR.dashboard.system_status.offline
                }
              </span>
            </div>

            <div class="status-item">
              <strong>${I18N_PTBR.dashboard.system_status.db}</strong>
              <span class="status-chip ${
    state.dashboard.systemStatus.db === "online" ? "status-online" : "status-offline"
  }">
                ${
                  state.dashboard.systemStatus.db === "online"
                    ? I18N_PTBR.dashboard.system_status.online
                    : I18N_PTBR.dashboard.system_status.offline
                }
              </span>
            </div>

            <div class="status-item">
              <strong>${I18N_PTBR.dashboard.system_status.mode}</strong>
              <span class="status-chip ${modeIsDemo ? "status-demo" : "status-online"}">
                ${
                  modeIsDemo
                    ? I18N_PTBR.dashboard.system_status.demo
                    : I18N_PTBR.dashboard.system_status.production
                }
              </span>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="panel table-card reveal">
      <div class="table-head">
        <div>
          <h2 class="section-title">${I18N_PTBR.dashboard.alerts.title}</h2>
          <p class="section-subtitle">${I18N_PTBR.dashboard.alerts.subtitle}</p>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${I18N_PTBR.dashboard.alerts.table.severity}</th>
              <th>${I18N_PTBR.dashboard.alerts.table.type}</th>
              <th>${I18N_PTBR.dashboard.alerts.table.item}</th>
              <th>${I18N_PTBR.dashboard.alerts.table.branch}</th>
              <th>${I18N_PTBR.dashboard.alerts.table.note}</th>
              <th>${I18N_PTBR.dashboard.alerts.table.action}</th>
            </tr>
          </thead>
          <tbody>${renderAlertRows(view)}</tbody>
        </table>
      </div>
    </section>

    <section class="panel table-card reveal">
      <div class="table-head">
        <div>
          <h2 class="section-title">${I18N_PTBR.dashboard.recent_moves.title}</h2>
          <p class="section-subtitle">${I18N_PTBR.dashboard.recent_moves.subtitle}</p>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${I18N_PTBR.dashboard.recent_moves.table.date}</th>
              <th>${I18N_PTBR.dashboard.recent_moves.table.type}</th>
              <th>${I18N_PTBR.dashboard.recent_moves.table.branch}</th>
              <th>${I18N_PTBR.dashboard.recent_moves.table.location}</th>
              <th>${I18N_PTBR.dashboard.recent_moves.table.item}</th>
              <th>${I18N_PTBR.dashboard.recent_moves.table.quantity}</th>
              <th>${I18N_PTBR.dashboard.recent_moves.table.user}</th>
              <th>${I18N_PTBR.dashboard.recent_moves.table.action}</th>
            </tr>
          </thead>
          <tbody>${renderMoveRows(view)}</tbody>
        </table>
      </div>

      <div class="pagination">
        <small>Mostrando ${pageInfo.pageStart}-${pageInfo.pageEnd} de ${pageInfo.totalRows}</small>
        <div style="display:flex; gap:8px;">
          <button class="btn sm ghost" id="movesPrevBtn" ${
            pageInfo.page <= 1 ? "disabled" : ""
          }>Anterior</button>
          <small>Página ${pageInfo.page} de ${pageInfo.totalPages}</small>
          <button class="btn sm ghost" id="movesNextBtn" ${
            pageInfo.page >= pageInfo.totalPages ? "disabled" : ""
          }>Próxima</button>
        </div>
      </div>
    </section>
  `;
}

function destroyCharts() {
  Object.values(chartInstances).forEach((chart) => {
    if (chart) {
      chart.destroy();
    }
  });
  chartInstances.flow = null;
  chartInstances.topItems = null;
  chartInstances.branchStock = null;
}

function renderCharts(view) {
  if (!window.Chart) return;

  destroyCharts();

  const flowContext = document.getElementById("chartFlow");
  const topContext = document.getElementById("chartTopItems");
  const branchContext = document.getElementById("chartBranchStock");

  if (!flowContext || !topContext || !branchContext) return;

  chartInstances.flow = new window.Chart(flowContext, {
    type: "line",
    data: {
      labels: view.line.labels.map((isoDate) => DateTime.fromISO(isoDate).toFormat("dd/LL")),
      datasets: [
        {
          label: I18N_PTBR.dashboard.charts.entries,
          data: view.line.entries,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.16)",
          borderWidth: 2,
          fill: true,
          tension: 0.35,
        },
        {
          label: I18N_PTBR.dashboard.charts.exits,
          data: view.line.exits,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239, 68, 68, 0.16)",
          borderWidth: 2,
          fill: true,
          tension: 0.35,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#d4d4d8",
            boxWidth: 10,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#a1a1aa",
          },
          grid: {
            color: "rgba(255,255,255,0.06)",
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#a1a1aa",
          },
          grid: {
            color: "rgba(255,255,255,0.06)",
          },
        },
      },
    },
  });

  chartInstances.topItems = new window.Chart(topContext, {
    type: "bar",
    data: {
      labels: view.topItems.map((row) => {
        const item = view.maps.itemById.get(row.itemId);
        if (!item) return "-";
        return item.name.length > 22 ? `${item.name.slice(0, 22)}...` : item.name;
      }),
      datasets: [
        {
          label: "Saídas",
          data: view.topItems.map((row) => row.qty),
          backgroundColor: "rgba(37, 99, 235, 0.8)",
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: "#a1a1aa" },
          grid: { display: false },
        },
        y: {
          ticks: { color: "#a1a1aa" },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
      },
    },
  });

  const donutColors = ["#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"];

  chartInstances.branchStock = new window.Chart(branchContext, {
    type: "doughnut",
    data: {
      labels: view.stockByBranch.map((row) => view.maps.branchById.get(row.branchId)?.name || "-"),
      datasets: [
        {
          data: view.stockByBranch.map((row) => Math.max(row.qty, 0)),
          backgroundColor: donutColors,
          borderColor: "rgba(0,0,0,0)",
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#d4d4d8",
            boxWidth: 10,
            padding: 16,
          },
        },
      },
      cutout: "62%",
    },
  });
}

function renderPlaceholder(route) {
  const pageContent = document.getElementById("pageContent");
  if (!pageContent) return;

  pageContent.innerHTML = `
    <section class="placeholder-page">
      <article class="placeholder-card border-gradient reveal">
        <i data-lucide="${route.icon}"></i>
        <h2>${I18N_PTBR.nav[route.navKey]}</h2>
        <p>${I18N_PTBR.placeholders.title}</p>
        <p style="margin-top:8px;">${I18N_PTBR.placeholders.subtitle}</p>
      </article>
    </section>
  `;

  refreshIcons();
  applyReveal(pageContent);
}

function renderLoginPage() {
  const pageContent = document.getElementById("pageContent");
  if (!pageContent) return;

  pageContent.innerHTML = `
    <section class="placeholder-page">
      <article class="placeholder-card border-gradient reveal">
        <i data-lucide="log-in"></i>
        <h2>${I18N_PTBR.login.title}</h2>
        <p>${I18N_PTBR.login.subtitle}</p>
        <div class="table-tools" style="margin-top: 14px; justify-content: center;">
          <button class="btn primary" type="button" id="loginRouteCta">
            <i data-lucide="log-in"></i>${I18N_PTBR.login.cta}
          </button>
        </div>
      </article>
    </section>
  `;

  pageContent.querySelector("#loginRouteCta")?.addEventListener("click", () => {
    callbacks.onOpenLogin?.();
  });

  refreshIcons();
  applyReveal(pageContent);
}

function nextId(rows) {
  return rows.reduce((maxId, row) => Math.max(maxId, Number(row.id || 0)), 0) + 1;
}

function getLocationsForBranch(data, branchId) {
  return (data.locations || []).filter((location) => Number(location.branch_id) === Number(branchId));
}

function buildSelectOptions(rows, selectedValue = "", labelBy) {
  return rows
    .map((row) => {
      const value = String(row.id);
      const selected = value === String(selectedValue) ? "selected" : "";
      return `<option value="${value}" ${selected}>${labelBy(row)}</option>`;
    })
    .join("");
}

function upsertAlert(data, alert) {
  const exists = data.alerts.find(
    (current) =>
      current.type === alert.type &&
      Number(current.branch_id) === Number(alert.branch_id) &&
      Number(current.item_id) === Number(alert.item_id)
  );
  if (!exists) {
    data.alerts.unshift(alert);
  }
}

function handleQuickAction(action) {
  const data = state.dashboard.data;
  if (!data) return;

  const branches = data.branches || [];
  const branchNameById = new Map(branches.map((branch) => [branch.id, branch.name]));
  const allLocations = data.locations || [];
  const items = data.items || [];
  const defaultBranchId =
    state.dashboard.filters.branchId === "all"
      ? String(branches[0]?.id || "")
      : String(state.dashboard.filters.branchId);
  const defaultBranchLocations = getLocationsForBranch(data, defaultBranchId);
  const defaultLocationId = String((defaultBranchLocations[0] || allLocations[0])?.id || "");

  if (action === "entry" || action === "issue") {
    const title =
      action === "entry" ? I18N_PTBR.dashboard.quick_actions.entry : I18N_PTBR.dashboard.quick_actions.issue;

    openDrawer({
      title,
      subtitle: I18N_PTBR.drawer.subtitle_move,
      submitLabel: I18N_PTBR.drawer.confirm,
      cancelLabel: I18N_PTBR.drawer.cancel,
      bodyHtml: `
        <div class="field">
          <label>${I18N_PTBR.drawer.branch} *</label>
          <select name="branchId" required>
            ${buildSelectOptions(branches, defaultBranchId, (row) => row.name)}
          </select>
        </div>
        <div class="field">
          <label>${I18N_PTBR.drawer.location} *</label>
          <select name="locationId" required>
            ${buildSelectOptions(
              allLocations,
              defaultLocationId,
              (row) => `${branchNameById.get(row.branch_id) || "Filial"} - ${row.name}`
            )}
          </select>
        </div>
        <div class="field">
          <label>${I18N_PTBR.drawer.item} *</label>
          <select name="itemId" required>
            ${buildSelectOptions(items, String(items[0]?.id || ""), (row) => row.name)}
          </select>
        </div>
        <div class="field">
          <label>${I18N_PTBR.drawer.quantity} *</label>
          <input name="quantity" type="number" min="1" value="1" required />
        </div>
        <div class="field">
          <label>${I18N_PTBR.drawer.note}</label>
          <textarea name="note" placeholder="Opcional"></textarea>
        </div>
      `,
      onSubmit: (formData, helpers) => {
        const branchId = Number(formData.get("branchId"));
        const locationId = Number(formData.get("locationId"));
        const itemId = Number(formData.get("itemId"));
        const quantity = Number(formData.get("quantity"));
        const note = String(formData.get("note") || "").trim();

        if (!branchId || !locationId || !itemId) {
          helpers.setError(I18N_PTBR.drawer.required_error);
          return false;
        }

        if (Number.isNaN(quantity) || quantity <= 0) {
          helpers.setError(I18N_PTBR.drawer.quantity_error);
          return false;
        }

        const nowIso = DateTime.now().toISO();
        const moveQty = action === "entry" ? quantity : -quantity;
        const moveType = action === "entry" ? "RECEIPT" : "ISSUE";

        mutateDashboardData((draft) => {
          const moveId = nextId(draft.moves || []);
          draft.moves.unshift({
            id: moveId,
            branch_id: branchId,
            sku_id: itemId,
            location_id: locationId,
            move_type: moveType,
            qty: moveQty,
            occurred_at: nowIso,
            created_by: 0,
            user_name: "Operador FreeShop",
            reason: note || "Registro manual",
            reference_id: `UI-${String(moveId).padStart(6, "0")}`,
          });

          let balance = draft.balances.find(
            (row) =>
              Number(row.branch_id) === branchId &&
              Number(row.sku_id) === itemId &&
              Number(row.location_id) === locationId
          );

          if (!balance) {
            balance = {
              id: nextId(draft.balances || []),
              branch_id: branchId,
              sku_id: itemId,
              location_id: locationId,
              on_hand: 0,
              updated_at: nowIso,
            };
            draft.balances.push(balance);
          }

          balance.on_hand = Number(balance.on_hand || 0) + moveQty;
          balance.updated_at = nowIso;

          if (balance.on_hand <= 0) {
            upsertAlert(draft, {
              id: nextId(draft.alerts || []),
              severity: "critical",
              type: "stockout",
              item_id: itemId,
              branch_id: branchId,
              note: "Ruptura após movimentação manual.",
            });
          }
        });

        showToast({
          title: I18N_PTBR.actions.saved_ok,
          message: title,
          type: "success",
        });

        helpers.close();
        return true;
      },
    });

    return;
  }

  if (action === "transfer") {
    const secondBranch = branches[1] || branches[0];

    openDrawer({
      title: I18N_PTBR.dashboard.quick_actions.transfer,
      subtitle: I18N_PTBR.drawer.subtitle_transfer,
      submitLabel: I18N_PTBR.drawer.confirm,
      cancelLabel: I18N_PTBR.drawer.cancel,
      bodyHtml: `
        <div class="field">
          <label>${I18N_PTBR.drawer.branch} *</label>
          <select name="fromBranchId" required>
            ${buildSelectOptions(branches, defaultBranchId, (row) => row.name)}
          </select>
        </div>
        <div class="field">
          <label>${I18N_PTBR.drawer.destination_branch} *</label>
          <select name="toBranchId" required>
            ${buildSelectOptions(branches, String(secondBranch?.id || ""), (row) => row.name)}
          </select>
        </div>
        <div class="field">
          <label>${I18N_PTBR.drawer.item} *</label>
          <select name="itemId" required>
            ${buildSelectOptions(items, String(items[0]?.id || ""), (row) => row.name)}
          </select>
        </div>
        <div class="field">
          <label>${I18N_PTBR.drawer.quantity} *</label>
          <input name="quantity" type="number" min="1" value="1" required />
        </div>
        <div class="field">
          <label>${I18N_PTBR.drawer.note}</label>
          <textarea name="note" placeholder="Opcional"></textarea>
        </div>
      `,
      onSubmit: (formData, helpers) => {
        const fromBranchId = Number(formData.get("fromBranchId"));
        const toBranchId = Number(formData.get("toBranchId"));
        const itemId = Number(formData.get("itemId"));
        const quantity = Number(formData.get("quantity"));
        const note = String(formData.get("note") || "").trim();

        if (!fromBranchId || !toBranchId || !itemId) {
          helpers.setError(I18N_PTBR.drawer.required_error);
          return false;
        }

        if (fromBranchId === toBranchId) {
          helpers.setError(I18N_PTBR.drawer.destination_error);
          return false;
        }

        if (Number.isNaN(quantity) || quantity <= 0) {
          helpers.setError(I18N_PTBR.drawer.quantity_error);
          return false;
        }

        mutateDashboardData((draft) => {
          draft.transfers.unshift({
            id: nextId(draft.transfers || []),
            from_branch_id: fromBranchId,
            to_branch_id: toBranchId,
            item_id: itemId,
            qty: quantity,
            status: "DRAFT",
            created_at: DateTime.now().toISO(),
            note: note || "Transferência criada pelo dashboard",
          });
        });

        showToast({
          title: I18N_PTBR.actions.saved_ok,
          message: I18N_PTBR.dashboard.quick_actions.transfer,
          type: "success",
        });

        helpers.close();
        return true;
      },
    });

    return;
  }

  if (action === "count") {
    openDrawer({
      title: I18N_PTBR.dashboard.quick_actions.count,
      subtitle: I18N_PTBR.drawer.subtitle_count,
      submitLabel: I18N_PTBR.drawer.confirm,
      cancelLabel: I18N_PTBR.drawer.cancel,
      bodyHtml: `
        <div class="field">
          <label>${I18N_PTBR.drawer.branch} *</label>
          <select name="branchId" required>
            ${buildSelectOptions(branches, defaultBranchId, (row) => row.name)}
          </select>
        </div>
        <div class="field">
          <label>${I18N_PTBR.drawer.location} *</label>
          <select name="locationId" required>
            ${buildSelectOptions(
              allLocations,
              defaultLocationId,
              (row) => `${branchNameById.get(row.branch_id) || "Filial"} - ${row.name}`
            )}
          </select>
        </div>
        <div class="field">
          <label>${I18N_PTBR.drawer.note}</label>
          <textarea name="note" placeholder="Opcional"></textarea>
        </div>
      `,
      onSubmit: (formData, helpers) => {
        const branchId = Number(formData.get("branchId"));
        const locationId = Number(formData.get("locationId"));
        const note = String(formData.get("note") || "").trim();

        if (!branchId || !locationId) {
          helpers.setError(I18N_PTBR.drawer.required_error);
          return false;
        }

        mutateDashboardData((draft) => {
          draft.counts.unshift({
            id: nextId(draft.counts || []),
            branch_id: branchId,
            location_id: locationId,
            status: "OPEN",
            started_at: DateTime.now().toISO(),
            lines_count: 0,
          });

          const balance = draft.balances.find((row) => Number(row.branch_id) === branchId);
          if (balance) {
            upsertAlert(draft, {
              id: nextId(draft.alerts || []),
              severity: "normal",
              type: "divergence",
              item_id: balance.sku_id,
              branch_id: branchId,
              note: note || "Contagem aberta com revisão pendente.",
            });
          }
        });

        showToast({
          title: I18N_PTBR.actions.saved_ok,
          message: I18N_PTBR.dashboard.quick_actions.count,
          type: "success",
        });

        helpers.close();
        return true;
      },
    });
  }
}

function bindDashboardEvents(view) {
  const branchFilter = document.getElementById("filterBranch");
  const periodFilter = document.getElementById("filterPeriod");
  const customFrom = document.getElementById("customFrom");
  const customTo = document.getElementById("customTo");
  const refreshButton = document.getElementById("refreshDashboardBtn");
  const moveTypeFilter = document.getElementById("moveTypeFilter");
  const prevButton = document.getElementById("movesPrevBtn");
  const nextButton = document.getElementById("movesNextBtn");

  branchFilter?.addEventListener("change", (event) => {
    updateDashboardFilter("branchId", event.target.value);
  });

  periodFilter?.addEventListener("change", (event) => {
    updateDashboardFilter("period", event.target.value);
  });

  customFrom?.addEventListener("change", (event) => {
    updateDashboardFilter("period", "custom");
    updateDashboardFilter("customFrom", event.target.value);
  });

  customTo?.addEventListener("change", (event) => {
    updateDashboardFilter("period", "custom");
    updateDashboardFilter("customTo", event.target.value);
  });

  refreshButton?.addEventListener("click", async () => {
    const payload = await callbacks.onRefreshData();
    const authRequired = Boolean(payload?.authRequired);
    const isDemo = payload?.mode === "demo";
    showToast({
      title: I18N_PTBR.dashboard.update,
      message: authRequired
        ? payload?.authMessage || "Faca login para consultar os dados protegidos."
        : isDemo
        ? I18N_PTBR.actions.refresh_error
        : I18N_PTBR.actions.refresh_done,
      type: authRequired || isDemo ? "error" : "success",
    });
  });

  moveTypeFilter?.addEventListener("change", (event) => {
    updateDashboardFilter("moveType", event.target.value);
  });

  prevButton?.addEventListener("click", () => {
    setMovesPage(view.movePageInfo.page - 1);
  });

  nextButton?.addEventListener("click", () => {
    setMovesPage(view.movePageInfo.page + 1);
  });

  document.querySelectorAll("[data-alert-detail-id]").forEach((button) => {
    button.addEventListener("click", () => {
      showToast({
        title: I18N_PTBR.actions.details,
        message: I18N_PTBR.actions.details_alert,
        type: "success",
      });
    });
  });

  document.querySelectorAll("[data-move-detail-id]").forEach((button) => {
    button.addEventListener("click", () => {
      showToast({
        title: I18N_PTBR.actions.details,
        message: I18N_PTBR.actions.details_move,
        type: "success",
      });
    });
  });

  document.querySelectorAll("[data-quick-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-quick-action");
      handleQuickAction(action);
    });
  });
}

function renderDashboard() {
  const pageContent = document.getElementById("pageContent");
  if (!pageContent) return;

  if (state.dashboard.loading) {
    destroyCharts();
    pageContent.innerHTML = renderDashboardLoading();
    refreshIcons();
    applyReveal(pageContent);
    return;
  }

  const view = buildDashboardView();
  pageContent.innerHTML = renderDashboardLoaded(view);

  refreshIcons();
  applyReveal(pageContent);
  initTooltips(pageContent);
  renderCharts(view);
  bindDashboardEvents(view);
}

export function configureRenderer(partialCallbacks) {
  Object.assign(callbacks, partialCallbacks || {});
}

export function renderApp() {
  const shell = document.getElementById("appShell");
  const sidebar = document.getElementById("sidebar");

  if (shell) {
    shell.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
    shell.classList.toggle("sidebar-open", state.mobileSidebarOpen);
  }

  if (sidebar) {
    const isDesktop = window.innerWidth > MOBILE_SHELL_BREAKPOINT;
    sidebar.setAttribute("aria-hidden", isDesktop || state.mobileSidebarOpen ? "false" : "true");
  }
  document.body.classList.toggle(
    "mobile-nav-open",
    state.mobileSidebarOpen && window.innerWidth <= MOBILE_SHELL_BREAKPOINT
  );

  renderSidebarNav();

  if (state.route !== "relatorios") {
    destroyReportsRuntime();
  }

  if (state.route === "dashboard") {
    renderDashboard();
  } else if (state.route === "login") {
    destroyCharts();
    renderLoginPage();
  } else if (state.route === "movimentacoes") {
    destroyCharts();
    renderMovements();
  } else if (state.route === "produtos") {
    destroyCharts();
    renderProducts();
  } else if (state.route === "transferencias") {
    destroyCharts();
    renderTransfers();
  } else if (state.route === "contagem") {
    destroyCharts();
    renderInventoryCount();
  } else if (state.route === "relatorios") {
    destroyCharts();
    renderReports();
  } else if (state.route === "auditoria") {
    destroyCharts();
    renderAudit();
  } else if (state.route === "cadastros") {
    destroyCharts();
    renderCadastros();
  } else if (state.route === "usuarios") {
    destroyCharts();
    renderUsers();
  } else if (state.route === "variacoes") {
    destroyCharts();
    renderVariations();
  } else {
    destroyCharts();
    renderPlaceholder(getRouteById(state.route));
  }
}
