import { useDisclosure } from "@mantine/hooks";
import { Menu, PanelLeftClose } from "lucide-react";
import { Outlet } from "react-router";
import logoMark from "../../assets/brand/logo-ny-mark.svg";
import { strings } from "../../shared/strings";
import { useUiStore } from "../../shared/ui/uiStore";
import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";
import { SidebarFooter } from "./SidebarFooter";

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
            <img alt="" className="brand-logo" height="38" src={logoMark} width="26" />
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
        <SidebarFooter />
      </aside>

      <button
        className="mobile-overlay"
        aria-label="Fechar menu"
        onClick={() => setMobileSidebarOpen(false)}
        style={{ display: mobileSidebarOpen ? "block" : "none" }}
      />

      <div className="layout-main">
        <button
          className="icon-btn mobile-only mobile-menu-btn"
          aria-label="Abrir menu lateral"
          onClick={() => setMobileSidebarOpen(true)}
        >
          <Menu size={18} />
        </button>
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
