import { Outlet } from "react-router";
import { useUiStore } from "../../shared/ui/uiStore";
import { PanelLeftClose } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { strings } from "../../shared/strings";

export function AppShell() {
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const mobileSidebarOpen = useUiStore((state) => state.mobileSidebarOpen);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const setMobileSidebarOpen = useUiStore((state) => state.setMobileSidebarOpen);

  return (
    <div className={`app-shell${sidebarCollapsed ? " is-collapsed" : ""}${mobileSidebarOpen ? " mobile-open" : ""}`} id="appShell">
      <aside className="sidebar border-gradient" id="sidebar" aria-label="Menu lateral">
        <div className="sidebar-header">
          <a className="brand" href="/dashboard" aria-label="Ir para Visão geral">
            <span className="brand-mark">📦</span>
            <span className="brand-text">{strings.app_name}</span>
          </a>
          <button className="icon-btn desktop-only" aria-label="Recolher menu lateral" onClick={toggleSidebarCollapsed}>
            <PanelLeftClose size={18} />
          </button>
        </div>
        <Sidebar />
        <div className="sidebar-footer border-gradient">
          <span className="sidebar-footer-label">Sistema</span>
          <p className="sidebar-footer-text">Painel operacional de estoque</p>
        </div>
      </aside>

      <button
        className="mobile-overlay"
        aria-label="Fechar menu"
        onClick={() => setMobileSidebarOpen(false)}
        style={{ display: mobileSidebarOpen ? "block" : "none" }}
      />

      <div className="layout-main">
        <Topbar />
        <main className="page-content" id="pageContent" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
