import { Badge, Button, Group, Modal, Table, Text, Title } from "@mantine/core";
import { QueryState } from "../../shared/ui/QueryState";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { strings } from "../../shared/strings";
import type { InventoryCount, InventoryCountStatus } from "../../shared/types/stock";
import { useInventoryCountsQuery } from "./api";
import { CountDetailModal } from "./CountDetailModal";
import { CreateCountForm } from "./CreateCountForm";

const STATUS_COLORS: Record<InventoryCountStatus, string> = { OPEN: "blue", CLOSED: "orange", POSTED: "teal", CANCELLED: "red" };
const STATUS_LABELS: Record<InventoryCountStatus, string> = { OPEN: "Aberta", CLOSED: "Fechada", POSTED: "Lançada", CANCELLED: "Cancelada" };

const tableFeatureSet = tableFeatures({});
const columnHelper = createColumnHelper<typeof tableFeatureSet, InventoryCount>();
const EMPTY_ROWS: InventoryCount[] = [];

export function InventoryCountsPage() {
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: counts, isLoading, isError, refetch } = useInventoryCountsQuery();

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("id", { header: "ID", cell: (info) => `#${info.getValue()}` }),
        columnHelper.accessor("started_at", { header: "Iniciada em", cell: (info) => new Date(info.getValue()).toLocaleString("pt-BR") }),
        columnHelper.accessor("status", {
          header: "Status",
          cell: (info) => (
            <Badge color={STATUS_COLORS[info.getValue()]} variant="light">
              {STATUS_LABELS[info.getValue()]}
            </Badge>
          ),
        }),
        columnHelper.accessor("lines", { header: "Itens", cell: (info) => info.getValue().length }),
        columnHelper.display({
          id: "actions",
          header: "Ações",
          cell: (info) => (
            <Button size="xs" variant="subtle" onClick={() => setSelectedId(info.row.original.id)}>
              Abrir
            </Button>
          ),
        }),
      ]),
    []
  );

  const table = useTable({ features: tableFeatureSet, columns, data: counts ?? EMPTY_ROWS });

  return (
    <div className="workspace-page count-page">
      <Group className="page-hero page-hero-count" justify="space-between">
        <div>
          <Title order={2}>{strings.nav.inventory_count}</Title>
          <Text c="dimmed" size="sm">
            Contagens de estoque
          </Text>
        </div>
        <Button leftSection={<Plus size={16} />} onClick={() => setCreating(true)}>
          Nova contagem
        </Button>
      </Group>

      <QueryState isLoading={isLoading} isError={isError} isEmpty={(counts ?? []).length === 0} errorMessage="Não foi possível carregar as contagens." emptyMessage="Nenhuma contagem encontrada." onRetry={() => void refetch()}>
        <Table.ScrollContainer className="data-table-card" minWidth={780}>
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
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </QueryState>

      <Modal opened={creating} onClose={() => setCreating(false)} title="Nova contagem" size="xl">
        <CreateCountForm onSuccess={() => setCreating(false)} />
      </Modal>
      <CountDetailModal countId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
