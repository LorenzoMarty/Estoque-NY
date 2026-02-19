/*
  Bibliotecas via CDN usadas nesta pagina:
  - Luxon: datas de criacao e ultimo acesso.
  - Tippy.js + Popper: tooltips acessiveis.
  - Lucide: icones SVG consistentes.

  Configuracao da API:
  - Ajuste `API_BASE_URL` em `frontend/js/api.js`.

  Endpoints consumidos:
  - GET `/users`
  - POST `/users`
  - PATCH `/users/{id}`
  - GET `/roles`
  - POST `/roles`
  - PATCH `/roles/{id}`
  - PATCH `/roles/{id}/permissions`

  Modo demonstracao:
  - Em falha da API, a pagina entra automaticamente em modo demo
    com usuarios e papeis simulados e banner discreto de aviso.
*/

import {
  createRole,
  createUser,
  loadUsersPayload,
  updateRole,
  updateRolePermissions,
  updateUser,
} from "./api.js";
import { I18N_PTBR } from "./i18n.js";
import {
  clearUsersFilters,
  mutateUsersData,
  setUsersLoading,
  setUsersPage,
  setUsersPayload,
  setUsersSort,
  state,
  toggleUsersFiltersCollapsed,
  updateUsersFilter,
} from "./state.js";
import { applyReveal, initTooltips, openDrawer, refreshIcons, showToast } from "./ui.js";
import {
  clamp,
  debounce,
  escapeHtml,
  formatDateTimePtBr,
  formatHourMinutePtBr,
  formatInt,
  resolvePeriodRange,
} from "./utils.js";
import { exportUsersCsv } from "./users_export.js";
import { openUserFormModal } from "./users_forms.js";
import { openRolesManagerModal } from "./users_permissions_ui.js";

const { DateTime } = window.luxon;

const SERVER_FILTER_KEYS = new Set([
  "status",
  "roleId",
  "period",
  "customFrom",
  "customTo",
  "adminsOnly",
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

function nextId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id || 0)), 0) + 1;
}

function roleLabel(role) {
  if (!role) return I18N_PTBR.users.defaults.role_unassigned;
  const code = String(role.code || "").toUpperCase();
  const mapped = I18N_PTBR.users.role_labels[code];
  return mapped || role.name || role.code || I18N_PTBR.users.defaults.role_unassigned;
}

function roleClass(role) {
  const code = String(role?.code || "").toUpperCase();
  if (code === "ADMIN") return "users-role-admin";
  if (code === "MANAGER") return "users-role-manager";
  if (code === "AUDITOR") return "users-role-auditor";
  return "users-role-operator";
}

function statusLabel(isActive) {
  return isActive ? I18N_PTBR.users.defaults.status_active : I18N_PTBR.users.defaults.status_inactive;
}

function roleById(data) {
  return new Map((data?.roles || []).map((role) => [Number(role.id), role]));
}

function compareUsers(left, right) {
  const direction = state.users.sort.order === "desc" ? -1 : 1;
  const key = state.users.sort.key;
  if (key === "last_login_at") {
    const leftDate = DateTime.fromISO(String(left.last_login_at || "")).toMillis() || 0;
    const rightDate = DateTime.fromISO(String(right.last_login_at || "")).toMillis() || 0;
    if (leftDate !== rightDate) return (leftDate - rightDate) * direction;
  }
  const byName = String(left.name || "").localeCompare(String(right.name || ""), "pt-BR");
  if (byName !== 0) return byName * direction;
  return (Number(left.id || 0) - Number(right.id || 0)) * direction;
}

function mapPeriodLabel(period) {
  if (period === "7") return I18N_PTBR.users.filters.period_7;
  if (period === "30") return I18N_PTBR.users.filters.period_30;
  if (period === "90") return I18N_PTBR.users.filters.period_90;
  if (period === "custom") return I18N_PTBR.users.filters.period_custom;
  return period;
}

function inSelectedPeriod(lastAccessIso, periodRange) {
  const parsed = DateTime.fromISO(String(lastAccessIso || ""));
  if (!parsed.isValid) return true;
  return parsed >= periodRange.from && parsed <= periodRange.to;
}

function buildActiveChips(view) {
  const filters = state.users.filters;
  const chips = [];
  if (filters.status !== "all") {
    chips.push({
      key: "status",
      label: `${I18N_PTBR.users.chips.status}: ${
        filters.status === "active"
          ? I18N_PTBR.users.filters.status_active
          : I18N_PTBR.users.filters.status_inactive
      }`,
    });
  }
  if (filters.roleId !== "all") {
    chips.push({
      key: "roleId",
      label: `${I18N_PTBR.users.chips.role}: ${
        roleLabel(view.roleById.get(Number(filters.roleId))) || filters.roleId
      }`,
    });
  }
  if (filters.period !== "30") {
    chips.push({
      key: "period",
      label: `${I18N_PTBR.users.chips.period}: ${mapPeriodLabel(filters.period)}`,
    });
  }
  if (filters.period === "custom") {
    chips.push({
      key: "customRange",
      label: `${I18N_PTBR.users.chips.custom_range}: ${filters.customFrom} -> ${filters.customTo}`,
    });
  }
  if (filters.adminsOnly) {
    chips.push({
      key: "adminsOnly",
      label: `${I18N_PTBR.users.chips.admins_only}: ON`,
    });
  }
  if (filters.query) {
    chips.push({
      key: "query",
      label: `${I18N_PTBR.users.chips.query}: ${filters.query}`,
    });
  }
  return chips;
}

