import { Alert, Button, Group, Loader, Modal, Stack, Table, Text, TextInput } from "@mantine/core";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

interface NamedEntity {
  id: number;
  name: string;
}

interface NameOnlyTabProps<T extends NamedEntity> {
  label: string;
  query: UseQueryResult<T[]>;
  useCreate: () => UseMutationResult<T, Error, { name: string }>;
  useUpdate: (id: number) => UseMutationResult<T, Error, { name: string }>;
  useDelete: () => UseMutationResult<unknown, Error, number>;
}

export function NameOnlyTab<T extends NamedEntity>({ label, query, useCreate, useUpdate, useDelete }: NameOnlyTabProps<T>) {
  const [editing, setEditing] = useState<T | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreate();
  const updateMutation = useUpdate(editing?.id ?? 0);
  const deleteMutation = useDelete();

  function openCreate() {
    setName("");
    setError(null);
    setCreating(true);
  }

  function openEdit(entity: T) {
    setName(entity.name);
    setError(null);
    setEditing(entity);
  }

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError("Informe o nome.");
      return;
    }
    try {
      if (editing) await updateMutation.mutateAsync({ name });
      else await createMutation.mutateAsync({ name });
      setCreating(false);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteMutation.mutateAsync(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  }

  return (
    <div>
      <Group justify="flex-end" mb="md">
        <Button leftSection={<Plus size={16} />} onClick={openCreate}>
          Novo {label.toLowerCase()}
        </Button>
      </Group>

      {query.isLoading && (
        <Group justify="center">
          <Loader />
        </Group>
      )}
      {query.isError && <Text c="red">Não foi possível carregar {label.toLowerCase()}s.</Text>}

      {!query.isLoading && !query.isError && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nome</Table.Th>
              <Table.Th>Ações</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(query.data ?? []).map((entity) => (
              <Table.Tr key={entity.id}>
                <Table.Td>{entity.name}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button size="xs" variant="subtle" leftSection={<Pencil size={14} />} onClick={() => openEdit(entity)}>
                      Editar
                    </Button>
                    <Button size="xs" variant="subtle" color="red" leftSection={<Trash2 size={14} />} onClick={() => handleDelete(entity.id)}>
                      Excluir
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {(query.data ?? []).length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={2}>
                  <Text c="dimmed" ta="center" py="md">
                    Nenhum registro encontrado.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={creating || Boolean(editing)} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? `Editar ${label.toLowerCase()}` : `Novo ${label.toLowerCase()}`}>
        <Stack>
          <TextInput label="Nome" value={name} onChange={(event) => setName(event.currentTarget.value)} />
          {error && <Alert color="red">{error}</Alert>}
          <Button onClick={handleSave} loading={createMutation.isPending || updateMutation.isPending}>
            Salvar
          </Button>
        </Stack>
      </Modal>
    </div>
  );
}
