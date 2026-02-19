import { I18N_PTBR } from "./i18n.js";
import { initTooltips, openDrawer, refreshIcons } from "./ui.js";
import { escapeHtml } from "./utils.js";

const MODULE_ORDER = [
  "dashboard",
  "movements",
  "products",
  "transfers",
  "count",
  "reports",
  "audit",
  "users",
];

const ACTION_ORDER = ["view", "create", "edit", "delete"];

function clonePermissions(rawPermissions = {}) {
  const normalized = {};
  MODULE_ORDER.forEach((moduleKey) => {
    normalized[moduleKey] = {};
    ACTION_ORDER.forEach((actionKey) => {
      normalized[moduleKey][actionKey] = Boolean(rawPermissions?.[moduleKey]?.[actionKey]);
    });
  });
  return normalized;
}

function roleLabel(role) {
  const byCode =
    I18N_PTBR.users.role_labels[String(role?.code || "").toUpperCase()] ||
    I18N_PTBR.users.role_labels[String(role?.name || "").toUpperCase()];
  return byCode || role?.name || role?.code || I18N_PTBR.users.defaults.role_unassigned;
}

function renderRoleList(runtime) {
  return runtime.roles
    .map((role) => {
      const selected = Number(runtime.selectedRoleId) === Number(role.id);
      return `
        <button
          type="button"
          class="users-role-item ${selected ? "is-active" : ""}"
          data-role-select="${role.id}"
          aria-label="${escapeHtml(roleLabel(role))}"
        >
          <strong>${escapeHtml(roleLabel(role))}</strong>
          <small>${escapeHtml(role.code || "")}</small>
        </button>
      `;
    })
    .join("");
}

function renderPermissionsGrid(runtime) {
  const role = runtime.roles.find((row) => Number(row.id) === Number(runtime.selectedRoleId));
  if (!role) {
    return `<p class="section-subtitle">${I18N_PTBR.users.roles.role_help}</p>`;
  }

  const permissions = runtime.permissionsByRole.get(Number(role.id)) || clonePermissions();
  const rows = MODULE_ORDER.map((moduleKey) => {
    const moduleLabel = I18N_PTBR.users.permission_modules[moduleKey] || moduleKey;
    const cells = ACTION_ORDER.map((actionKey) => {
      const checked = permissions[moduleKey][actionKey] ? "checked" : "";
      const actionLabel = I18N_PTBR.users.permission_labels[actionKey] || actionKey;
      return `
        <label class="users-permission-cell" data-tippy-content="${escapeHtml(actionLabel)}">
          <input
            type="checkbox"
            data-permission-toggle="${moduleKey}:${actionKey}"
            ${checked}
            aria-label="${escapeHtml(`${moduleLabel} - ${actionLabel}`)}"
          />
        </label>
      `;
    }).join("");
    return `
      <div class="users-permission-row">
        <span>${escapeHtml(moduleLabel)}</span>
        ${cells}
      </div>
    `;
  }).join("");

  const roleNameDraft =
    runtime.roleNameById.get(Number(role.id)) || role.name || role.code || I18N_PTBR.users.defaults.role_unassigned;

  return `
    <div class="field">
      <label for="usersRoleRenameInput">${I18N_PTBR.users.roles.role_name}</label>
      <div class="users-role-edit-inline">
        <input id="usersRoleRenameInput" type="text" value="${escapeHtml(roleNameDraft)}" />
        <button class="btn sm ghost" type="button" id="usersSaveRoleNameBtn">${I18N_PTBR.users.roles.save_role}</button>
      </div>
    </div>

    <div class="users-permission-table" role="table" aria-label="${escapeHtml(I18N_PTBR.users.roles.permissions)}">
      <div class="users-permission-row users-permission-header" role="row">
        <span role="columnheader">${I18N_PTBR.users.roles.module_label}</span>
        <span role="columnheader">${I18N_PTBR.users.permission_labels.view}</span>
        <span role="columnheader">${I18N_PTBR.users.permission_labels.create}</span>
        <span role="columnheader">${I18N_PTBR.users.permission_labels.edit}</span>
        <span role="columnheader">${I18N_PTBR.users.permission_labels.delete}</span>
      </div>
      ${rows}
    </div>
  `;
}

