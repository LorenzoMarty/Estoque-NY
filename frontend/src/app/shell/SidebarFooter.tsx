import { Menu as MantineMenu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Bell, LogOut, UserRound } from "lucide-react";
import { useAuthStore } from "../../features/auth/store";
import { strings } from "../../shared/strings";

export function SidebarFooter() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  return (
    <div className="sidebar-account">
      <MantineMenu position="top-start" shadow="md" width={230}>
        <MantineMenu.Target>
          <button className="profile-chip" aria-label="Perfil do usuario">
            <span className="avatar">{(user?.name ?? "??").slice(0, 2).toUpperCase()}</span>
            <span className="profile-meta">
              <strong>{user?.name ?? "Sem sessao"}</strong>
              <small>{user?.email ?? ""}</small>
            </span>
          </button>
        </MantineMenu.Target>
        <MantineMenu.Dropdown>
          <MantineMenu.Label>Sessao</MantineMenu.Label>
          <MantineMenu.Item leftSection={<UserRound size={15} />} disabled>
            {user?.email ?? "Usuario nao identificado"}
          </MantineMenu.Item>
          <MantineMenu.Divider />
          <MantineMenu.Item color="red" leftSection={<LogOut size={15} />} onClick={logout}>
            Sair
          </MantineMenu.Item>
        </MantineMenu.Dropdown>
      </MantineMenu>

      <button
        className="icon-btn"
        aria-label="Notificacoes"
        onClick={() =>
          notifications.show({
            title: strings.shell.notifications_title,
            message: strings.shell.notifications_empty,
          })
        }
      >
        <Bell size={18} />
        <span className="dot" />
      </button>
    </div>
  );
}
