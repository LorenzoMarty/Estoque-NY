/*
  Bibliotecas via CDN usadas nesta pagina:
  - Luxon: datas, fuso horario e formatacao de periodo.
  - Tippy.js + Popper: tooltips acessiveis e ricos.
  - Lucide: icones SVG consistentes.
  - Prism.js (opcional): se presente, aplica highlight no JSON do drawer.

  Configuracao da API:
  - Ajuste `API_BASE_URL` em `frontend/js/api.js`.

  Endpoint consumido:
  - GET `/admin/audit-logs?page=&page_size=&filters...`
    (filtros: user_id, action, resource_type, from_date, to_date).

  Modo demonstracao:
  - Em falha da API, entra automaticamente em modo demo com centenas de logs
    simulados e banner discreto de aviso.
*/

import { loadAuditPayload } from "./api.js";
import { buildAuditDetailJson, enhanceAuditDiffHighlight, renderAuditDiffSection } from "./audit_diff.js";
import { exportAuditCsv } from "./audit_export.js";
import { I18N_PTBR } from "./i18n.js";
import {
  clearAuditFilters,
  setAuditLoading,
  setAuditPage,
  setAuditPayload,
  setAuditSort,
  state,
  toggleAuditFiltersCollapsed,
  updateAuditFilter,
} from "./state.js";
import { applyReveal, copyToClipboard, initTooltips, openDrawer, refreshIcons, showToast } from "./ui.js";
import {
  clamp,
  debounce,
  escapeHtml,
  formatDateTimePtBr,
  formatHourMinutePtBr,
  formatInt,
  resolvePeriodRange,
} from "./utils.js";

const { DateTime } = window.luxon;

const SERVER_FILTER_KEYS = new Set([
  "userId",
  "action",
  "resourceType",
  "period",
  "customFrom",
  "customTo",
  "criticalOnly",
  "query",
]);

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

function actionLabel(action, detail = "") {
  const map = I18N_PTBR.audit.action_types;
  const code = String(action || "UPDATE").toUpperCase();
  if (code === "AUTH") {
    const detailCode = String(detail || "").toUpperCase();
    if (detailCode.includes("LOGIN")) return I18N_PTBR.audit.action_details.login;
    if (detailCode.includes("LOGOUT")) return I18N_PTBR.audit.action_details.logout;
  }
  return map[code] || map.UPDATE;
}

function resourceLabel(type) {
  return I18N_PTBR.audit.resource_types[String(type || "").toUpperCase()] || I18N_PTBR.audit.resource_types.MOVEMENT;
}

function severityInfo(severity) {
  const level = String(severity || "info").toLowerCase();
  if (level === "critical") return { className: "badge-critical", label: I18N_PTBR.audit.severity.critical };
  if (level === "warning") return { className: "badge-warning", label: I18N_PTBR.audit.severity.warning };
  return { className: "badge-normal", label: I18N_PTBR.audit.severity.info };
}

function periodLabel(period) {
  if (period === "7") return I18N_PTBR.audit.filters.period_7;
  if (period === "30") return I18N_PTBR.audit.filters.period_30;
  if (period === "90") return I18N_PTBR.audit.filters.period_90;
  if (period === "custom") return I18N_PTBR.audit.filters.period_custom;
  return period;
}

function getUserById(data) {
  return new Map((data?.users || []).map((user) => [String(user.id), user]));
}

function compareRows(left, right) {
  const direction = state.audit.sort.order === "asc" ? 1 : -1;
  const leftDate = DateTime.fromISO(String(left.occurred_at || "")).toMillis();
  const rightDate = DateTime.fromISO(String(right.occurred_at || "")).toMillis();
  if (leftDate !== rightDate) return (leftDate - rightDate) * direction;
  return (Number(left.id || 0) - Number(right.id || 0)) * direction;
}

