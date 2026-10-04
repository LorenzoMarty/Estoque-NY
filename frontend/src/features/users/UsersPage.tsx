import { Alert, Group, Loader, Select, Switch, Table, Text, TextInput } from "@mantine/core";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../../shared/ui/PageHeader";
import { DataTable } from "../../shared/ui/DataTable";
import { useAuthStore } from "../auth/store";
import { strings } from "../../shared/strings";
import { useAssignRole, useRolesQuery, useSetUserActive, useUsersQuery, type UserWithRoles } from "./api";

const tableFeatureSet = tableFeatures({});
const columnHelper = createColumnHelper<typeof tableFeatureSet, UserWithRoles>();
const EMPTY_ROWS: UserWithRoles[] = [];

export function UsersPage() {
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const currentUser = useAuthStore((state) => state.user);

  const { data: users, isLoading, isError } = useUsersQuery({ q: search || undefined });
  const { data: roles } = useRolesQuery();
  const setActiveMutation = useSetUserActive();
  const assignRoleMutation = useAssignRole();

  const roleOptions = useMemo(() => (roles ?? []).map((role) => ({ value: role.name, label: role.name })), [roles]);

  async function handleToggleActive(user: UserWithRoles, active: boolean) {
    setError(null);
    try {
      await setActiveMutation.mutateAsync({ userId: user.id, active });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o usuário.");
    }
  }

  async function handleAssignRole(user: UserWithRoles, roleName: string) {
    setError(null);
    try {
      await assignRoleMutation.mutateAsync({ userId: user.id, roleName });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atribuir o papel.");
    }
  }

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", { header: "Nome" }),
        columnHelper.accessor("email", { header: "E-mail" }),
        columnHelper.display({
          id: "roles",
          header: "Papel",
          cell: (info) => (
            <Select
              size="xs"
              placeholder="Sem papel"
              data={roleOptions}
              value={info.row.original.roles[0] ?? null}
              onChange={(value) => value && handleAssignRole(info.row.original, value)}
              w={160}
            />
          ),
        }),
        columnHelper.display({
          id: "active",
          header: "Ativo",
          cell: (info) => (
            <Switch
              checked={info.row.original.active}
              disabled={currentUser?.id === info.row.original.id}
              onChange={(event) => handleToggleActive(info.row.original, event.currentTarget.checked)}
            />
          ),
        }),
        columnHelper.accessor("created_at", {
          header: "Criado em",
          cell: (info) => new Date(info.getValue()).toLocaleDateString("pt-BR"),
        }),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roleOptions, currentUser]
  );

  const table = useTable({ features: tableFeatureSet, columns, data: users ?? EMPTY_ROWS });

  return (
    <div className="workspace-page">
      <PageHeader
        title={strings.nav.users}
        subtitle="Usuários, papéis e status de acesso"
      />

      <Group className="toolbar-card">
        <TextInput
          placeholder="Buscar por nome ou e-mail"
          leftSection={<Search size={16} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          w={{ base: "100%", sm: 420 }}
        />
      </Group>

      {error && (
        <Alert color="red" mt="md" onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      {isLoading && (
        <Group justify="center" mt="xl">
          <Loader />
        </Group>
      )}
      {isError && (
        <Text c="red" mt="xl">
          Não foi possível carregar os usuários.
        </Text>
      )}

      {!isLoading && !isError && (
        <DataTable minWidth={760}>
            <Table.Thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <Table.Tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <Table.Th key={header.id}>{header.isPlaceholder ? null : <table.FlexRender header={header} />}</Table.Th>
                  ))}
                </Table.Tr>
              ))}
            </Table.Thead>
            <Table.Tbody>
              {table.getRowModel().rows.map((row) => (
                <Table.Tr key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <Table.Td key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
              {(users ?? []).length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={columns.length}>
                    <Text c="dimmed" ta="center" py="md">
                      Nenhum usuário encontrado.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </DataTable>
      )}
    </div>
  );
}
