import { Button, Kbd, Menu as MantineMenu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Bell, Command, LogOut, Menu, UserRound } from "lucide-react";
import { useAuthStore } from "../../features/auth/store";
import { strings } from "../../shared/strings";
import { useUiStore } from "../../shared/ui/uiStore";

interface TopbarProps {
  onOpenCommandPalette: () => void;
}

export function Topbar({ onOpenCommandPalette }: TopbarProps) {
  const setMobileSidebarOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

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
      </div>

      <div className="topbar-actions">
        <Button
          className="command-chip"
          leftSection={<Command size={15} />}
          onClick={onOpenCommandPalette}
          radius="md"
          size="sm"
          variant="light"
        >
          Comandos <Kbd ml={8}>Ctrl K</Kbd>
        </Button>

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

        <MantineMenu position="bottom-end" shadow="md" width={230}>
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
      </div>
    </header>
  );
}
