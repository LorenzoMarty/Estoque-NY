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

import { loadDashboardPayload } from "./api.js";
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
import { refreshIcons, showToast } from "./ui.js";

let searchDebounceId = null;

async function refreshDashboardData() {
  setDashboardLoading(true);
  const payload = await loadDashboardPayload();
  setDashboardPayload(payload);
  return payload;
}

function syncRouteWithHash() {
  const route = routeFromHash(window.location.hash);
  setRoute(route);
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
    showToast({
      title: I18N_PTBR.app_name,
      message: I18N_PTBR.shell.profile_message,
      type: "success",
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1180 && state.mobileSidebarOpen) {
      setMobileSidebarOpen(false);
    }
  });

  window.addEventListener("hashchange", () => {
    syncRouteWithHash();
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
  });

  subscribe(() => {
    renderApp();
    refreshIcons();
  });

  restoreSidebarPreference();
  bindShellEvents();

  if (!window.location.hash) {
    window.location.hash = "#/dashboard";
  }

  syncRouteWithHash();

  refreshDashboardData().then((payload) => {
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
