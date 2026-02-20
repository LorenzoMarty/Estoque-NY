/*
  Bibliotecas escolhidas (CDN): Chart.js, Luxon, Tippy.js (+ Popper) e Lucide.
  Configuração da API: altere `API_BASE_URL` em `frontend/js/api.js` para apontar ao backend desejado.
  Endpoints consumidos:
  - GET `/health`, GET `/health/db`
  - GET `/branches`, GET `/locations`
  - GET `/stock/balances`
  - GET `/stock/moves?page=1&page_size=20&order=desc` (Dashboard)
  - GET `/stock/moves` com filtros (Movimentações)
  - POST `/stock/receipts`, `/stock/issues`, `/stock/adjustments` (Nova movimentação)
  - GET/POST/PATCH `/products` (Produtos)
  - GET/POST `/categories` e `/brands` (Produtos, quando disponível)
  - GET `/skus` (Resumo de variações em Produtos)
  Fallback demo:
  - Em falhas 5xx/timeout, a interface entra em modo demonstração com dataset mock automaticamente.
  - Em 401/403 na página Movimentações, é exibido aviso de permissão sem trocar para demo.
*/

import {
  AUTH_REQUIRED_EVENT_NAME,
  clearAuthSession,
  hasAuthToken,
  loadDashboardPayload,
  loginWithPassword,
} from "./api.js";
import { I18N_PTBR } from "./i18n.js";
import {
  state,
  routeFromHash,
  setRoute,
  setSidebarCollapsed,
  toggleSidebarCollapsed,
  setMobileSidebarOpen,
  setGlobalSearch,
  setDashboardLoading,
  setDashboardPayload,
  subscribe,
} from "./state.js";
import { configureRenderer, renderApp } from "./render.js";
import { openDrawer, refreshIcons, showToast } from "./ui.js";

let searchDebounceId = null;
let authDrawerOpen = false;
const PUBLIC_ROUTES = new Set(["login"]);

async function refreshDashboardData() {
  setDashboardLoading(true);
  const payload = await loadDashboardPayload();
  setDashboardPayload(payload);
  return payload;
}

function syncRouteWithHash() {
  let route = routeFromHash(window.location.hash);
  if (!PUBLIC_ROUTES.has(route) && !hasAuthToken()) {
    route = "login";
    if (window.location.hash !== "#/login") {
      window.location.hash = "#/login";
    }
  }
  setRoute(route);
  if (state.mobileSidebarOpen) {
    setMobileSidebarOpen(false);
  }
}

