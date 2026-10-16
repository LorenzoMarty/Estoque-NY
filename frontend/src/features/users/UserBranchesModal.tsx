import { Alert, Button, Group, Loader, Modal, MultiSelect, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { useBranchesQuery } from "../../shared/api/catalog";
import { useSetUserBranches, useUserBranchesQuery, type UserWithRoles } from "./api";

export function UserBranchesModal({ user, onClose }: { user: UserWithRoles | null; onClose: () => void }) {
  const { data: branches } = useBranchesQuery();
  const { data: current, isLoading } = useUserBranchesQuery(user?.id ?? null);
  const setBranches = useSetUserBranches();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (current) setSelected(current.branch_ids.map(String));
    setError(null);
  }, [current, user?.id]);

  async function save() {
    if (!user) return;
    setError(null);
    try {
      await setBranches.mutateAsync({ userId: user.id, branchIds: selected.map(Number) });
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
