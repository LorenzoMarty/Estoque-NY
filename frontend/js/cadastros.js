import {
  createAdminBrand,
  createAdminBranch,
  createAdminLocation,
  deleteAdminBrand,
  deleteAdminBranch,
  deleteAdminLocation,
  hasAuthToken,
  listAdminBrands,
  listAdminBranches,
  listAdminLocations,
  updateAdminBrand,
  updateAdminBranch,
  updateAdminLocation,
} from "./api.js";
import { I18N_PTBR } from "./i18n.js";
import { state } from "./state.js";
import { applyReveal, initTooltips, openDrawer, refreshIcons, showToast } from "./ui.js";
import { debounce, escapeHtml, formatDateTimePtBr } from "./utils.js";

const LOCATION_TYPES = ["STORE", "STOCK", "DAMAGED"];
const TABLE_PAGE_SIZE = 10;

function createEntityState() {
  return {
    page: 1,
    pageSize: TABLE_PAGE_SIZE,
    q: "",
    sort: "name",
    order: "asc",
    branchId: "all",
    items: [],
    meta: {
      page: 1,
      page_size: TABLE_PAGE_SIZE,
      total: 0,
      next: null,
      prev: null,
    },
    loading: false,
    loaded: false,
    error: "",
  };
}

const cadastrosRuntime = {
  activeTab: "branches",
  branchesCache: [],
  branchesLoaded: false,
  tabs: {
    brands: createEntityState(),
    branches: createEntityState(),
    locations: createEntityState(),
  },
};

function getTabLabel(tabKey) {
  return I18N_PTBR.cadastros.tabs[tabKey] || tabKey;
}

function activeTabState() {
  return cadastrosRuntime.tabs[cadastrosRuntime.activeTab];
}

function normalizePagedPayload(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const meta = {
    page: Number(payload?.meta?.page || 1),
    page_size: Number(payload?.meta?.page_size || TABLE_PAGE_SIZE),
    total: Number(payload?.meta?.total || items.length || 0),
    next: payload?.meta?.next == null ? null : Number(payload.meta.next),
    prev: payload?.meta?.prev == null ? null : Number(payload.meta.prev),
  };
  return { items, meta };
}

function resolveErrorMessage(error, fallback = I18N_PTBR.cadastros.states.error) {
  if (typeof error?.payload?.error?.message === "string" && error.payload.error.message) {
    return error.payload.error.message;
  }
  if (typeof error?.payload?.detail === "string" && error.payload.detail) {
    return error.payload.detail;
  }
  if (typeof error?.message === "string" && error.message) {
    return error.message;
  }
  return fallback;
}

function branchNameById(branchId) {
  const row = cadastrosRuntime.branchesCache.find((branch) => Number(branch.id) === Number(branchId));
  return row?.name || `Filial ${branchId}`;
}

async function ensureBranchesCache() {
  if (cadastrosRuntime.branchesLoaded) return;
  if (!hasAuthToken()) return;
  const payload = await listAdminBranches({
    page: 1,
    pageSize: 400,
    sort: "name",
    order: "asc",
  });
  const normalized = normalizePagedPayload(payload);
  cadastrosRuntime.branchesCache = normalized.items;
  cadastrosRuntime.branchesLoaded = true;
}

function resetFiltersForActiveTab() {
  const tab = activeTabState();
  tab.q = "";
  tab.page = 1;
  if (cadastrosRuntime.activeTab === "locations") {
    tab.branchId = "all";
  }
}

async function loadActiveTabData() {
  const tab = activeTabState();
  tab.loading = true;
  tab.error = "";
  renderCadastros();

  if (!hasAuthToken()) {
    tab.loading = false;
    tab.loaded = true;
    tab.items = [];
    tab.meta = { ...tab.meta, total: 0, next: null, prev: null };
    tab.error = I18N_PTBR.cadastros.states.auth_required;
    renderCadastros();
    return;
  }

  try {
    if (cadastrosRuntime.activeTab === "brands") {
      const payload = await listAdminBrands({
        page: tab.page,
        pageSize: tab.pageSize,
        sort: tab.sort,
        order: tab.order,
        q: tab.q,
      });
      const normalized = normalizePagedPayload(payload);
      tab.items = normalized.items;
      tab.meta = normalized.meta;
    } else if (cadastrosRuntime.activeTab === "branches") {
      const payload = await listAdminBranches({
        page: tab.page,
        pageSize: tab.pageSize,
        sort: tab.sort,
        order: tab.order,
        q: tab.q,
      });
      const normalized = normalizePagedPayload(payload);
      tab.items = normalized.items;
      tab.meta = normalized.meta;
      cadastrosRuntime.branchesCache = normalized.items;
    } else {
      await ensureBranchesCache();
      const payload = await listAdminLocations({
        page: tab.page,
        pageSize: tab.pageSize,
        sort: tab.sort,
        order: tab.order,
        q: tab.q,
        branchId: tab.branchId,
      });
      const normalized = normalizePagedPayload(payload);
      tab.items = normalized.items;
      tab.meta = normalized.meta;
    }

    tab.loaded = true;
  } catch (error) {
    tab.error = resolveErrorMessage(error);
    tab.items = [];
    tab.meta = {
      page: 1,
      page_size: tab.pageSize,
      total: 0,
      next: null,
      prev: null,
    };
  } finally {
    tab.loading = false;
    if (state.route === "cadastros") {
      renderCadastros();
    }
  }
}

