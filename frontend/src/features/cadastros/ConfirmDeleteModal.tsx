import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";

interface ConfirmDeleteModalProps {
  opened: boolean;
  message: string;
  loading: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({ opened, message, loading, error, onConfirm, onCancel }: ConfirmDeleteModalProps) {
  return (
    <Modal opened={opened} onClose={onCancel} title="Confirmar exclusão">
      <Stack>
        <Text>{message}</Text>
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel}>
            Cancelar
          </Button>
          <Button color="red" onClick={onConfirm} loading={loading}>
            Excluir
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
