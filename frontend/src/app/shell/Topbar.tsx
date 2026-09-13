import { notifications } from "@mantine/notifications";
import { Bell, Menu, Search } from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "../../features/auth/store";
import { strings } from "../../shared/strings";
import { useUiStore } from "../../shared/ui/uiStore";

export function Topbar() {
  const setMobileSidebarOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [search, setSearch] = useState("");

  return (
    <header className="topbar border-gradient" id="topbar">
      <div className="topbar-left">
        <button
          className="icon-btn mobile-only"
          aria-label="Abrir menu lateral"
          onClick={() => setMobileSidebarOpen(true)}
        >
          <Menu size={18} />
        </button>
        <div className="topbar-brand mobile-only">{strings.app_name}</div>
        <label className="global-search" aria-label="Busca global">
          <Search size={16} />
          <input
            type="search"
            placeholder={strings.search_placeholder}
            aria-label={strings.search_placeholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span className="search-kbd">CTRL + K</span>
        </label>
      </div>

      <div className="topbar-actions">
        <button
          className="icon-btn"
          aria-label="Notificações"
          onClick={() =>
            notifications.show({ title: strings.shell.notifications_title, message: strings.shell.notifications_empty })
          }
        >
          <Bell size={18} />
          <span className="dot" />
        </button>
        <button className="profile-chip" aria-label="Perfil do usuário" onClick={logout}>
          <span className="avatar">{(user?.name ?? "??").slice(0, 2).toUpperCase()}</span>
          <span className="profile-meta">
            <strong>{user?.name ?? "Sem sessão"}</strong>
            <small>{user?.email ?? ""}</small>
          </span>
        </button>
      </div>
    </header>
  );
}
