import { Alert, Button, Group, Loader, Modal, MultiSelect, Select, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { useBranchesQuery } from "../../shared/api/catalog";
import { useSetUserBranches, useUserBranchesQuery, type UserWithRoles } from "./api";

// Mirrors BRANCH_ROLES in app/core/role_matrix.py (see docs/roles-matrix.md).
const BRANCH_ROLES = [
  { value: "manager", label: "Gerente" },
  { value: "stockkeeper", label: "Estoquista" },
  { value: "seller", label: "Vendedor" },
  { value: "auditor", label: "Auditor (somente leitura)" },
] as const;

export function UserBranchesModal({ user, onClose }: { user: UserWithRoles | null; onClose: () => void }) {
  const { data: branches } = useBranchesQuery();
  const { data: current, isLoading } = useUserBranchesQuery(user?.id ?? null);
  const setBranches = useSetUserBranches();
  const [selected, setSelected] = useState<string[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (current) {
      setSelected(current.branch_ids.map(String));
      setRoles(current.roles);
    }
    setError(null);
  }, [current, user?.id]);

  async function save() {
    if (!user) return;
    setError(null);
    try {
      // only send roles of branches that are still selected
      const keptRoles = Object.fromEntries(Object.entries(roles).filter(([branchId]) => selected.includes(branchId)));
      await setBranches.mutateAsync({ userId: user.id, branchIds: selected.map(Number), roles: keptRoles });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar as filiais.");
    }
  }

  return (
    <Modal opened={user !== null} onClose={onClose} title={user ? `Filiais de ${user.name}` : ""} centered>
      {isLoading && <Loader size="sm" />}
      {current && (
        <Stack>
          {current.unrestricted && (
            <Text size="sm" c="dimmed">
              Administradores acessam todas as filiais, independente desta lista.
            </Text>
          )}
          <MultiSelect
            label="Filiais com acesso"
            placeholder="Nenhuma filial"
            data={(branches ?? []).map((branch) => ({ value: String(branch.id), label: branch.name }))}
            value={selected}
            onChange={setSelected}
            searchable
          />
          {selected.map((branchId) => (
            <Select
              key={branchId}
              size="xs"
              label={`Papel em ${(branches ?? []).find((branch) => String(branch.id) === branchId)?.name ?? branchId}`}
              placeholder="Usar o papel global do usuário"
              data={BRANCH_ROLES.map((role) => ({ value: role.value, label: role.label }))}
              value={roles[branchId] ?? null}
              onChange={(value) =>
                setRoles((previous) => {
                  const next = { ...previous };
                  if (value) next[branchId] = value;
                  else delete next[branchId];
                  return next;
                })
              }
              clearable
            />
          ))}
          {error && <Alert color="red">{error}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save} loading={setBranches.isPending}>
              Salvar
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