function buildChips(view) {
  const filters = state.audit.filters;
  const chips = [];
  if (filters.userId !== "all") {
    chips.push({
      key: "userId",
      label: `${I18N_PTBR.audit.chips.user}: ${view.userById.get(String(filters.userId))?.name || filters.userId}`,
    });
  }
  if (filters.action !== "all") {
    chips.push({ key: "action", label: `${I18N_PTBR.audit.chips.action}: ${actionLabel(filters.action)}` });
  }
  if (filters.resourceType !== "all") {
    chips.push({
      key: "resourceType",
      label: `${I18N_PTBR.audit.chips.resource}: ${resourceLabel(filters.resourceType)}`,
    });
  }
  if (filters.period !== "30") {
    chips.push({ key: "period", label: `${I18N_PTBR.audit.chips.period}: ${periodLabel(filters.period)}` });
  }
  if (filters.period === "custom") {
    chips.push({
      key: "customRange",
      label: `${I18N_PTBR.audit.chips.custom_range}: ${filters.customFrom} -> ${filters.customTo}`,
    });
  }
  if (filters.criticalOnly) {
    chips.push({ key: "criticalOnly", label: `${I18N_PTBR.audit.chips.critical_only}: ON` });
  }
  if (filters.query) {
    chips.push({ key: "query", label: `${I18N_PTBR.audit.chips.query}: ${filters.query}` });
  }
  return chips;
}

function buildView() {
  const data = state.audit.data;
  const filters = state.audit.filters;
  const periodRange = resolvePeriodRange(filters);
  if (!data) {
    return {
      rows: [],
      rowsPaged: [],
      userById: new Map(),
      userOptions: [],
      actionOptions: [],
      resourceOptions: [],
      chips: [],
      kpis: { actionsPeriod: 0, stockAdjustments: 0, canceledTransfers: 0, recentLogins: 0 },
      pageInfo: { page: 1, totalPages: 1, totalRows: 0, start: 0, end: 0 },
    };
  }

  const userById = getUserById(data);
  const queryTerm = normalize(filters.query);
  const rows = (data.logs || []).filter((row) => {
    const occurredAt = DateTime.fromISO(String(row.occurred_at || ""));
    if (!occurredAt.isValid || occurredAt < periodRange.from || occurredAt > periodRange.to) return false;
    if (filters.userId !== "all" && String(row.user_id) !== String(filters.userId)) return false;
    if (filters.action !== "all" && String(row.action) !== String(filters.action)) return false;
    if (filters.resourceType !== "all" && String(row.resource_type) !== String(filters.resourceType)) return false;
    if (filters.criticalOnly && String(row.severity || "").toLowerCase() !== "critical") return false;
    if (queryTerm) {
      const haystack = normalize(
        `${row.user_name || ""} ${actionLabel(row.action, row.action_detail)} ${row.action_detail || ""} ${
          row.resource_id || ""
        } ${row.reference_id || ""} ${row.origin_ip || ""} ${row.origin_device || ""} ${row.reason || ""} ${
          row.notes || ""
        } ${row.message || ""}`
      );
      if (!haystack.includes(queryTerm)) return false;
    }
    return true;
  });

  rows.sort(compareRows);
  const totalRows = rows.length;
  const pageSize = state.audit.pagination.pageSize;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = clamp(state.audit.pagination.page, 1, totalPages);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  return {
    rows,
    rowsPaged: rows.slice(startIndex, endIndex),
    userById,
    userOptions: data.users || [],
    actionOptions: data.action_types || [],
    resourceOptions: data.resource_types || [],
    chips: buildChips({ userById }),
    kpis: {
      actionsPeriod: rows.length,
      stockAdjustments: rows.filter((row) => row.action === "STOCK_ADJUSTMENT").length,
      canceledTransfers: rows.filter(
        (row) => row.action === "TRANSFER" && normalize(`${row.action_detail || ""} ${row.message || ""}`).includes("cancel")
      ).length,
      recentLogins: rows.filter(
        (row) =>
          row.action === "AUTH" &&
          normalize(row.action_detail).includes("login") &&
          DateTime.fromISO(String(row.occurred_at || "")) >= DateTime.now().minus({ days: 7 })
      ).length,
    },
    pageInfo: {
      page,
      totalPages,
      totalRows,
      start: totalRows ? startIndex + 1 : 0,
      end: Math.min(endIndex, totalRows),
    },
  };
}

function renderChips(chips) {
  if (!chips.length) return `<small class="chips-empty">${I18N_PTBR.audit.defaults.empty_chips}</small>`;
  return chips
    .map(
      (chip) => `
        <button class="filter-chip" data-remove-audit-filter="${escapeHtml(chip.key)}" aria-label="${I18N_PTBR.audit.actions.clear_chip}">
          <span>${escapeHtml(chip.label)}</span>
          <i data-lucide="x"></i>
        </button>
      `
    )
    .join("");
}

