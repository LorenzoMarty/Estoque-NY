import { useActiveBranch } from "../branch/useActiveBranch";
import { Button, Group, Modal, Select, Table, Text, Title } from "@mantine/core";
import { QueryState } from "../../shared/ui/QueryState";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { strings } from "../../shared/strings";
import type { StockMove } from "../../shared/types/stock";
import { useMovesQuery, type MovementsFilters } from "./api";
import { MovementForm } from "./MovementForm";

const TYPE_LABELS: Record<string, string> = {
  RECEIPT: "Entrada",
  ISSUE: "Saída",
  ADJUSTMENT: "Ajuste",
  TRANSFER_SHIP: "Transferência (envio)",
  TRANSFER_RECEIVE: "Transferência (recebimento)",
};

const tableFeatureSet = tableFeatures({});
const columnHelper = createColumnHelper<typeof tableFeatureSet, StockMove>();
const columns = columnHelper.columns([
  columnHelper.accessor("occurred_at", { header: "Data", cell: (info) => new Date(info.getValue()).toLocaleString("pt-BR") }),
  columnHelper.accessor("sku_id", { header: "Variação", cell: (info) => `VAR-${String(info.getValue()).padStart(4, "0")}` }),
  columnHelper.accessor("move_type", { header: "Tipo", cell: (info) => TYPE_LABELS[info.getValue()] ?? info.getValue() }),
  columnHelper.accessor("qty", { header: "Qtd" }),
  columnHelper.accessor("balance_after", { header: "Saldo após" }),
  columnHelper.accessor("reason", { header: "Motivo", cell: (info) => info.getValue() || "—" }),
  columnHelper.accessor("reference_id", { header: "Referência", cell: (info) => info.getValue() || "—" }),
]);
const EMPTY_ROWS: StockMove[] = [];

export function MovementsPage() {
  const { branchId, ready } = useActiveBranch();
  const [localFilters, setFilters] = useState<MovementsFilters>({});
  const filters = useMemo(() => ({ ...localFilters, branchId }), [localFilters, branchId]);
  const [modalOpen, setModalOpen] = useState(false);
  const { data: moves, isLoading, isError, refetch } = useMovesQuery(filters, ready);

  const table = useTable({ features: tableFeatureSet, columns, data: moves ?? EMPTY_ROWS });

  return (
    <div className="workspace-page operation-page">
      <Group className="page-hero page-hero-operation" justify="space-between">
        <div>
          <Title order={2}>{strings.nav.movements}</Title>
          <Text c="dimmed" size="sm">
            Entradas, saídas e ajustes de estoque
          </Text>
        </div>
        <Button leftSection={<Plus size={16} />} onClick={() => setModalOpen(true)}>
          Nova movimentação
        </Button>
      </Group>

      <Group className="toolbar-card">
        <Select
          placeholder="Todos os tipos"
          data={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          clearable
          value={filters.type ?? null}
          onChange={(value) => setFilters((prev) => ({ ...prev, type: value ?? undefined }))}
        />
      </Group>

      <QueryState isLoading={isLoading || !ready} isError={isError} isEmpty={(moves ?? []).length === 0} errorMessage="Não foi possível carregar as movimentações." emptyMessage="Nenhuma movimentação encontrada." onRetry={() => void refetch()}>
        <Table.ScrollContainer className="data-table-card" minWidth={980}>
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

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="Nova movimentação" size="xl">
        <MovementForm onSuccess={() => setModalOpen(false)} />
      </Modal>
    </div>
  );
}