function buildView() {
  const data = state.users.data;
  const filters = state.users.filters;
  const periodRange = resolvePeriodRange(filters);
  if (!data) {
    return {
      roleById: new Map(),
      rows: [],
      rowsPaged: [],
      roleOptions: [],
      chips: [],
      kpis: {
        activeUsers: 0,
        admins: 0,
        inactiveUsers: 0,
        recentLogins: 0,
      },
      pageInfo: { page: 1, totalPages: 1, totalRows: 0, start: 0, end: 0 },
    };
  }

  const roleMap = roleById(data);
  const queryTerm = normalize(filters.query);
  const rows = (data.users || []).filter((user) => {
    if (filters.status === "active" && !user.is_active) return false;
    if (filters.status === "inactive" && user.is_active) return false;
    if (filters.roleId !== "all" && Number(user.role_id) !== Number(filters.roleId)) return false;
    if (filters.adminsOnly && !user.is_admin) return false;
    if (!inSelectedPeriod(user.last_login_at, periodRange)) return false;
    if (queryTerm) {
      const haystack = normalize(`${user.name || ""} ${user.email || ""}`);
      if (!haystack.includes(queryTerm)) return false;
    }
    return true;
  });

  rows.sort(compareUsers);

  const totalRows = rows.length;
  const pageSize = state.users.pagination.pageSize;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = clamp(state.users.pagination.page, 1, totalPages);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const rowsPaged = rows.slice(startIndex, endIndex);

  return {
    roleById: roleMap,
    rows,
    rowsPaged,
    roleOptions: (data.roles || [])
      .slice()
      .sort((left, right) => roleLabel(left).localeCompare(roleLabel(right), "pt-BR")),
    chips: buildActiveChips({ roleById: roleMap }),
    kpis: {
      activeUsers: rows.filter((row) => row.is_active).length,
      admins: rows.filter((row) => row.is_admin).length,
      inactiveUsers: rows.filter((row) => !row.is_active).length,
      recentLogins: rows.filter((row) => {
        const lastAccess = DateTime.fromISO(String(row.last_login_at || ""));
        return lastAccess.isValid && lastAccess >= DateTime.now().minus({ hours: 24 });
      }).length,
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

function renderChipList(chips) {
  if (!chips.length) {
    return `<small class="chips-empty">${I18N_PTBR.users.defaults.empty_chips}</small>`;
  }
  return chips
    .map(
      (chip) => `
        <button class="filter-chip" data-remove-user-filter="${escapeHtml(
          chip.key
        )}" aria-label="${I18N_PTBR.users.actions.clear_chip}">
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
        <td colspan="6">
          <div class="empty-state">
            <i data-lucide="inbox"></i>
            <span>${I18N_PTBR.users.table.empty}</span>
          </div>
        </td>
      </tr>
    `;
  }

  return view.rowsPaged
    .map((user) => {
      const role = view.roleById.get(Number(user.role_id));
      const roleText = roleLabel(role);
      const roleBadgeClass = roleClass(role);
      const statusClass = user.is_active ? "status-pill-active" : "status-pill-inactive";
      return `
        <tr class="users-row">
          <td>${escapeHtml(user.name || "-")}</td>
          <td>${escapeHtml(user.email || "-")}</td>
          <td><span class="users-role-pill ${roleBadgeClass}">${escapeHtml(roleText)}</span></td>
          <td><span class="status-pill ${statusClass}">${escapeHtml(statusLabel(user.is_active))}</span></td>
          <td>${escapeHtml(
            user.last_login_at ? formatDateTimePtBr(user.last_login_at) : I18N_PTBR.users.defaults.no_access
          )}</td>
          <td>
            <div class="row-actions">
              <button class="btn sm ghost" data-user-action="edit" data-user-id="${user.id}">${I18N_PTBR.users.actions.edit}</button>
              <button class="btn sm ghost" data-user-action="status" data-user-id="${user.id}">
                ${user.is_active ? I18N_PTBR.users.actions.deactivate : I18N_PTBR.users.actions.activate}
              </button>
              <button class="btn sm ghost" data-user-action="permissions" data-user-id="${user.id}">${I18N_PTBR.users.actions.permissions}</button>
              <button class="btn sm ghost" data-user-action="details" data-user-id="${user.id}">${I18N_PTBR.users.actions.details}</button>
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
      </div>
      <div class="skeleton block" style="margin-top: 14px; height: 180px;"></div>
    </section>
    <section class="mini-kpi-grid">
      ${new Array(4)
        .fill("<article class='mini-kpi-card'><div class='skeleton block' style='height:96px;'></div></article>")
        .join("")}
    </section>
    <section class="panel table-card reveal">
      <div class="skeleton block" style="height: 360px;"></div>
    </section>
  `;
}

function renderKpis(view) {
  return `
    <section class="mini-kpi-grid">
      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="users-round"></i>
          <button class="kpi-help" data-tippy-content="${escapeHtml(
            I18N_PTBR.users.kpis.active_users.tooltip
          )}" aria-label="Ajuda usuarios ativos"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.users.kpis.active_users.label}</p>
        <strong>${formatInt(view.kpis.activeUsers)}</strong>
      </article>
      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="shield-check"></i>
          <button class="kpi-help" data-tippy-content="${escapeHtml(
            I18N_PTBR.users.kpis.admins.tooltip
          )}" aria-label="Ajuda administradores"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.users.kpis.admins.label}</p>
        <strong>${formatInt(view.kpis.admins)}</strong>
      </article>
      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="user-x"></i>
          <button class="kpi-help" data-tippy-content="${escapeHtml(
            I18N_PTBR.users.kpis.inactive_users.tooltip
          )}" aria-label="Ajuda contas inativas"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.users.kpis.inactive_users.label}</p>
        <strong>${formatInt(view.kpis.inactiveUsers)}</strong>
      </article>
      <article class="mini-kpi-card border-gradient reveal">
        <div class="mini-kpi-head">
          <i data-lucide="log-in"></i>
          <button class="kpi-help" data-tippy-content="${escapeHtml(
            I18N_PTBR.users.kpis.recent_logins.tooltip
          )}" aria-label="Ajuda logins 24h"><i data-lucide="circle-help"></i></button>
        </div>
        <p>${I18N_PTBR.users.kpis.recent_logins.label}</p>
        <strong>${formatInt(view.kpis.recentLogins)}</strong>
      </article>
    </section>
  `;
}

function renderLoadedState(view) {
  const data = state.users.data;
  const filters = state.users.filters;
  const filtersCollapsed = state.users.ui.filtersCollapsed;
  const customDisabled = filters.period !== "custom";
  const pageInfo = view.pageInfo;
  const nameSortTag =
    state.users.sort.key === "name" ? (state.users.sort.order === "asc" ? "A-Z" : "Z-A") : "";
  const lastSortTag =
    state.users.sort.key === "last_login_at"
      ? state.users.sort.order === "asc"
        ? "Antigo"
        : "Recente"
      : "";

  return `
    <section class="panel pad reveal">
      ${
        state.users.showDemoBanner
          ? `<div class="banner"><i data-lucide="flask-conical"></i>${I18N_PTBR.mode_demo_banner}</div>`
          : ""
      }
      <div class="page-head" style="margin-top:${state.users.showDemoBanner ? "12px" : "0"};">
        <div>
          <div class="breadcrumbs">${I18N_PTBR.users.breadcrumb}</div>
          <h1>${I18N_PTBR.users.title}</h1>
          <p class="section-subtitle">${I18N_PTBR.users.subtitle}</p>
          <small>${I18N_PTBR.last_update}: <strong>${formatHourMinutePtBr(
    state.users.lastUpdatedIso || data.generated_at
  )}</strong></small>
        </div>
        <div class="movements-actions users-actions">
          <div class="field users-search-field">
            <label for="userSearchInput">${I18N_PTBR.users.actions.global_search}</label>
            <input id="userSearchInput" type="search" value="${escapeHtml(
              filters.query
            )}" placeholder="${escapeHtml(I18N_PTBR.users.filters.search_placeholder)}" />
          </div>
          <button class="btn primary" id="newUserBtn"><i data-lucide="user-plus"></i>${
            I18N_PTBR.users.actions.new_user
          }</button>
          <button class="btn" id="manageRolesBtn"><i data-lucide="shield"></i>${
            I18N_PTBR.users.actions.manage_roles
          }</button>
          <button class="btn ghost" id="exportUsersCsvBtn"><i data-lucide="download"></i>${
            I18N_PTBR.users.actions.export_csv
          }</button>
          <button class="btn ghost" id="clearUsersFiltersBtn"><i data-lucide="x-circle"></i>${
            I18N_PTBR.users.actions.clear_filters
          }</button>
        </div>
      </div>

      <div class="movements-filter-toolbar">
        <button class="btn sm ghost" id="toggleUsersFiltersBtn" aria-expanded="${
          filtersCollapsed ? "false" : "true"
        }" aria-controls="usersFiltersPanel">
          <i data-lucide="${filtersCollapsed ? "chevron-down" : "chevron-up"}"></i>
          ${
            filtersCollapsed
              ? I18N_PTBR.users.actions.filter_show
              : I18N_PTBR.users.actions.filter_hide
          }
        </button>
      </div>

      <div class="movements-filters ${filtersCollapsed ? "is-collapsed" : ""}" id="usersFiltersPanel">
        <div class="movements-filter-grid users-filter-grid">
          <div class="field">
            <label for="usersStatusFilter">${I18N_PTBR.users.filters.status}</label>
            <select id="usersStatusFilter">
              <option value="all" ${
                filters.status === "all" ? "selected" : ""
              }>${I18N_PTBR.users.filters.status_all}</option>
              <option value="active" ${
                filters.status === "active" ? "selected" : ""
              }>${I18N_PTBR.users.filters.status_active}</option>
              <option value="inactive" ${
                filters.status === "inactive" ? "selected" : ""
              }>${I18N_PTBR.users.filters.status_inactive}</option>
            </select>
          </div>
          <div class="field">
            <label for="usersRoleFilter">${I18N_PTBR.users.filters.role}</label>
            <select id="usersRoleFilter">
              <option value="all">${I18N_PTBR.users.filters.role_all}</option>
              ${view.roleOptions
                .map(
                  (role) =>
                    `<option value="${role.id}" ${
                      String(filters.roleId) === String(role.id) ? "selected" : ""
                    }>${escapeHtml(roleLabel(role))}</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="field">
            <label for="usersPeriodFilter">${I18N_PTBR.users.filters.period}</label>
            <select id="usersPeriodFilter">
              <option value="7" ${filters.period === "7" ? "selected" : ""}>${
                I18N_PTBR.users.filters.period_7
              }</option>
              <option value="30" ${filters.period === "30" ? "selected" : ""}>${
                I18N_PTBR.users.filters.period_30
              }</option>
              <option value="90" ${filters.period === "90" ? "selected" : ""}>${
                I18N_PTBR.users.filters.period_90
              }</option>
              <option value="custom" ${filters.period === "custom" ? "selected" : ""}>${
                I18N_PTBR.users.filters.period_custom
              }</option>
            </select>
          </div>
          <div class="field users-toggle-field">
            <label for="usersAdminsOnlyToggle">${I18N_PTBR.users.filters.admins_only}</label>
            <label class="transfer-toggle-inline">
              <input id="usersAdminsOnlyToggle" type="checkbox" ${filters.adminsOnly ? "checked" : ""} />
              <span>${I18N_PTBR.users.filters.admins_only}</span>
            </label>
          </div>
          <div class="field">
            <label for="usersCustomFrom">${I18N_PTBR.users.filters.custom_from}</label>
            <input id="usersCustomFrom" type="date" value="${filters.customFrom}" ${
    customDisabled ? "disabled" : ""
  } />
          </div>
          <div class="field">
            <label for="usersCustomTo">${I18N_PTBR.users.filters.custom_to}</label>
            <input id="usersCustomTo" type="date" value="${filters.customTo}" ${
    customDisabled ? "disabled" : ""
  } />
          </div>
        </div>
      </div>

      <div class="reports-filter-meta"><small>${formatInt(view.rows.length)} ${
    I18N_PTBR.users.filters.results
  }</small></div>
      <div class="filter-chip-list">${renderChipList(view.chips)}</div>
    </section>

    ${renderKpis(view)}

    <section class="panel table-card reveal">
      <div class="table-head">
        <div>
          <h2 class="section-title">${I18N_PTBR.users.table.title}</h2>
          <p class="section-subtitle">${I18N_PTBR.users.table.subtitle}</p>
        </div>
        <div class="table-tools">
          <button class="btn sm ghost" id="refreshUsersBtn"><i data-lucide="refresh-cw"></i>${
            I18N_PTBR.users.actions.refresh
          }</button>
        </div>
      </div>
      <div class="table-wrap users-table-wrap">
        <table>
          <thead>
            <tr>
              <th><button class="table-sort-btn" id="usersSortNameBtn">${
                I18N_PTBR.users.table.name
              } ${nameSortTag}</button></th>
              <th>${I18N_PTBR.users.table.email}</th>
              <th>${I18N_PTBR.users.table.role}</th>
              <th>${I18N_PTBR.users.table.status}</th>
              <th><button class="table-sort-btn" id="usersSortLastAccessBtn">${
                I18N_PTBR.users.table.last_access
              } ${lastSortTag}</button></th>
              <th>${I18N_PTBR.users.table.actions}</th>
            </tr>
          </thead>
          <tbody>${renderRows(view)}</tbody>
        </table>
      </div>
      <div class="pagination">
        <small>${I18N_PTBR.users.table.pagination} ${pageInfo.start}-${pageInfo.end} ${
    I18N_PTBR.users.table.of
  } ${pageInfo.totalRows}</small>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn sm ghost" id="usersPrevPageBtn" ${
            pageInfo.page <= 1 ? "disabled" : ""
          }>Anterior</button>
          <small>${I18N_PTBR.users.table.page} ${pageInfo.page} ${I18N_PTBR.users.table.of} ${
    pageInfo.totalPages
  }</small>
          <button class="btn sm ghost" id="usersNextPageBtn" ${
            pageInfo.page >= pageInfo.totalPages ? "disabled" : ""
          }>Proxima</button>
        </div>
      </div>
    </section>
  `;
}

function buildEmptyPermissions() {
  const modules = [
    "dashboard",
    "movements",
    "products",
    "transfers",
    "count",
    "reports",
    "audit",
    "users",
  ];
  const actions = ["view", "create", "edit", "delete"];
  const matrix = {};
  modules.forEach((moduleKey) => {
    matrix[moduleKey] = {};
    actions.forEach((actionKey) => {
      matrix[moduleKey][actionKey] = false;
    });
  });
  return matrix;
}

function enrichRole(role) {
  return {
    ...role,
    name: compact(role.name) || compact(role.code) || I18N_PTBR.users.defaults.role_unassigned,
    code: compact(role.code) || compact(role.name).toUpperCase().replace(/\s+/g, "_"),
    permissions: role.permissions || buildEmptyPermissions(),
  };
}

function enrichUser(user, roleMap) {
  const role = roleMap.get(Number(user.role_id));
  return {
    ...user,
    name: compact(user.name),
    email: compact(user.email),
    role_name: roleLabel(role),
    role_code: role?.code || user.role_code || "",
    is_admin: String(role?.code || "").toUpperCase() === "ADMIN" || Boolean(user.is_admin),
  };
}

function findUserById(userId) {
  return (state.users.data?.users || []).find((user) => Number(user.id) === Number(userId)) || null;
}

function upsertRoleOnState(rolePayload) {
  if (!rolePayload) return;
  const role = enrichRole(rolePayload);
  mutateUsersData((draft) => {
    if (!Array.isArray(draft.roles)) {
      draft.roles = [];
    }
    const roleIndex = draft.roles.findIndex((row) => Number(row.id) === Number(role.id));
    if (roleIndex >= 0) {
      draft.roles[roleIndex] = { ...draft.roles[roleIndex], ...role };
    } else {
      draft.roles.push(role);
    }

    const roleMap = roleById(draft);
    draft.users = (draft.users || []).map((user) =>
      Number(user.role_id) === Number(role.id) ? enrichUser(user, roleMap) : user
    );
  });
}

function upsertUserOnState(userPayload, options = {}) {
  if (!userPayload) return;
  mutateUsersData((draft) => {
    if (!Array.isArray(draft.users)) {
      draft.users = [];
    }
    const roleMap = roleById(draft);
    const normalized = enrichUser(userPayload, roleMap);
    const index = draft.users.findIndex((row) => Number(row.id) === Number(normalized.id));
    if (index >= 0) {
      draft.users[index] = { ...draft.users[index], ...normalized };
    } else if (options.prepend === false) {
      draft.users.push(normalized);
    } else {
      draft.users.unshift(normalized);
    }
  });
}

function applyLocalUserSave({ mode, user, payload }) {
  if (mode === "create") {
    const rows = state.users.data?.users || [];
    const role = (state.users.data?.roles || []).find(
      (item) => Number(item.id) === Number(payload.role_id)
    );
    const nowIso = DateTime.now().toISO();
    return {
      id: nextId(rows),
      name: payload.name,
      email: payload.email,
      role_id: payload.role_id,
      role_name: roleLabel(role),
      role_code: role?.code || "",
      is_admin: String(role?.code || "").toUpperCase() === "ADMIN",
      is_active: payload.is_active !== false,
      created_at: nowIso,
      last_login_at: nowIso,
      recent_actions: [
        {
          id: `user-created-${Date.now()}`,
          label: I18N_PTBR.users.demo.action_created,
          at: nowIso,
        },
      ],
    };
  }

  if (!user) return null;
  const role = (state.users.data?.roles || []).find(
    (item) => Number(item.id) === Number(payload.role_id)
  );
  return {
    ...user,
    name: payload.name,
    email: payload.email,
    role_id: payload.role_id,
    role_name: roleLabel(role),
    role_code: role?.code || "",
    is_admin: String(role?.code || "").toUpperCase() === "ADMIN",
    is_active: payload.is_active !== false,
  };
}

async function saveUser({ mode, user, payload }) {
  try {
    let saved = null;
    if (state.users.mode === "api" && !state.users.demoMode) {
      if (mode === "create") {
        saved = await createUser(payload);
      } else {
        saved = await updateUser(user.id, payload);
      }
    } else {
      saved = applyLocalUserSave({ mode, user, payload });
    }

    if (!saved) {
      throw new Error("save_failed");
    }

    upsertUserOnState(saved, { prepend: mode === "create" });
    showToast({
      title: I18N_PTBR.users.title,
      message: mode === "create" ? I18N_PTBR.users.toasts.created : I18N_PTBR.users.toasts.updated,
      type: "success",
    });
    return true;
  } catch {
    showToast({
      title: I18N_PTBR.users.title,
      message: I18N_PTBR.users.toasts.error_generic,
      type: "error",
    });
    return false;
  }
}

async function toggleUserStatus(userId) {
  const current = findUserById(userId);
  if (!current) return false;
  const nextStatus = !current.is_active;
  const confirmMessage = nextStatus
    ? I18N_PTBR.users.toasts.confirm_activate
    : I18N_PTBR.users.toasts.confirm_deactivate;
  if (!window.confirm(confirmMessage)) {
    return false;
  }

  try {
    let saved = null;
    if (state.users.mode === "api" && !state.users.demoMode) {
      saved = await updateUser(userId, { is_active: nextStatus });
    } else {
      saved = { ...current, is_active: nextStatus };
    }
    if (!saved) {
      throw new Error("update_status_failed");
    }
    upsertUserOnState(saved);
    showToast({
      title: I18N_PTBR.users.title,
      message: I18N_PTBR.users.toasts.status_updated,
      type: "success",
    });
    return true;
  } catch {
    showToast({
      title: I18N_PTBR.users.title,
      message: I18N_PTBR.users.toasts.error_generic,
      type: "error",
    });
    return false;
  }
}

async function openRolesManager(initialRoleId = null) {
  openRolesManagerModal({
    roles: state.users.data?.roles || [],
    initialRoleId,
    onCreateRole: async ({ name }) => {
      try {
        let role = null;
        if (state.users.mode === "api" && !state.users.demoMode) {
          role = await createRole({ name });
        } else {
          const roles = state.users.data?.roles || [];
          role = {
            id: nextId(roles),
            name,
            code: compact(name).toUpperCase().replace(/\s+/g, "_"),
            permissions: buildEmptyPermissions(),
          };
        }
        upsertRoleOnState(role);
        showToast({
          title: I18N_PTBR.users.title,
          message: I18N_PTBR.users.toasts.role_updated,
          type: "success",
        });
        return role;
      } catch {
        showToast({
          title: I18N_PTBR.users.title,
          message: I18N_PTBR.users.toasts.error_generic,
          type: "error",
        });
        return null;
      }
    },
    onRenameRole: async ({ role, name }) => {
      try {
        let saved = null;
        if (state.users.mode === "api" && !state.users.demoMode) {
          saved = await updateRole(role.id, { name });
        } else {
          saved = { ...role, name };
        }
        upsertRoleOnState(saved);
        showToast({
          title: I18N_PTBR.users.title,
          message: I18N_PTBR.users.toasts.role_updated,
          type: "success",
        });
        return saved;
      } catch {
        showToast({
          title: I18N_PTBR.users.title,
          message: I18N_PTBR.users.toasts.error_generic,
          type: "error",
        });
        return null;
      }
    },
    onSavePermissions: async ({ role, permissions }) => {
      try {
        let saved = null;
        if (state.users.mode === "api" && !state.users.demoMode) {
          saved = await updateRolePermissions(role.id, permissions);
        } else {
          saved = { ...role, permissions };
        }
        upsertRoleOnState(saved);
        showToast({
          title: I18N_PTBR.users.title,
          message: I18N_PTBR.users.toasts.permissions_updated,
          type: "success",
        });
        return saved;
      } catch {
        showToast({
          title: I18N_PTBR.users.title,
          message: I18N_PTBR.users.toasts.error_generic,
          type: "error",
        });
        return null;
      }
    },
  });
}

function renderRecentActions(user) {
  const rows = Array.isArray(user.recent_actions) ? user.recent_actions : [];
  if (!rows.length) {
    return `<p class="section-subtitle">${I18N_PTBR.users.drawer.empty_actions}</p>`;
  }
  return `
    <div class="transfer-timeline">
      ${rows
        .map(
          (row) => `
            <div class="transfer-timeline-item">
              <span class="transfer-timeline-dot"></span>
              <div>
                <strong>${escapeHtml(row.label || "-")}</strong>
                <small>${escapeHtml(formatDateTimePtBr(row.at))}</small>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function openDetailsDrawer(userId, view) {
  const user = findUserById(userId);
  if (!user) return;
  const role = view.roleById.get(Number(user.role_id));
  openDrawer({
    title: I18N_PTBR.users.drawer.title,
    subtitle: `${escapeHtml(user.name || "-")} - ${escapeHtml(statusLabel(user.is_active))}`,
    bodyHtml: `
      <section class="drawer-section">
        <h4>${I18N_PTBR.users.drawer.general}</h4>
        <div class="drawer-grid">
          <div><small>${I18N_PTBR.users.drawer.name}</small><strong>${escapeHtml(
      user.name || "-"
    )}</strong></div>
          <div><small>${I18N_PTBR.users.drawer.email}</small><strong>${escapeHtml(
      user.email || "-"
    )}</strong></div>
          <div><small>${I18N_PTBR.users.drawer.role}</small><strong>${escapeHtml(
      roleLabel(role)
    )}</strong></div>
          <div><small>${I18N_PTBR.users.drawer.status}</small><strong>${escapeHtml(
      statusLabel(user.is_active)
    )}</strong></div>
          <div><small>${I18N_PTBR.users.drawer.created_at}</small><strong>${escapeHtml(
      formatDateTimePtBr(user.created_at)
    )}</strong></div>
          <div><small>${I18N_PTBR.users.drawer.last_access}</small><strong>${escapeHtml(
      user.last_login_at ? formatDateTimePtBr(user.last_login_at) : I18N_PTBR.users.defaults.no_access
    )}</strong></div>
        </div>
      </section>
      <section class="drawer-section">
        <h4>${I18N_PTBR.users.drawer.recent_actions}</h4>
        ${renderRecentActions(user)}
      </section>
      <section class="drawer-section">
        <h4>${I18N_PTBR.users.drawer.actions}</h4>
        <div class="drawer-inline-actions">
          <button class="btn sm" type="button" id="usersDrawerEditBtn"><i data-lucide="pencil"></i>${I18N_PTBR.users.actions.edit}</button>
          <button class="btn sm ghost" type="button" id="usersDrawerResetBtn"><i data-lucide="key-round"></i>${I18N_PTBR.users.drawer.reset_password}</button>
          <button class="btn sm ghost" type="button" id="usersDrawerRoleBtn"><i data-lucide="shield"></i>${I18N_PTBR.users.drawer.change_role}</button>
          <button class="btn sm ghost" type="button" id="usersDrawerStatusBtn"><i data-lucide="user-cog"></i>${
            user.is_active ? I18N_PTBR.users.actions.deactivate : I18N_PTBR.users.actions.activate
          }</button>
        </div>
      </section>
    `,
    footerHtml: `<div class="drawer-footer"><button class="btn ghost" type="button" data-close-drawer>${I18N_PTBR.users.drawer.close}</button></div>`,
    onOpen: (overlay, helpers) => {
      overlay.querySelector("#usersDrawerEditBtn")?.addEventListener("click", () => {
        helpers.close();
        openUserFormModal({
          mode: "edit",
          user,
          roles: state.users.data?.roles || [],
          onSubmit: saveUser,
        });
      });
      overlay.querySelector("#usersDrawerResetBtn")?.addEventListener("click", () => {
        showToast({
          title: I18N_PTBR.users.title,
          message: I18N_PTBR.users.toasts.password_reset,
          type: "success",
        });
      });
      overlay.querySelector("#usersDrawerRoleBtn")?.addEventListener("click", () => {
        helpers.close();
        openUserFormModal({
          mode: "edit",
          user,
          roles: state.users.data?.roles || [],
          onSubmit: saveUser,
        });
      });
      overlay.querySelector("#usersDrawerStatusBtn")?.addEventListener("click", async () => {
        const changed = await toggleUserStatus(user.id);
        if (changed) {
          helpers.close();
        }
      });
      refreshIcons();
    },
  });
}

function resetSingleFilter(key) {
  if (key === "status") return updateUsersFilter("status", "all");
  if (key === "roleId") return updateUsersFilter("roleId", "all");
  if (key === "period" || key === "customRange") return updateUsersFilter("period", "30");
  if (key === "adminsOnly") return updateUsersFilter("adminsOnly", false);
  if (key === "query") return updateUsersFilter("query", "");
}

async function refreshUsersData({ feedback = false } = {}) {
  const requestId = ++refreshSequence;
  setUsersLoading(true);
  const payload = await loadUsersPayload(state.users.filters, state.users.sort);
  if (requestId !== refreshSequence) return payload;
  setUsersPayload(payload);
  if (feedback) {
    showToast({
      title: I18N_PTBR.users.title,
      message:
        payload.mode === "demo" ? I18N_PTBR.users.toasts.fallback_demo : I18N_PTBR.users.toasts.refreshed,
      type: payload.mode === "demo" ? "error" : "success",
    });
  }
  return payload;
}

const debouncedServerRefresh = debounce((key) => {
  if (!SERVER_FILTER_KEYS.has(key)) return;
  if (state.users.mode === "api" && !state.users.demoMode) {
    refreshUsersData();
  }
}, 360);

function bindShortcut() {
  if (shortcutBound) return;
  shortcutBound = true;
  document.addEventListener("keydown", (event) => {
    if (state.route !== "usuarios" || event.key !== "/") return;
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
    document.getElementById("userSearchInput")?.focus();
  });
}

function bindEvents(view) {
  const searchInput = document.getElementById("userSearchInput");
  const statusFilter = document.getElementById("usersStatusFilter");
  const roleFilter = document.getElementById("usersRoleFilter");
  const periodFilter = document.getElementById("usersPeriodFilter");
  const customFrom = document.getElementById("usersCustomFrom");
  const customTo = document.getElementById("usersCustomTo");
  const adminsOnly = document.getElementById("usersAdminsOnlyToggle");
  const toggleFilters = document.getElementById("toggleUsersFiltersBtn");
  const clearFilters = document.getElementById("clearUsersFiltersBtn");
  const refreshButton = document.getElementById("refreshUsersBtn");
  const exportButton = document.getElementById("exportUsersCsvBtn");
  const newUserButton = document.getElementById("newUserBtn");
  const manageRolesButton = document.getElementById("manageRolesBtn");
  const sortByNameButton = document.getElementById("usersSortNameBtn");
  const sortByLastButton = document.getElementById("usersSortLastAccessBtn");
  const prevPageButton = document.getElementById("usersPrevPageBtn");
  const nextPageButton = document.getElementById("usersNextPageBtn");

  statusFilter?.addEventListener("change", (event) => {
    updateUsersFilter("status", event.target.value);
    debouncedServerRefresh("status");
  });
  roleFilter?.addEventListener("change", (event) => {
    updateUsersFilter("roleId", event.target.value);
    debouncedServerRefresh("roleId");
  });
  periodFilter?.addEventListener("change", (event) => {
    updateUsersFilter("period", event.target.value);
    debouncedServerRefresh("period");
  });
  customFrom?.addEventListener("change", (event) => {
    updateUsersFilter("period", "custom");
    updateUsersFilter("customFrom", event.target.value);
    debouncedServerRefresh("customFrom");
  });
  customTo?.addEventListener("change", (event) => {
    updateUsersFilter("period", "custom");
    updateUsersFilter("customTo", event.target.value);
    debouncedServerRefresh("customTo");
  });
  adminsOnly?.addEventListener("change", (event) => {
    updateUsersFilter("adminsOnly", Boolean(event.target.checked));
    debouncedServerRefresh("adminsOnly");
  });

  const debouncedSearch = debounce((value) => {
    updateUsersFilter("query", value);
    debouncedServerRefresh("query");
  }, 150);
  searchInput?.addEventListener("input", (event) => {
    debouncedSearch(event.target.value);
  });

  toggleFilters?.addEventListener("click", () => toggleUsersFiltersCollapsed());
  clearFilters?.addEventListener("click", () => {
    clearUsersFilters();
    if (state.users.mode === "api" && !state.users.demoMode) refreshUsersData();
    showToast({
      title: I18N_PTBR.users.title,
      message: I18N_PTBR.users.toasts.filters_cleared,
      type: "success",
    });
  });
  refreshButton?.addEventListener("click", () => refreshUsersData({ feedback: true }));

  exportButton?.addEventListener("click", () => {
    const exported = exportUsersCsv(buildView().rows);
    if (!exported) {
      showToast({
        title: I18N_PTBR.users.title,
        message: I18N_PTBR.users.toasts.csv_empty,
        type: "error",
      });
      return;
    }
    showToast({
      title: I18N_PTBR.users.title,
      message: I18N_PTBR.users.toasts.csv_success,
      type: "success",
    });
  });

  newUserButton?.addEventListener("click", () => {
    openUserFormModal({
      mode: "create",
      roles: state.users.data?.roles || [],
      onSubmit: saveUser,
    });
  });

  manageRolesButton?.addEventListener("click", () => {
    openRolesManager();
  });

  sortByNameButton?.addEventListener("click", () => {
    const nextOrder =
      state.users.sort.key === "name" && state.users.sort.order === "asc" ? "desc" : "asc";
    setUsersSort("name", nextOrder);
  });
  sortByLastButton?.addEventListener("click", () => {
    const nextOrder =
      state.users.sort.key === "last_login_at" && state.users.sort.order === "desc" ? "asc" : "desc";
    setUsersSort("last_login_at", nextOrder);
  });
  prevPageButton?.addEventListener("click", () => setUsersPage(state.users.pagination.page - 1));
  nextPageButton?.addEventListener("click", () => setUsersPage(state.users.pagination.page + 1));

  document.querySelectorAll("[data-remove-user-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-remove-user-filter");
      if (!key) return;
      resetSingleFilter(key);
      debouncedServerRefresh(key);
    });
  });

  document.querySelectorAll("[data-user-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.getAttribute("data-user-action");
      const userId = Number(button.getAttribute("data-user-id"));
      if (!action || !Number.isFinite(userId)) return;
      const current = findUserById(userId);
      if (!current) return;

      if (action === "edit") {
        openUserFormModal({
          mode: "edit",
          user: current,
          roles: state.users.data?.roles || [],
          onSubmit: saveUser,
        });
        return;
      }

      if (action === "status") {
        await toggleUserStatus(userId);
        return;
      }

      if (action === "permissions") {
        openRolesManager(current.role_id);
        return;
      }

      if (action === "details") {
        openDetailsDrawer(userId, view);
      }
    });
  });
}

export function renderUsers() {
  bindShortcut();
  const pageContent = document.getElementById("pageContent");
  if (!pageContent) return;
  if (!state.users.loaded && !state.users.loading) refreshUsersData();
  if (state.users.loading || !state.users.loaded) {
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
