import { I18N_PTBR } from "./i18n.js";
import { initTooltips, openDrawer, refreshIcons } from "./ui.js";
import { escapeHtml } from "./utils.js";

function buildRoleOptions(roles = [], selected = "") {
  const rows = Array.isArray(roles) ? roles : [];
  const fallback = `<option value="all">${I18N_PTBR.users.filters.role_all}</option>`;
  if (!rows.length) return fallback;
  return rows
    .map((role) => {
      const value = String(role.id);
      const selectedAttr = value === String(selected) ? "selected" : "";
      return `<option value="${escapeHtml(value)}" ${selectedAttr}>${escapeHtml(
        role.name || role.code || I18N_PTBR.users.defaults.role_unassigned
      )}</option>`;
    })
    .join("");
}

function emailIsValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

export function openUserFormModal({ mode = "create", user = null, roles = [], onSubmit }) {
  const editing = mode === "edit";
  const roleOptions = buildRoleOptions(
    roles,
    editing ? String(user?.role_id || "") : String(roles[0]?.id || "")
  );
  const initialStatus = editing ? Boolean(user?.is_active) : true;

  openDrawer({
    title: editing ? I18N_PTBR.users.form.edit_title : I18N_PTBR.users.form.create_title,
    subtitle: editing ? I18N_PTBR.users.form.edit_subtitle : I18N_PTBR.users.form.create_subtitle,
    submitLabel: I18N_PTBR.users.form.save,
    cancelLabel: I18N_PTBR.users.form.cancel,
    initialFocusSelector: "#userFullNameInput",
    bodyHtml: `
      <div class="field">
        <label for="userFullNameInput">${I18N_PTBR.users.form.full_name} *</label>
        <input id="userFullNameInput" name="full_name" type="text" minlength="3" required value="${escapeHtml(
          user?.name || ""
        )}" />
      </div>
      <div class="field">
        <label for="userEmailInput">${I18N_PTBR.users.form.email} *</label>
        <input id="userEmailInput" name="email" type="email" required value="${escapeHtml(
          user?.email || ""
        )}" />
        <small class="section-subtitle">${I18N_PTBR.users.form.email_hint}</small>
      </div>
      <div class="field">
        <label for="userRoleSelect">${I18N_PTBR.users.form.role}</label>
        <select id="userRoleSelect" name="role_id">
          ${roleOptions}
        </select>
      </div>
      <div class="field">
        <label>${I18N_PTBR.users.form.status}</label>
        <label class="transfer-toggle-inline">
          <input type="checkbox" id="userStatusToggle" name="is_active" ${initialStatus ? "checked" : ""} />
          <span>${
            initialStatus ? I18N_PTBR.users.form.status_active : I18N_PTBR.users.form.status_inactive
          }</span>
        </label>
      </div>
      ${
        editing
          ? ""
          : `
        <div class="field">
          <label for="userPasswordInput">${I18N_PTBR.users.form.password} *</label>
          <input id="userPasswordInput" name="password" type="password" minlength="8" autocomplete="new-password" required />
          <small class="section-subtitle">${I18N_PTBR.users.form.password_hint}</small>
        </div>
      `
      }
    `,
    onSubmit: async (formData, helpers) => {
      const name = String(formData.get("full_name") || "").trim();
      const email = String(formData.get("email") || "")
        .trim()
        .toLowerCase();
      const roleIdRaw = String(formData.get("role_id") || "").trim();
      const password = String(formData.get("password") || "");
      const isActive = Boolean(formData.get("is_active"));

      if (name.length < 3) {
        helpers.setError(I18N_PTBR.users.form.validate_name);
        return false;
      }
      if (!emailIsValid(email)) {
        helpers.setError(I18N_PTBR.users.form.validate_email);
        return false;
      }
      if (!editing && password.trim().length < 8) {
        helpers.setError(I18N_PTBR.users.form.validate_password);
        return false;
      }

      const roleId = Number(roleIdRaw);
      const payload = {
        name,
        email,
        role_id: Number.isFinite(roleId) ? roleId : null,
        is_active: isActive,
      };
      if (!editing) {
        payload.password = password;
      }

      const result = await onSubmit?.({
        mode,
        user,
        payload,
      });
      if (result === false) {
        return false;
      }
      return true;
    },
    onOpen: (overlay) => {
      const statusToggle = overlay.querySelector("#userStatusToggle");
      const statusLabel = statusToggle?.parentElement?.querySelector("span");
      statusToggle?.addEventListener("change", (event) => {
        if (!statusLabel) return;
        statusLabel.textContent = event.target.checked
          ? I18N_PTBR.users.form.status_active
          : I18N_PTBR.users.form.status_inactive;
      });
      refreshIcons();
      initTooltips(overlay);
    },
  });
}