export function openRolesManagerModal({
  roles = [],
  initialRoleId = null,
  onCreateRole,
  onRenameRole,
  onSavePermissions,
}) {
  const runtime = {
    roles: Array.isArray(roles) ? roles.map((role) => ({ ...role })) : [],
    selectedRoleId:
      initialRoleId != null &&
      roles.some((role) => Number(role.id) === Number(initialRoleId))
        ? initialRoleId
        : roles[0]?.id ?? null,
    roleNameById: new Map(
      (roles || []).map((role) => [Number(role.id), String(role.name || role.code || "")])
    ),
    permissionsByRole: new Map(
      (roles || []).map((role) => [Number(role.id), clonePermissions(role.permissions)])
    ),
  };

  openDrawer({
    title: I18N_PTBR.users.roles.title,
    subtitle: I18N_PTBR.users.roles.subtitle,
    cancelLabel: I18N_PTBR.users.actions.cancel,
    bodyHtml: `
      <div class="users-roles-layout" id="usersRolesLayout">
        <section class="drawer-section">
          <h4>${I18N_PTBR.users.roles.existing_roles}</h4>
          <div class="users-role-list" id="usersRolesList"></div>
          <div class="field">
            <label for="usersNewRoleInput">${I18N_PTBR.users.roles.new_role}</label>
            <div class="users-role-edit-inline">
              <input id="usersNewRoleInput" type="text" placeholder="${escapeHtml(
                I18N_PTBR.users.roles.new_role
              )}" />
              <button class="btn sm" type="button" id="usersCreateRoleBtn">${I18N_PTBR.users.roles.create_role}</button>
            </div>
          </div>
        </section>
        <section class="drawer-section">
          <h4>${I18N_PTBR.users.roles.permissions}</h4>
          <div id="usersPermissionsContainer"></div>
        </section>
      </div>
    `,
    footerHtml: `
      <div class="drawer-footer">
        <button class="btn ghost" type="button" data-close-drawer>${I18N_PTBR.users.actions.cancel}</button>
        <button class="btn primary" type="button" id="usersSavePermissionsBtn">${I18N_PTBR.users.roles.save_permissions}</button>
      </div>
    `,
    onOpen: (overlay, helpers) => {
      overlay.classList.add("transfer-modal-overlay");
      overlay.querySelector(".drawer")?.classList.add("transfer-modal", "users-roles-modal");

      const roleListNode = overlay.querySelector("#usersRolesList");
      const permissionsNode = overlay.querySelector("#usersPermissionsContainer");
      const createRoleButton = overlay.querySelector("#usersCreateRoleBtn");
      const savePermissionsButton = overlay.querySelector("#usersSavePermissionsBtn");

      function selectedRole() {
        return runtime.roles.find((role) => Number(role.id) === Number(runtime.selectedRoleId)) || null;
      }

      function render() {
        if (roleListNode) {
          roleListNode.innerHTML = renderRoleList(runtime);
        }
        if (permissionsNode) {
          permissionsNode.innerHTML = renderPermissionsGrid(runtime);
        }

        overlay.querySelectorAll("[data-role-select]").forEach((button) => {
          button.addEventListener("click", () => {
            const roleId = Number(button.getAttribute("data-role-select"));
            if (!Number.isFinite(roleId)) return;
            runtime.selectedRoleId = roleId;
            helpers.clearError();
            render();
          });
        });

        overlay.querySelector("#usersSaveRoleNameBtn")?.addEventListener("click", async () => {
          const role = selectedRole();
          if (!role) return;
          const input = overlay.querySelector("#usersRoleRenameInput");
          const nextName = String(input?.value || "").trim();
          if (nextName.length < 3) {
            helpers.setError(I18N_PTBR.users.roles.validation_name);
            return;
          }
          const saved = await onRenameRole?.({
            role,
            name: nextName,
          });
          if (!saved) return;
          role.name = saved.name || nextName;
          role.code = saved.code || role.code;
          runtime.roleNameById.set(Number(role.id), role.name);
          helpers.clearError();
          render();
        });

        overlay.querySelectorAll("[data-permission-toggle]").forEach((checkbox) => {
          checkbox.addEventListener("change", (event) => {
            const role = selectedRole();
            if (!role) return;
            const key = checkbox.getAttribute("data-permission-toggle");
            const [moduleKey, actionKey] = String(key || "").split(":");
            if (!MODULE_ORDER.includes(moduleKey) || !ACTION_ORDER.includes(actionKey)) return;
            const permissions = runtime.permissionsByRole.get(Number(role.id)) || clonePermissions();
            permissions[moduleKey][actionKey] = Boolean(event.target.checked);
            runtime.permissionsByRole.set(Number(role.id), permissions);
          });
        });

        refreshIcons();
        initTooltips(overlay);
      }

      createRoleButton?.addEventListener("click", async () => {
        const input = overlay.querySelector("#usersNewRoleInput");
        const nextName = String(input?.value || "").trim();
        if (nextName.length < 3) {
          helpers.setError(I18N_PTBR.users.roles.validation_name);
          return;
        }
        const created = await onCreateRole?.({ name: nextName });
        if (!created) return;
        runtime.roles.push({ ...created });
        runtime.permissionsByRole.set(Number(created.id), clonePermissions(created.permissions));
        runtime.roleNameById.set(Number(created.id), String(created.name || created.code || nextName));
        runtime.selectedRoleId = created.id;
        if (input) input.value = "";
        helpers.clearError();
        render();
      });

      savePermissionsButton?.addEventListener("click", async () => {
        const role = selectedRole();
        if (!role) return;
        const permissions = runtime.permissionsByRole.get(Number(role.id)) || clonePermissions();
        const saved = await onSavePermissions?.({
          role,
          permissions,
        });
        if (!saved) return;
        runtime.permissionsByRole.set(Number(role.id), clonePermissions(saved.permissions || permissions));
        helpers.clearError();
        render();
      });

      render();
    },
  });
}