function renderTabs() {
  return ["branches", "locations", "brands"]
    .map((tabKey) => {
      const activeClass = cadastrosRuntime.activeTab === tabKey ? "is-active" : "";
      return `
        <button class="btn sm ${activeClass ? "primary" : "ghost"}" type="button" data-cad-tab="${tabKey}">
          ${getTabLabel(tabKey)}
        </button>
      `;
    })
    .join("");
}

function renderBranchFilter() {
  if (cadastrosRuntime.activeTab !== "locations") return "";
  const tab = activeTabState();
  const branchOptions = [
    `<option value="all">${I18N_PTBR.cadastros.labels.branch_all}</option>`,
    ...cadastrosRuntime.branchesCache.map(
      (branch) =>
        `<option value="${branch.id}" ${
          String(tab.branchId) === String(branch.id) ? "selected" : ""
        }>${escapeHtml(branch.name)}</option>`
    ),
  ].join("");

  return `
    <div class="field">
      <label for="cadBranchFilter">${I18N_PTBR.cadastros.labels.branch_filter}</label>
      <select id="cadBranchFilter">${branchOptions}</select>
    </div>
  `;
}

function renderTableRows() {
  const tab = activeTabState();
  if (!tab.items.length) {
    return `
      <tr>
        <td colspan="${cadastrosRuntime.activeTab === "locations" ? 5 : 4}">
          <div class="empty-state">
            <i data-lucide="inbox"></i>
            <span>${I18N_PTBR.cadastros.states.empty}</span>
          </div>
        </td>
      </tr>
    `;
  }

  return tab.items
    .map((row) => {
      const branchCell =
        cadastrosRuntime.activeTab === "locations"
          ? `<td>${escapeHtml(branchNameById(row.branch_id))}</td>`
          : "";
      const typeCell =
        cadastrosRuntime.activeTab === "locations"
          ? `<td><span class="type-pill type-pill-transfer">${escapeHtml(row.type || "-")}</span></td>`
          : "";
      const createdAtCell =
        cadastrosRuntime.activeTab !== "locations"
          ? `<td>${formatDateTimePtBr(row.created_at)}</td>`
          : "";
      return `
        <tr>
          <td>${row.id}</td>
          <td>${escapeHtml(row.name || "-")}</td>
          ${branchCell}
          ${typeCell}
          ${createdAtCell}
          <td>
            <div class="table-actions-row">
              <button class="btn sm ghost" type="button" data-cad-edit="${row.id}">
                <i data-lucide="pencil"></i>${I18N_PTBR.cadastros.table.edit}
              </button>
              <button class="btn sm ghost" type="button" data-cad-delete="${row.id}">
                <i data-lucide="trash-2"></i>${I18N_PTBR.cadastros.table.delete}
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderTableHead() {
  if (cadastrosRuntime.activeTab === "locations") {
    return `
      <tr>
        <th>${I18N_PTBR.cadastros.table.id}</th>
        <th>${I18N_PTBR.cadastros.table.name}</th>
        <th>${I18N_PTBR.cadastros.table.branch}</th>
        <th>${I18N_PTBR.cadastros.table.type}</th>
        <th>${I18N_PTBR.cadastros.table.actions}</th>
      </tr>
    `;
  }
  return `
    <tr>
      <th>${I18N_PTBR.cadastros.table.id}</th>
      <th>${I18N_PTBR.cadastros.table.name}</th>
      <th>${I18N_PTBR.cadastros.table.created_at}</th>
      <th>${I18N_PTBR.cadastros.table.actions}</th>
    </tr>
  `;
}

function renderMobileCards() {
  const tab = activeTabState();
  if (!tab.items.length) {
    return `
      <article class="panel pad border-gradient cad-mobile-card reveal cad-mobile-empty">
        <div class="empty-state">
          <i data-lucide="inbox"></i>
          <span>${I18N_PTBR.cadastros.states.empty}</span>
        </div>
      </article>
    `;
  }

  return `
    <div class="cad-mobile-card-list">
      ${tab.items
        .map((row) => {
          const extraBranch =
            cadastrosRuntime.activeTab === "locations"
              ? `<p><small>${I18N_PTBR.cadastros.table.branch}</small><strong>${escapeHtml(
                  branchNameById(row.branch_id)
                )}</strong></p>`
              : "";
          const extraType =
            cadastrosRuntime.activeTab === "locations"
              ? `<p><small>${I18N_PTBR.cadastros.table.type}</small><strong>${escapeHtml(
                  row.type || "-"
                )}</strong></p>`
              : `<p><small>${I18N_PTBR.cadastros.table.created_at}</small><strong>${formatDateTimePtBr(
                  row.created_at
                )}</strong></p>`;
          return `
            <article class="panel pad border-gradient cad-mobile-card reveal">
              <div class="cad-mobile-card-head">
                <h3>${escapeHtml(row.name || "-")}</h3>
                <span>#${row.id}</span>
              </div>
              ${extraBranch}
              ${extraType}
              <div class="table-actions-row">
                <button class="btn sm ghost" type="button" data-cad-edit="${row.id}">
                  <i data-lucide="pencil"></i>${I18N_PTBR.cadastros.table.edit}
                </button>
                <button class="btn sm ghost" type="button" data-cad-delete="${row.id}">
                  <i data-lucide="trash-2"></i>${I18N_PTBR.cadastros.table.delete}
                </button>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderPagination() {
  const tab = activeTabState();
  const total = Number(tab.meta.total || 0);
  const page = Number(tab.meta.page || 1);
  const pageSize = Number(tab.meta.page_size || tab.pageSize || TABLE_PAGE_SIZE);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(total, start + pageSize - 1);

  return `
    <div class="cad-pagination">
      <p>
        ${I18N_PTBR.cadastros.pagination.showing}
        <strong>${start}-${end}</strong>
        ${I18N_PTBR.cadastros.pagination.of}
        <strong>${total}</strong>
      </p>
      <div class="table-actions-row">
        <button class="btn sm ghost" type="button" data-cad-prev ${tab.meta.prev ? "" : "disabled"}>
          ${I18N_PTBR.cadastros.pagination.previous}
        </button>
        <span>${I18N_PTBR.cadastros.pagination.page} ${page}</span>
        <button class="btn sm ghost" type="button" data-cad-next ${tab.meta.next ? "" : "disabled"}>
          ${I18N_PTBR.cadastros.pagination.next}
        </button>
      </div>
    </div>
  `;
}

function renderContentState() {
  const tab = activeTabState();
  if (tab.loading) {
    return `
      <article class="panel pad border-gradient reveal">
        <div class="skeleton" style="height: 20px; width: 240px;"></div>
        <div class="skeleton" style="height: 16px; width: 100%; margin-top: 10px;"></div>
        <div class="skeleton" style="height: 16px; width: 100%; margin-top: 8px;"></div>
        <div class="skeleton" style="height: 16px; width: 70%; margin-top: 8px;"></div>
      </article>
    `;
  }
  if (tab.error) {
    return `
      <article class="panel pad border-gradient reveal">
        <div class="banner">
          <i data-lucide="alert-triangle"></i>
          ${escapeHtml(tab.error)}
        </div>
      </article>
    `;
  }
  return `
    <article class="panel border-gradient reveal">
      <div class="table-wrap cad-table-wrap">
        <table>
          <thead>${renderTableHead()}</thead>
          <tbody>${renderTableRows()}</tbody>
        </table>
      </div>
      ${renderPagination()}
    </article>
    ${renderMobileCards()}
  `;
}

function currentRowsById() {
  return new Map(activeTabState().items.map((row) => [Number(row.id), row]));
}

function formTitle(mode) {
  if (cadastrosRuntime.activeTab === "brands") {
    return mode === "create"
      ? I18N_PTBR.cadastros.form.create_brand
      : I18N_PTBR.cadastros.form.edit_brand;
  }
  if (cadastrosRuntime.activeTab === "branches") {
    return mode === "create"
      ? I18N_PTBR.cadastros.form.create_branch
      : I18N_PTBR.cadastros.form.edit_branch;
  }
  return mode === "create"
    ? I18N_PTBR.cadastros.form.create_location
    : I18N_PTBR.cadastros.form.edit_location;
}

function buildLocationTypeOptions(selectedValue = "") {
  return LOCATION_TYPES.map((locationType) => {
    const selected = String(selectedValue) === String(locationType) ? "selected" : "";
    return `<option value="${locationType}" ${selected}>${locationType}</option>`;
  }).join("");
}

function buildBranchOptions(selectedValue = "") {
  return cadastrosRuntime.branchesCache
    .map((branch) => {
      const selected = String(selectedValue) === String(branch.id) ? "selected" : "";
      return `<option value="${branch.id}" ${selected}>${escapeHtml(branch.name)}</option>`;
    })
    .join("");
}

async function openEntityFormModal(mode = "create", row = null) {
  if (cadastrosRuntime.activeTab === "locations") {
    await ensureBranchesCache();
  }

  openDrawer({
    title: formTitle(mode),
    subtitle: I18N_PTBR.cadastros.subtitle,
    submitLabel: mode === "create" ? I18N_PTBR.cadastros.form.save_create : I18N_PTBR.cadastros.form.save_edit,
    cancelLabel: I18N_PTBR.cadastros.form.cancel,
    bodyHtml: `
      <div class="field-row">
        <div class="field">
          <label for="cadNameInput">${I18N_PTBR.cadastros.form.name}</label>
          <input id="cadNameInput" name="name" type="text" maxlength="120" required value="${escapeHtml(
            row?.name || ""
          )}" />
        </div>
        ${
          cadastrosRuntime.activeTab === "locations"
            ? `
              <div class="field">
                <label for="cadBranchInput">${I18N_PTBR.cadastros.form.branch}</label>
                <select id="cadBranchInput" name="branch_id" required>
                  <option value="">Selecione...</option>
                  ${buildBranchOptions(String(row?.branch_id || ""))}
                </select>
              </div>
              <div class="field">
                <label for="cadTypeInput">${I18N_PTBR.cadastros.form.type}</label>
                <select id="cadTypeInput" name="type" required>
                  <option value="">Selecione...</option>
                  ${buildLocationTypeOptions(String(row?.type || ""))}
                </select>
              </div>
            `
            : ""
        }
      </div>
    `,
    initialFocusSelector: "#cadNameInput",
    onSubmit: async (formData, helpers) => {
      const name = String(formData.get("name") || "").trim();
      if (!name) {
        helpers.setError(I18N_PTBR.cadastros.form.validation_name);
        return false;
      }

      try {
        if (cadastrosRuntime.activeTab === "brands") {
          if (mode === "create") {
            await createAdminBrand({ name });
          } else {
            await updateAdminBrand(row.id, { name });
          }
        } else if (cadastrosRuntime.activeTab === "branches") {
          if (mode === "create") {
            await createAdminBranch({ name });
          } else {
            await updateAdminBranch(row.id, { name });
          }
          cadastrosRuntime.branchesLoaded = false;
        } else {
          const branchId = Number(formData.get("branch_id"));
          const type = String(formData.get("type") || "").trim();
          if (!Number.isFinite(branchId) || branchId <= 0) {
            helpers.setError(I18N_PTBR.cadastros.form.validation_branch);
            return false;
          }
          if (!type) {
            helpers.setError(I18N_PTBR.cadastros.form.validation_type);
            return false;
          }
          if (mode === "create") {
            await createAdminLocation({
              name,
              branch_id: branchId,
              type,
            });
          } else {
            await updateAdminLocation(row.id, {
              name,
              branch_id: branchId,
              type,
            });
          }
        }

        showToast({
          title: I18N_PTBR.cadastros.title,
          message:
            mode === "create"
              ? I18N_PTBR.cadastros.toasts.created
              : I18N_PTBR.cadastros.toasts.updated,
          type: "success",
        });
        activeTabState().page = 1;
        await loadActiveTabData();
        return true;
      } catch (error) {
        helpers.setError(resolveErrorMessage(error));
        return false;
      }
    },
  });
}

async function handleDelete(row) {
  const confirmed = window.confirm(
    `${I18N_PTBR.cadastros.confirm_delete.body}\n\n${row.name || `#${row.id}`}`
  );
  if (!confirmed) return;

  try {
    if (cadastrosRuntime.activeTab === "brands") {
      await deleteAdminBrand(row.id);
    } else if (cadastrosRuntime.activeTab === "branches") {
      await deleteAdminBranch(row.id);
      cadastrosRuntime.branchesLoaded = false;
    } else {
      await deleteAdminLocation(row.id);
    }
    showToast({
      title: I18N_PTBR.cadastros.title,
      message: I18N_PTBR.cadastros.toasts.deleted,
      type: "success",
    });
    await loadActiveTabData();
  } catch (error) {
    showToast({
      title: I18N_PTBR.cadastros.title,
      message: resolveErrorMessage(error),
      type: "error",
    });
  }
}

function bindEvents() {
  const tab = activeTabState();
  const rowsById = currentRowsById();

  document.querySelectorAll("[data-cad-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      const nextTab = button.getAttribute("data-cad-tab");
      if (!nextTab || !cadastrosRuntime.tabs[nextTab]) return;
      cadastrosRuntime.activeTab = nextTab;
      if (!cadastrosRuntime.tabs[nextTab].loaded) {
        await loadActiveTabData();
        return;
      }
      renderCadastros();
    });
  });

  const debouncedSearch = debounce(async (value) => {
    tab.q = String(value || "");
    tab.page = 1;
    await loadActiveTabData();
  }, 260);

  document.getElementById("cadSearchInput")?.addEventListener("input", (event) => {
    debouncedSearch(event.target.value);
  });

  document.getElementById("cadBranchFilter")?.addEventListener("change", async (event) => {
    tab.branchId = event.target.value;
    tab.page = 1;
    await loadActiveTabData();
  });

  document.getElementById("cadRefreshBtn")?.addEventListener("click", async () => {
    await loadActiveTabData();
  });

  document.getElementById("cadClearBtn")?.addEventListener("click", async () => {
    resetFiltersForActiveTab();
    await loadActiveTabData();
  });

  document.getElementById("cadCreateBtn")?.addEventListener("click", async () => {
    await openEntityFormModal("create");
  });

  document.querySelectorAll("[data-cad-edit]").forEach((button) => {
    button.addEventListener("click", async () => {
      const rowId = Number(button.getAttribute("data-cad-edit"));
      const row = rowsById.get(rowId);
      if (!row) return;
      await openEntityFormModal("edit", row);
    });
  });

  document.querySelectorAll("[data-cad-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const rowId = Number(button.getAttribute("data-cad-delete"));
      const row = rowsById.get(rowId);
      if (!row) return;
      await handleDelete(row);
    });
  });

  document.querySelector("[data-cad-prev]")?.addEventListener("click", async () => {
    if (tab.meta.prev == null) return;
    tab.page = Number(tab.meta.prev);
    await loadActiveTabData();
  });

  document.querySelector("[data-cad-next]")?.addEventListener("click", async () => {
    if (tab.meta.next == null) return;
    tab.page = Number(tab.meta.next);
    await loadActiveTabData();
  });
}

export function renderCadastros() {
  const pageContent = document.getElementById("pageContent");
  if (!pageContent) return;
  const tab = activeTabState();

  pageContent.innerHTML = `
    <section class="page-head reveal">
      <div>
        <p class="breadcrumbs">${I18N_PTBR.breadcrumb_home} / ${I18N_PTBR.nav.cadastros}</p>
        <h1>${I18N_PTBR.cadastros.title}</h1>
        <p class="section-subtitle">${I18N_PTBR.cadastros.subtitle}</p>
      </div>
      <div class="table-tools">
        ${renderTabs()}
      </div>
    </section>

    <section class="panel pad border-gradient reveal">
      <div class="movements-filter-grid cadastros-filter-grid">
        <div class="field movements-filter-item-field">
          <label for="cadSearchInput">Busca</label>
          <input
            id="cadSearchInput"
            type="search"
            placeholder="${escapeHtml(I18N_PTBR.cadastros.actions.search_placeholder)}"
            value="${escapeHtml(tab.q)}"
          />
        </div>
        ${renderBranchFilter()}
      </div>
      <div class="table-tools" style="margin-top: 12px;">
        <button class="btn primary" type="button" id="cadCreateBtn">
          <i data-lucide="plus"></i>${I18N_PTBR.cadastros.actions.new}
        </button>
        <button class="btn ghost" type="button" id="cadRefreshBtn">
          <i data-lucide="refresh-cw"></i>${I18N_PTBR.cadastros.actions.refresh}
        </button>
        <button class="btn ghost" type="button" id="cadClearBtn">
          <i data-lucide="filter-x"></i>${I18N_PTBR.cadastros.actions.clear_filters}
        </button>
      </div>
    </section>

    ${renderContentState()}
  `;

  refreshIcons();
  initTooltips(pageContent);
  applyReveal(pageContent);
  bindEvents();

  if (!tab.loaded && !tab.loading) {
    void loadActiveTabData();
  }
}
