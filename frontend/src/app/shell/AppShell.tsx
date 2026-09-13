import { useDisclosure } from "@mantine/hooks";
import { Package, PanelLeftClose } from "lucide-react";
import { Outlet } from "react-router";
import { strings } from "../../shared/strings";
import { useUiStore } from "../../shared/ui/uiStore";
import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell() {
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const mobileSidebarOpen = useUiStore((state) => state.mobileSidebarOpen);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const setMobileSidebarOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const [commandPaletteOpened, { close: closeCommandPalette, open: openCommandPalette }] =
    useDisclosure(false);

  return (
    <div
      className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}${
        mobileSidebarOpen ? " sidebar-open" : ""
      }`}
      id="appShell"
    >
      <aside className="sidebar border-gradient" id="sidebar" aria-label="Menu lateral">
        <div className="sidebar-header">
          <a className="brand" href="/dashboard" aria-label="Ir para Visao geral">
            <span className="brand-mark">
              <Package size={18} />
            </span>
            <span className="brand-text">{strings.app_name}</span>
          </a>
          <button
            className="icon-btn desktop-only"
            aria-label="Recolher menu lateral"
            onClick={toggleSidebarCollapsed}
          >
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
        <Topbar onOpenCommandPalette={openCommandPalette} />
        <main className="page-content" id="pageContent" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <CommandPalette
        opened={commandPaletteOpened}
        onClose={closeCommandPalette}
        onOpen={openCommandPalette}
      />
    </div>
  );
}
