import { Badge, Button, Group, Loader, Modal, Table, Text, Title } from "@mantine/core";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { strings } from "../../shared/strings";
import type { Transfer, TransferStatus } from "../../shared/types/stock";
import { useCancelTransfer, useReceiveTransfer, useShipTransfer, useTransfersQuery } from "./api";
import { TransferForm } from "./TransferForm";

const STATUS_COLORS: Record<TransferStatus, string> = {
  DRAFT: "gray",
  SHIPPED: "blue",
  RECEIVED: "teal",
  CANCELLED: "red",
};

const STATUS_LABELS: Record<TransferStatus, string> = {
  DRAFT: "Rascunho",
  SHIPPED: "Enviada",
  RECEIVED: "Recebida",
  CANCELLED: "Cancelada",
};

const tableFeatureSet = tableFeatures({});
const columnHelper = createColumnHelper<typeof tableFeatureSet, Transfer>();
const EMPTY_ROWS: Transfer[] = [];

export function TransfersPage() {
  const [creating, setCreating] = useState(false);
  const { data: transfers, isLoading, isError } = useTransfersQuery();
  const shipTransfer = useShipTransfer();
  const receiveTransfer = useReceiveTransfer();
  const cancelTransfer = useCancelTransfer();

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("id", { header: "ID", cell: (info) => `#${info.getValue()}` }),
        columnHelper.accessor("created_at", { header: "Criada em", cell: (info) => new Date(info.getValue()).toLocaleString("pt-BR") }),
        columnHelper.accessor("status", {
          header: "Status",
          cell: (info) => (
            <Badge color={STATUS_COLORS[info.getValue()]} variant="light">
              {STATUS_LABELS[info.getValue()]}
            </Badge>
          ),
        }),
        columnHelper.accessor("items", { header: "Itens", cell: (info) => info.getValue().length }),
        columnHelper.accessor("note", { header: "Observação", cell: (info) => info.getValue() || "—" }),
        columnHelper.display({
          id: "actions",
          header: "Ações",
          cell: (info) => {
            const transfer = info.row.original;
            if (transfer.status === "DRAFT") {
              return (
                <Group gap="xs">
                  <Button size="xs" onClick={() => shipTransfer.mutate(transfer.id)} loading={shipTransfer.isPending}>
                    Enviar
                  </Button>
                  <Button size="xs" color="red" variant="subtle" onClick={() => cancelTransfer.mutate(transfer.id)}>
                    Cancelar
                  </Button>
                </Group>
              );
            }
            if (transfer.status === "SHIPPED") {
              return (
                <Button size="xs" onClick={() => receiveTransfer.mutate(transfer.id)} loading={receiveTransfer.isPending}>
                  Receber
                </Button>
              );
            }
            return null;
          },
        }),
      ]),
    [shipTransfer, receiveTransfer, cancelTransfer]
  );

  const table = useTable({ features: tableFeatureSet, columns, data: transfers ?? EMPTY_ROWS });

  return (
    <div className="workspace-page logistics-page">
      <Group className="page-hero page-hero-logistics" justify="space-between">
        <div>
          <Title order={2}>{strings.nav.transfers}</Title>
          <Text c="dimmed" size="sm">
            Transferências entre filiais
          </Text>
        </div>
        <Button leftSection={<Plus size={16} />} onClick={() => setCreating(true)}>
          Nova transferência
        </Button>
      </Group>

      {isLoading && (
        <Group justify="center" mt="xl">
          <Loader />
        </Group>
      )}
      {isError && (
        <Text c="red" mt="xl">
          Não foi possível carregar as transferências.
        </Text>
      )}

      {!isLoading && !isError && (
        <Table.ScrollContainer className="data-table-card" minWidth={920}>
          <Table striped highlightOnHover>
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
              {(transfers ?? []).length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={columns.length}>
                    <Text c="dimmed" ta="center" py="md">
                      Nenhuma transferência encontrada.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Modal opened={creating} onClose={() => setCreating(false)} title="Nova transferência" size="xl">
        <TransferForm onSuccess={() => setCreating(false)} />
      </Modal>
    </div>
  );
}
