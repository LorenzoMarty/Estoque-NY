import { Menu as MantineMenu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Bell, LogOut, Menu, Search, UserRound } from "lucide-react";
import { BranchSwitcher } from "../../features/branch/BranchSwitcher";
import { useAuthStore } from "../../features/auth/store";
import { strings } from "../../shared/strings";

interface TopbarProps {
  onOpenMenu: () => void;
  onOpenCommands: () => void;
}

export function Topbar({ onOpenMenu, onOpenCommands }: TopbarProps) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const name = user?.name ?? "Sem sessao";

  return (
    <header className="topbar">
      <button className="icon-btn mobile-only" aria-label="Abrir menu lateral" onClick={onOpenMenu}>
        <Menu size={18} />
      </button>
      <BranchSwitcher />

      <div className="topbar-actions">
        <button className="command-chip" aria-label="Comandos" onClick={onOpenCommands}>
          <Search size={14} aria-hidden />
          <span>Comandos</span>
          <kbd>Ctrl K</kbd>
        </button>

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
          <Bell size={17} />
          <span className="dot" aria-hidden />
        </button>

        <MantineMenu position="bottom-end" shadow="md" width={230}>
          <MantineMenu.Target>
            <button className="profile-chip" aria-label={`Conta de ${name}`}>
              <span className="avatar" aria-hidden>
                {name.slice(0, 2).toUpperCase()}
              </span>
              <span className="profile-name">{name}</span>
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
