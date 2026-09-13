import {
  Badge,
  Divider,
  Group,
  Kbd,
  Modal,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { NAV_SECTIONS_ORDER, ROUTES } from "../routes";
import { strings } from "../../shared/strings";

interface CommandPaletteProps {
  opened: boolean;
  onClose: () => void;
  onOpen: () => void;
}

export function CommandPalette({ opened, onClose, onOpen }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useHotkeys([
    ["mod+K", onOpen],
    ["Escape", onClose],
  ]);

  const commands = useMemo(
    () =>
      ROUTES.filter((route) => !route.hidden).map((route) => ({
        id: route.id,
        label: strings.nav[route.navKey] ?? route.id,
        section: strings.nav_sections[route.section ?? "operation"],
        sectionOrder: NAV_SECTIONS_ORDER.indexOf(route.section ?? "operation"),
        href: `/${route.id}`,
      })),
    [],
  );

  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return commands
      .filter((command) => {
        if (!normalizedQuery) return true;
        return `${command.label} ${command.section}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => a.sectionOrder - b.sectionOrder || a.label.localeCompare(b.label))
      .slice(0, 8);
  }, [commands, query]);

  function runCommand(href: string) {
    navigate(href);
    setQuery("");
    onClose();
  }

  return (
    <Modal
      centered
      opened={opened}
      onClose={onClose}
      padding="md"
      radius="lg"
      size="lg"
      title={
        <Group gap="xs">
          <Text fw={700}>Comandos rapidos</Text>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </Group>
      }
    >
      <Stack gap="sm">
        <TextInput
          autoFocus
          leftSection={<Search size={16} />}
          placeholder="Buscar tela, cadastro ou relatorio"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />

        <Divider />

        <Stack gap={4}>
          {filteredCommands.map((command) => (
            <UnstyledButton
              className="command-item"
              key={command.id}
              onClick={() => runCommand(command.href)}
            >
              <Group justify="space-between" wrap="nowrap">
                <div>
                  <Text fw={650}>{command.label}</Text>
                  <Text c="dimmed" size="xs">
                    Ir para /{command.id}
                  </Text>
                </div>
                <Badge variant="light">{command.section}</Badge>
              </Group>
            </UnstyledButton>
          ))}

          {!filteredCommands.length ? (
            <Text c="dimmed" py="md" ta="center">
              Nenhum comando encontrado.
            </Text>
          ) : null}
        </Stack>
      </Stack>
    </Modal>
  );
}
