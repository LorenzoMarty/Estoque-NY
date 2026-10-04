import { Alert, Button, Group, Loader, Modal, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { DataTable } from "../../shared/ui/DataTable";
import { useBranchesQuery, useCreateLocation, useDeleteLocation, useLocationsQuery, useUpdateLocation } from "../../shared/api/catalog";
import type { Location, LocationType } from "../../shared/types/stock";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";

const TYPE_LABELS: Record<LocationType, string> = { STORE: "Loja", STOCK: "Estoque", DAMAGED: "Avarias" };

export function LocationsTab() {
  const { data: branches } = useBranchesQuery();
  const locationsQuery = useLocationsQuery();
  const [editing, setEditing] = useState<Location | null>(null);
  const [creating, setCreating] = useState(false);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<string | null>("STORE");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Location | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const createMutation = useCreateLocation();
  const updateMutation = useUpdateLocation(editing?.id ?? 0);
  const deleteMutation = useDeleteLocation();

  const branchOptions = useMemo(() => (branches ?? []).map((b) => ({ value: String(b.id), label: b.name })), [branches]);
  const branchName = useMemo(() => new Map((branches ?? []).map((b) => [b.id, b.name])), [branches]);

  function openCreate() {
    setBranchId(null);
    setName("");
    setType("STORE");
    setError(null);
    setCreating(true);
  }

  function openEdit(location: Location) {
    setBranchId(String(location.branch_id));
    setName(location.name);
    setType(location.type);
    setError(null);
    setEditing(location);
  }

  function openDelete(location: Location) {
    setDeleteError(null);
    setDeleting(location);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!name.trim() || !branchId || !type) {
      setError("Preencha filial, nome e tipo.");
      return;
    }
    const values = { branch_id: Number(branchId), name, type: type as LocationType };
    try {
      if (editing) await updateMutation.mutateAsync(values);
      else await createMutation.mutateAsync(values);
      setCreating(false);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      setDeleting(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  }

  return (
    <div className="tab-stack">
      <Group justify="flex-end">
        <Button leftSection={<Plus size={16} />} onClick={openCreate}>
          Novo local
        </Button>
      </Group>

      {locationsQuery.isLoading && (
        <Group justify="center">
          <Loader />
        </Group>
      )}
      {locationsQuery.isError && <Text c="red">Não foi possível carregar os locais.</Text>}

      {!locationsQuery.isLoading && !locationsQuery.isError && (
        <DataTable minWidth={640}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nome</Table.Th>
              <Table.Th>Filial</Table.Th>
              <Table.Th>Tipo</Table.Th>
              <Table.Th>Ações</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(locationsQuery.data ?? []).map((location) => (
              <Table.Tr key={location.id}>
                <Table.Td>{location.name}</Table.Td>
                <Table.Td>{branchName.get(location.branch_id) ?? "—"}</Table.Td>
                <Table.Td>{TYPE_LABELS[location.type]}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button size="xs" variant="subtle" leftSection={<Pencil size={14} />} onClick={() => openEdit(location)}>
                      Editar
                    </Button>
                    <Button size="xs" variant="subtle" color="red" leftSection={<Trash2 size={14} />} onClick={() => openDelete(location)}>
                      Excluir
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {(locationsQuery.data ?? []).length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed" ta="center" py="md">
                    Nenhum registro encontrado.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </DataTable>
      )}

      <Modal
        opened={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? "Editar local" : "Novo local"}
      >
        <form onSubmit={handleSave}>
          <Stack>
            <Select
              label="Filial"
              data={branchOptions}
              value={branchId}
              onChange={(value) => {
                setBranchId(value);
                setError(null);
              }}
            />
            <Select
              label="Tipo"
              data={Object.entries(TYPE_LABELS).map(([value, tlabel]) => ({ value, label: tlabel }))}
              value={type}
              onChange={(value) => {
                setType(value);
                setError(null);
              }}
            />
            <TextInput
              label="Nome"
              value={name}
              onChange={(event) => {
                setName(event.currentTarget.value);
                setError(null);
              }}
            />
            {error && <Alert color="red">{error}</Alert>}
            <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
              Salvar
            </Button>
          </Stack>
        </form>
      </Modal>

      <ConfirmDeleteModal
        opened={Boolean(deleting)}
        message={`Excluir local "${deleting?.name ?? ""}"? Esta ação não pode ser desfeita.`}
        loading={deleteMutation.isPending}
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
