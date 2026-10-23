import { VisuallyHidden } from "@mantine/core";
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
      <aside className="sidebar" id="sidebar" aria-label="Menu lateral">
        <div className="sidebar-header">
          <a className="brand" href="/dashboard" aria-label={`${strings.app_name} - ${strings.nav.dashboard}`}>
            <span className="brand-mark" aria-hidden>
              <Package size={17} />
            </span>
            <span className="brand-text">{strings.app_name}</span>
          </a>
          <button
            className="icon-btn desktop-only"
            aria-label="Recolher menu lateral"
            onClick={toggleSidebarCollapsed}
          >
            <PanelLeftClose size={17} />
          </button>
        </div>

        <Sidebar />

        <div className="ny-footer" aria-hidden="true">
          <div className="ny-skyline" />
        </div>
      </aside>

      <button
        className="mobile-overlay"
        aria-label="Fechar menu"
        onClick={() => setMobileSidebarOpen(false)}
        style={{ display: mobileSidebarOpen ? "block" : "none" }}
      />

      <div className="layout-main">
        <Topbar onOpenMenu={() => setMobileSidebarOpen(true)} onOpenCommands={openCommandPalette} />
        <main className="page-content" id="pageContent" tabIndex={-1}>
          <VisuallyHidden component="h1">{strings.app_name}</VisuallyHidden>
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
