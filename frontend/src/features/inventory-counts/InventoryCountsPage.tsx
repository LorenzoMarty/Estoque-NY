import { Button, Group, Loader, Modal, Table, Text } from "@mantine/core";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusPill } from "../../shared/ui/StatusPill";
import { PageHeader } from "../../shared/ui/PageHeader";
import { DataTable } from "../../shared/ui/DataTable";
import { strings } from "../../shared/strings";
import type { InventoryCount } from "../../shared/types/stock";
import { useInventoryCountsQuery } from "./api";
import { CountDetailModal } from "./CountDetailModal";
import { CreateCountForm } from "./CreateCountForm";
import { COUNT_STATUS_LABELS, COUNT_STATUS_TONES } from "./status";


const tableFeatureSet = tableFeatures({});
const columnHelper = createColumnHelper<typeof tableFeatureSet, InventoryCount>();
const EMPTY_ROWS: InventoryCount[] = [];

export function InventoryCountsPage() {
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: counts, isLoading, isError } = useInventoryCountsQuery();

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("id", { header: "ID", cell: (info) => `#${info.getValue()}` }),
        columnHelper.accessor("started_at", { header: "Iniciada em", cell: (info) => new Date(info.getValue()).toLocaleString("pt-BR") }),
        columnHelper.accessor("status", {
          header: "Status",
          cell: (info) => (
            <StatusPill tone={COUNT_STATUS_TONES[info.getValue()]}>
              {COUNT_STATUS_LABELS[info.getValue()]}
            </StatusPill>
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
      <PageHeader
        title={strings.nav.inventory_count}
        subtitle="Contagens de estoque"
        actions={
          <>
            <Button leftSection={<Plus size={16} />} onClick={() => setCreating(true)}>
          Nova contagem
        </Button>
          </>
        }
      />

      {isLoading && (
        <Group justify="center" mt="xl">
          <Loader />
        </Group>
      )}
      {isError && (
        <Text c="red" mt="xl">
          Não foi possível carregar as contagens.
        </Text>
      )}

      {!isLoading && !isError && (
        <DataTable minWidth={780}>
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
              {(counts ?? []).length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={columns.length}>
                    <Text c="dimmed" ta="center" py="md">
                      Nenhuma contagem encontrada.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </DataTable>
      )}

      <Modal opened={creating} onClose={() => setCreating(false)} title="Nova contagem" size="xl">
        <CreateCountForm onSuccess={() => setCreating(false)} />
      </Modal>
      <CountDetailModal countId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