function renderRows(view) {
  if (!view.rowsPaged.length) {
    return `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <i data-lucide="inbox"></i>
            <span>${I18N_PTBR.audit.table.empty}</span>
          </div>
        </td>
      </tr>
    `;
  }
  return view.rowsPaged
    .map((row) => {
      const severity = severityInfo(row.severity);
      return `
        <tr class="audit-row">
          <td>${formatDateTimePtBr(row.occurred_at)}</td>
          <td>${escapeHtml(row.user_name || "-")}</td>
          <td><span class="badge ${severity.className}" data-tippy-content="${escapeHtml(severity.label)}">${escapeHtml(
        actionLabel(row.action, row.action_detail)
      )}</span></td>
          <td>${escapeHtml(resourceLabel(row.resource_type))}</td>
          <td>${escapeHtml(row.resource_id || "-")}</td>
          <td>${escapeHtml(compact([row.origin_ip, row.origin_device].filter(Boolean).join(" • ")) || "-")}</td>
          <td><button class="btn sm" data-audit-details="${row.id}"><i data-lucide="eye"></i>${I18N_PTBR.audit.actions.view_details}</button></td>
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
          <div class="skeleton line" style="width: 420px; margin-top:8px;"></div>
        </div>
      </div>
      <div class="skeleton block" style="margin-top:14px; height: 180px;"></div>
    </section>
    <section class="mini-kpi-grid">
      ${new Array(4).fill("<article class='mini-kpi-card'><div class='skeleton block' style='height:100px;'></div></article>").join("")}
    </section>
    <section class="panel table-card reveal">
      <div class="skeleton block" style="height: 360px;"></div>
    </section>
  `;
}

function renderLoadedState(view) {
  const data = state.audit.data;
  const filters = state.audit.filters;
  const filtersCollapsed = state.audit.ui.filtersCollapsed;
  const customDisabled = filters.period !== "custom";
  const pageInfo = view.pageInfo;
  const actionOptions = [
    `<option value="all">${I18N_PTBR.audit.filters.action_all}</option>`,
    ...view.actionOptions.map((code) => `<option value="${code}" ${filters.action === code ? "selected" : ""}>${escapeHtml(actionLabel(code))}</option>`),
  ].join("");
  const resourceOptions = [
    `<option value="all">${I18N_PTBR.audit.filters.resource_all}</option>`,
    ...view.resourceOptions.map((code) => `<option value="${code}" ${filters.resourceType === code ? "selected" : ""}>${escapeHtml(resourceLabel(code))}</option>`),
  ].join("");
  const userOptions = [
    `<option value="all">${I18N_PTBR.audit.filters.user_all}</option>`,
    ...view.userOptions.map((user) => `<option value="${escapeHtml(String(user.id))}" ${String(filters.userId) === String(user.id) ? "selected" : ""}>${escapeHtml(user.name)}</option>`),
  ].join("");
  const sortArrow = state.audit.sort.order === "desc" ? "↓" : "↑";

  return `
    <section class="panel pad reveal">
      ${state.audit.showDemoBanner ? `<div class="banner"><i data-lucide="flask-conical"></i>${I18N_PTBR.mode_demo_banner}</div>` : ""}
      <div class="page-head" style="margin-top:${state.audit.showDemoBanner ? "12px" : "0"};">
        <div>
          <div class="breadcrumbs">${I18N_PTBR.audit.breadcrumb}</div>
          <h1>${I18N_PTBR.audit.title}</h1>
          <p class="section-subtitle">${I18N_PTBR.audit.subtitle}</p>
          <small>${I18N_PTBR.last_update}: <strong>${formatHourMinutePtBr(state.audit.lastUpdatedIso || data.generated_at)}</strong></small>
        </div>
        <div class="movements-actions audit-actions">
          <div class="field audit-search-field">
            <label for="auditSearchInput">${I18N_PTBR.audit.actions.global_search}</label>
            <input id="auditSearchInput" type="search" value="${escapeHtml(filters.query)}" placeholder="${escapeHtml(I18N_PTBR.audit.filters.search_placeholder)}" />
          </div>
          <button class="btn" id="exportAuditCsvBtn"><i data-lucide="download"></i>${I18N_PTBR.audit.actions.export_csv}</button>
          <button class="btn ghost" id="clearAuditFiltersBtn"><i data-lucide="x-circle"></i>${I18N_PTBR.audit.actions.clear_filters}</button>
        </div>
      </div>
      <div class="movements-filter-toolbar">
        <button class="btn sm ghost" id="toggleAuditFiltersBtn" aria-expanded="${filtersCollapsed ? "false" : "true"}" aria-controls="auditFiltersPanel">
          <i data-lucide="${filtersCollapsed ? "chevron-down" : "chevron-up"}"></i>
          ${filtersCollapsed ? I18N_PTBR.audit.actions.filter_show : I18N_PTBR.audit.actions.filter_hide}
        </button>
      </div>
      <div class="movements-filters ${filtersCollapsed ? "is-collapsed" : ""}" id="auditFiltersPanel">
        <div class="movements-filter-grid audit-filter-grid">
          <div class="field"><label for="auditUserFilter">${I18N_PTBR.audit.filters.user}</label><select id="auditUserFilter">${userOptions}</select></div>
          <div class="field"><label for="auditActionFilter">${I18N_PTBR.audit.filters.action}</label><select id="auditActionFilter">${actionOptions}</select></div>
          <div class="field"><label for="auditResourceFilter">${I18N_PTBR.audit.filters.resource}</label><select id="auditResourceFilter">${resourceOptions}</select></div>
          <div class="field"><label for="auditPeriodFilter">${I18N_PTBR.audit.filters.period}</label>
            <select id="auditPeriodFilter">
              <option value="7" ${filters.period === "7" ? "selected" : ""}>${I18N_PTBR.audit.filters.period_7}</option>
              <option value="30" ${filters.period === "30" ? "selected" : ""}>${I18N_PTBR.audit.filters.period_30}</option>
              <option value="90" ${filters.period === "90" ? "selected" : ""}>${I18N_PTBR.audit.filters.period_90}</option>
              <option value="custom" ${filters.period === "custom" ? "selected" : ""}>${I18N_PTBR.audit.filters.period_custom}</option>
            </select>
          </div>
          <div class="field"><label for="auditCustomFrom">${I18N_PTBR.audit.filters.custom_from}</label><input id="auditCustomFrom" type="date" value="${filters.customFrom}" ${customDisabled ? "disabled" : ""} /></div>
          <div class="field"><label for="auditCustomTo">${I18N_PTBR.audit.filters.custom_to}</label><input id="auditCustomTo" type="date" value="${filters.customTo}" ${customDisabled ? "disabled" : ""} /></div>
          <div class="field audit-toggle-field">
            <label>${I18N_PTBR.audit.filters.critical_only}</label>
            <label class="transfer-toggle-inline" for="auditCriticalOnlyToggle"><input id="auditCriticalOnlyToggle" type="checkbox" ${filters.criticalOnly ? "checked" : ""} /><span>${I18N_PTBR.audit.filters.critical_only}</span></label>
          </div>
        </div>
      </div>
      <div class="reports-filter-meta"><small>${formatInt(pageInfo.totalRows)} ${I18N_PTBR.audit.filters.results}</small></div>
      <div class="filter-chip-list">${renderChips(view.chips)}</div>
    </section>
    <section class="mini-kpi-grid">
      <article class="mini-kpi-card border-gradient reveal"><div class="mini-kpi-head"><i data-lucide="logs"></i><button class="kpi-help" data-tippy-content="${I18N_PTBR.audit.kpis.actions_period.tooltip}" aria-label="Ajuda acoes no periodo"><i data-lucide="circle-help"></i></button></div><p>${I18N_PTBR.audit.kpis.actions_period.label}</p><strong>${formatInt(view.kpis.actionsPeriod)}</strong></article>
      <article class="mini-kpi-card border-gradient reveal"><div class="mini-kpi-head"><i data-lucide="scale"></i><button class="kpi-help" data-tippy-content="${I18N_PTBR.audit.kpis.stock_adjustments.tooltip}" aria-label="Ajuda ajustes"><i data-lucide="circle-help"></i></button></div><p>${I18N_PTBR.audit.kpis.stock_adjustments.label}</p><strong>${formatInt(view.kpis.stockAdjustments)}</strong></article>
      <article class="mini-kpi-card border-gradient reveal"><div class="mini-kpi-head"><i data-lucide="x-circle"></i><button class="kpi-help" data-tippy-content="${I18N_PTBR.audit.kpis.canceled_transfers.tooltip}" aria-label="Ajuda transferencias canceladas"><i data-lucide="circle-help"></i></button></div><p>${I18N_PTBR.audit.kpis.canceled_transfers.label}</p><strong>${formatInt(view.kpis.canceledTransfers)}</strong></article>
      <article class="mini-kpi-card border-gradient reveal"><div class="mini-kpi-head"><i data-lucide="log-in"></i><button class="kpi-help" data-tippy-content="${I18N_PTBR.audit.kpis.recent_logins.tooltip}" aria-label="Ajuda logins recentes"><i data-lucide="circle-help"></i></button></div><p>${I18N_PTBR.audit.kpis.recent_logins.label}</p><strong>${formatInt(view.kpis.recentLogins)}</strong></article>
    </section>
    <section class="panel table-card reveal">
      <div class="table-head"><div><h2 class="section-title">${I18N_PTBR.audit.table.title}</h2><p class="section-subtitle">${I18N_PTBR.audit.table.subtitle}</p></div></div>
      <div class="table-wrap audit-table-wrap"><table><thead><tr><th><button class="table-sort-btn" id="auditSortDateBtn">${I18N_PTBR.audit.table.date} ${sortArrow}</button></th><th>${I18N_PTBR.audit.table.user}</th><th>${I18N_PTBR.audit.table.action}</th><th>${I18N_PTBR.audit.table.resource}</th><th>${I18N_PTBR.audit.table.resource_id}</th><th>${I18N_PTBR.audit.table.origin}</th><th>${I18N_PTBR.audit.table.actions}</th></tr></thead><tbody>${renderRows(view)}</tbody></table></div>
      <div class="pagination"><small>${I18N_PTBR.audit.table.pagination} ${pageInfo.start}-${pageInfo.end} ${I18N_PTBR.audit.table.of} ${pageInfo.totalRows}</small><button class="btn sm ghost" id="auditPagePrevBtn" ${pageInfo.page <= 1 ? "disabled" : ""}>${I18N_PTBR.audit.actions.prev}</button><button class="btn sm ghost" id="auditPageNextBtn" ${pageInfo.page >= pageInfo.totalPages ? "disabled" : ""}>${I18N_PTBR.audit.actions.next}</button></div>
    </section>
  `;
}

function findLogById(logId) {
  return (state.audit.data?.logs || []).find((row) => Number(row.id) === Number(logId)) || null;
}

function relatedRoute(log) {
  const type = String(log.resource_type || "").toUpperCase();
  if (type === "PRODUCT") return "#/produtos";
  if (type === "VARIATION") return "#/variacoes";
  if (type === "MOVEMENT") return "#/movimentacoes";
  if (type === "TRANSFER") return "#/transferencias";
  if (type === "COUNT") return "#/contagem";
  if (type === "USER") return "#/usuarios";
  return "";
}

function openAuditDetails(logId) {
  const log = findLogById(logId);
  if (!log) return;
  const severity = severityInfo(log.severity);
  const route = relatedRoute(log);
  openDrawer({
    title: I18N_PTBR.audit.drawer.title,
    subtitle: `${actionLabel(log.action, log.action_detail)} • ${formatDateTimePtBr(log.occurred_at)}`,
    cancelLabel: I18N_PTBR.audit.drawer.close,
    footerHtml: `<div class="drawer-footer"><button class="btn ghost" type="button" data-close-drawer>${I18N_PTBR.audit.drawer.close}</button></div>`,
    bodyHtml: `
      <section class="drawer-section">
        <h4>${I18N_PTBR.audit.drawer.general}</h4>
        <div class="drawer-grid">
          <div><small>${I18N_PTBR.audit.drawer.user}</small><strong>${escapeHtml(log.user_name || "-")}</strong></div>
          <div><small>${I18N_PTBR.audit.drawer.date}</small><strong>${escapeHtml(formatDateTimePtBr(log.occurred_at))}</strong></div>
          <div><small>${I18N_PTBR.audit.drawer.action}</small><strong><span class="badge ${severity.className}">${escapeHtml(actionLabel(log.action, log.action_detail))}</span></strong></div>
          <div><small>${I18N_PTBR.audit.drawer.resource}</small><strong>${escapeHtml(resourceLabel(log.resource_type))}</strong></div>
          <div><small>${I18N_PTBR.audit.drawer.resource_id}</small><strong>${escapeHtml(log.resource_id || "-")}</strong></div>
          <div><small>${I18N_PTBR.audit.drawer.origin}</small><strong>${escapeHtml(compact([log.origin_ip, log.origin_device].filter(Boolean).join(" • ")) || "-")}</strong></div>
        </div>
      </section>
      ${renderAuditDiffSection(log)}
      <section class="drawer-section">
        <h4>${I18N_PTBR.audit.drawer.context}</h4>
        <div class="drawer-grid">
          <div><small>${I18N_PTBR.audit.drawer.reason}</small><strong>${escapeHtml(log.reason || "-")}</strong></div>
          <div><small>${I18N_PTBR.audit.drawer.reference}</small><strong>${escapeHtml(log.reference_id || "-")}</strong></div>
          <div style="grid-column: span 2;"><small>${I18N_PTBR.audit.drawer.notes}</small><strong>${escapeHtml(log.notes || log.message || "-")}</strong></div>
        </div>
      </section>
      <section class="drawer-section">
        <h4>${I18N_PTBR.audit.drawer.actions}</h4>
        <div class="drawer-inline-actions">
          <button class="btn sm" type="button" id="auditCopyJsonBtn-${log.id}"><i data-lucide="copy"></i>${I18N_PTBR.audit.actions.copy_json}</button>
          ${route ? `<button class="btn sm ghost" type="button" id="auditOpenRelatedBtn-${log.id}"><i data-lucide="external-link"></i>${I18N_PTBR.audit.actions.open_related}</button>` : ""}
        </div>
      </section>
    `,
    onOpen: (overlay, context) => {
      overlay.querySelector(`#auditCopyJsonBtn-${log.id}`)?.addEventListener("click", async () => {
        try {
          await copyToClipboard(buildAuditDetailJson(log));
          showToast({ title: I18N_PTBR.audit.title, message: I18N_PTBR.audit.toasts.copy_success, type: "success" });
        } catch {
          showToast({ title: I18N_PTBR.audit.title, message: I18N_PTBR.audit.toasts.copy_error, type: "error" });
        }
      });
      overlay.querySelector(`#auditOpenRelatedBtn-${log.id}`)?.addEventListener("click", () => {
        window.location.hash = route;
        context.close();
      });
      enhanceAuditDiffHighlight(overlay);
      refreshIcons();
    },
  });
}

function resetSingleFilter(key) {
  if (key === "userId") return updateAuditFilter("userId", "all");
  if (key === "action") return updateAuditFilter("action", "all");
  if (key === "resourceType") return updateAuditFilter("resourceType", "all");
  if (key === "period" || key === "customRange") return updateAuditFilter("period", "30");
  if (key === "criticalOnly") return updateAuditFilter("criticalOnly", false);
  if (key === "query") return updateAuditFilter("query", "");
}

async function refreshAuditData({ feedback = false } = {}) {
  const requestId = ++refreshSequence;
  setAuditLoading(true);
  const payload = await loadAuditPayload(state.audit.filters, state.audit.sort);
  if (requestId !== refreshSequence) return payload;
  setAuditPayload(payload);
  if (feedback) {
    showToast({
      title: I18N_PTBR.audit.title,
      message: payload.mode === "demo" ? I18N_PTBR.audit.toasts.fallback_demo : I18N_PTBR.audit.toasts.refreshed,
      type: payload.mode === "demo" ? "error" : "success",
    });
  }
  return payload;
}

const debouncedServerRefresh = debounce(() => {
  if (state.audit.mode === "api" && !state.audit.demoMode) refreshAuditData();
}, 360);

function bindShortcut() {
  if (shortcutBound) return;
  shortcutBound = true;
  document.addEventListener("keydown", (event) => {
    if (state.route !== "auditoria" || event.key !== "/") return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
    ) {
      return;
    }
    event.preventDefault();
    document.getElementById("auditSearchInput")?.focus();
  });
}

function bindEvents() {
  const searchInput = document.getElementById("auditSearchInput");
  const userFilter = document.getElementById("auditUserFilter");
  const actionFilter = document.getElementById("auditActionFilter");
  const resourceFilter = document.getElementById("auditResourceFilter");
  const periodFilter = document.getElementById("auditPeriodFilter");
  const customFrom = document.getElementById("auditCustomFrom");
  const customTo = document.getElementById("auditCustomTo");
  const criticalToggle = document.getElementById("auditCriticalOnlyToggle");
  const sortButton = document.getElementById("auditSortDateBtn");
  const prevButton = document.getElementById("auditPagePrevBtn");
  const nextButton = document.getElementById("auditPageNextBtn");
  const exportButton = document.getElementById("exportAuditCsvBtn");
  const clearButton = document.getElementById("clearAuditFiltersBtn");
  const toggleButton = document.getElementById("toggleAuditFiltersBtn");

  function maybeRefreshServer(filterKey) {
    if (SERVER_FILTER_KEYS.has(filterKey)) debouncedServerRefresh();
  }

  userFilter?.addEventListener("change", (event) => {
    updateAuditFilter("userId", event.target.value);
    maybeRefreshServer("userId");
  });
  actionFilter?.addEventListener("change", (event) => {
    updateAuditFilter("action", event.target.value);
    maybeRefreshServer("action");
  });
  resourceFilter?.addEventListener("change", (event) => {
    updateAuditFilter("resourceType", event.target.value);
    maybeRefreshServer("resourceType");
  });
  periodFilter?.addEventListener("change", (event) => {
    updateAuditFilter("period", event.target.value);
    maybeRefreshServer("period");
  });
  customFrom?.addEventListener("change", (event) => {
    updateAuditFilter("period", "custom");
    updateAuditFilter("customFrom", event.target.value);
    maybeRefreshServer("customFrom");
  });
  customTo?.addEventListener("change", (event) => {
    updateAuditFilter("period", "custom");
    updateAuditFilter("customTo", event.target.value);
    maybeRefreshServer("customTo");
  });
  criticalToggle?.addEventListener("change", (event) => {
    updateAuditFilter("criticalOnly", Boolean(event.target.checked));
    maybeRefreshServer("criticalOnly");
  });

  const searchDebounced = debounce((value) => {
    updateAuditFilter("query", value);
    maybeRefreshServer("query");
  }, 160);
  searchInput?.addEventListener("input", (event) => searchDebounced(event.target.value));

  exportButton?.addEventListener("click", () => {
    const exported = exportAuditCsv(buildView().rows);
    if (!exported) {
      return showToast({ title: I18N_PTBR.audit.title, message: I18N_PTBR.audit.toasts.csv_empty, type: "error" });
    }
    showToast({ title: I18N_PTBR.audit.title, message: I18N_PTBR.audit.toasts.csv_success, type: "success" });
  });

  clearButton?.addEventListener("click", () => {
    clearAuditFilters();
    if (state.audit.mode === "api" && !state.audit.demoMode) refreshAuditData();
    showToast({ title: I18N_PTBR.audit.title, message: I18N_PTBR.audit.toasts.filters_cleared, type: "success" });
  });

  toggleButton?.addEventListener("click", () => toggleAuditFiltersCollapsed());
  sortButton?.addEventListener("click", () => setAuditSort("occurred_at", state.audit.sort.order === "desc" ? "asc" : "desc"));
  prevButton?.addEventListener("click", () => setAuditPage(state.audit.pagination.page - 1));
  nextButton?.addEventListener("click", () => setAuditPage(state.audit.pagination.page + 1));

  document.querySelectorAll("[data-remove-audit-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-remove-audit-filter");
      if (!key) return;
      resetSingleFilter(key);
      maybeRefreshServer(key);
    });
  });

  document.querySelectorAll("[data-audit-details]").forEach((button) => {
    button.addEventListener("click", () => {
      const logId = button.getAttribute("data-audit-details");
      if (!logId) return;
      openAuditDetails(logId);
    });
  });
}

export function renderAudit() {
  bindShortcut();
  const pageContent = document.getElementById("pageContent");
  if (!pageContent) return;
  if (!state.audit.loaded && !state.audit.loading) refreshAuditData();
  if (state.audit.loading || !state.audit.loaded) {
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
  bindEvents();
}