function extractApiErrorMessage(error, fallback = "Nao foi possivel concluir o login.") {
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

function openAuthDrawer(reason = "Faca login para continuar.") {
  if (authDrawerOpen) {
    return;
  }
  authDrawerOpen = true;

  openDrawer({
    title: "Login no sistema",
    subtitle: reason,
    submitLabel: "Entrar",
    cancelLabel: "Fechar",
    initialFocusSelector: "#authEmailInput",
    bodyHtml: `
      <div class="field">
        <label for="authEmailInput">E-mail</label>
        <input id="authEmailInput" name="email" type="email" autocomplete="username" required placeholder="usuario@empresa.com" />
      </div>
      <div class="field">
        <label for="authPasswordInput">Senha</label>
        <input id="authPasswordInput" name="password" type="password" autocomplete="current-password" required placeholder="Sua senha" />
      </div>
    `,
    onSubmit: async (formData, helpers) => {
      const email = String(formData.get("email") || "")
        .trim()
        .toLowerCase();
      const password = String(formData.get("password") || "");

      if (!email || !email.includes("@")) {
        helpers.setError("Informe um e-mail valido.");
        return false;
      }
      if (password.length < 8) {
        helpers.setError("Informe sua senha com pelo menos 8 caracteres.");
        return false;
      }

      try {
        await loginWithPassword(email, password);
        const payload = await refreshDashboardData();
        if (payload.authRequired) {
          helpers.setError(payload.authMessage || "Login realizado, mas a sessao nao foi validada.");
          return false;
        }
        window.location.hash = "#/dashboard";
        syncRouteWithHash();
        showToast({
          title: I18N_PTBR.app_name,
          message: "Login realizado com sucesso.",
          type: "success",
        });
        return true;
      } catch (error) {
        helpers.setError(extractApiErrorMessage(error));
        return false;
      }
    },
    onOpen: () => {
      return () => {
        authDrawerOpen = false;
      };
    },
  });
}

function openSessionDrawer() {
  openDrawer({
    title: "Sessao ativa",
    subtitle: "Sua autenticacao esta valida para consultar a API.",
    footerHtml: `
      <div class="drawer-footer">
        <button class="btn ghost" type="button" data-close-drawer>Fechar</button>
        <button class="btn" type="button" id="logoutSessionBtn">Sair</button>
      </div>
    `,
    bodyHtml: `
      <div class="banner">
        <i data-lucide="shield-check"></i>
        Sessao autenticada com token Bearer.
      </div>
    `,
    onOpen: (overlay, helpers) => {
      const logoutButton = overlay.querySelector("#logoutSessionBtn");
      logoutButton?.addEventListener("click", async () => {
        clearAuthSession();
        helpers.close();
        window.location.hash = "#/login";
        syncRouteWithHash();
        showToast({
          title: I18N_PTBR.app_name,
          message: "Sessao encerrada. Faca login para continuar.",
          type: "success",
        });
      });
    },
  });
}

function bindShellEvents() {
  const collapseButton = document.getElementById("sidebarCollapseBtn");
  const mobileToggleButton = document.getElementById("sidebarToggleMobile");
  const mobileOverlay = document.getElementById("mobileOverlay");
  const globalSearchInput = document.getElementById("globalSearchInput");
  const notificationsButton = document.getElementById("notificationsBtn");
  const profileButton = document.getElementById("profileBtn");

  collapseButton?.addEventListener("click", () => {
    toggleSidebarCollapsed();
    window.localStorage.setItem("ESTOQUE_SIDEBAR_COLLAPSED", String(state.sidebarCollapsed));
  });

  mobileToggleButton?.addEventListener("click", () => {
    setMobileSidebarOpen(true);
  });

  mobileOverlay?.addEventListener("click", () => {
    setMobileSidebarOpen(false);
  });

  globalSearchInput?.addEventListener("input", (event) => {
    const value = event.target.value;
    window.clearTimeout(searchDebounceId);
    searchDebounceId = window.setTimeout(() => {
      setGlobalSearch(value);
    }, 150);
  });

  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      globalSearchInput?.focus();
      globalSearchInput?.select();
    }
  });

  notificationsButton?.addEventListener("click", () => {
    showToast({
      title: I18N_PTBR.shell.notifications_title,
      message: I18N_PTBR.shell.notifications_empty,
      type: "success",
    });
  });

  profileButton?.addEventListener("click", () => {
    if (hasAuthToken()) {
      openSessionDrawer();
      return;
    }
    openAuthDrawer("Sessao nao autenticada.");
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1180 && state.mobileSidebarOpen) {
      setMobileSidebarOpen(false);
    }
  });

  window.addEventListener("hashchange", () => {
    syncRouteWithHash();
  });

  window.addEventListener(AUTH_REQUIRED_EVENT_NAME, (event) => {
    const reason = event?.detail?.reason;
    const message = typeof reason === "string" && reason ? reason : "Sessao expirada. Faca login para continuar.";
    showToast({
      title: I18N_PTBR.app_name,
      message,
      type: "error",
    });
    window.location.hash = "#/login";
    syncRouteWithHash();
    openAuthDrawer(message);
  });
}

function restoreSidebarPreference() {
  const persisted = window.localStorage.getItem("ESTOQUE_SIDEBAR_COLLAPSED");
  if (persisted === "true") {
    setSidebarCollapsed(true);
  }
}

function initialize() {
  configureRenderer({
    onRefreshData: refreshDashboardData,
    onOpenLogin: () => openAuthDrawer("Sessao nao autenticada."),
  });

  subscribe(() => {
    renderApp();
    refreshIcons();
  });

  restoreSidebarPreference();
  bindShellEvents();

  if (!window.location.hash) {
    window.location.hash = hasAuthToken() ? "#/dashboard" : "#/login";
  }

  syncRouteWithHash();

  if (!hasAuthToken()) {
    return;
  }

  refreshDashboardData().then((payload) => {
    if (payload.authRequired) {
      const authMessage = payload.authMessage || "Faca login para consultar os dados protegidos.";
      showToast({
        title: I18N_PTBR.app_name,
        message: authMessage,
        type: "error",
      });
      clearAuthSession();
      window.location.hash = "#/login";
      syncRouteWithHash();
      openAuthDrawer(authMessage);
      return;
    }

    if (payload.mode === "demo") {
      showToast({
        title: I18N_PTBR.shell.demo_title,
        message: I18N_PTBR.mode_demo_details,
        type: "error",
      });
    }
  });
}

initialize();
