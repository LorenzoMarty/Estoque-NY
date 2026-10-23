import { useActiveBranch } from "../branch/useActiveBranch";
import { Button, Group, Modal, Select, Table } from "@mantine/core";
import { QueryState } from "../../shared/ui/QueryState";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../../shared/ui/PageHeader";
import { DataTable } from "../../shared/ui/DataTable";
import { MOVE_TYPE_LABELS, MOVE_TYPE_TONES } from "../../shared/moveTypes";
import { strings } from "../../shared/strings";
import { StatusPill } from "../../shared/ui/StatusPill";
import type { StockMove } from "../../shared/types/stock";
import { useMovesQuery, type MovementsFilters } from "./api";
import { MovementForm } from "./MovementForm";

const tableFeatureSet = tableFeatures({});
const columnHelper = createColumnHelper<typeof tableFeatureSet, StockMove>();
const columns = columnHelper.columns([
  columnHelper.accessor("occurred_at", { header: "Data", cell: (info) => new Date(info.getValue()).toLocaleString("pt-BR") }),
  columnHelper.accessor("sku_id", { header: "Variação", cell: (info) => `VAR-${String(info.getValue()).padStart(4, "0")}` }),
  columnHelper.accessor("move_type", { header: "Tipo", cell: (info) => <StatusPill tone={MOVE_TYPE_TONES[info.getValue()]}>{MOVE_TYPE_LABELS[info.getValue()]}</StatusPill> }),
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
      <PageHeader
        title={strings.nav.movements}
        subtitle="Entradas, saídas e ajustes de estoque"
        actions={
          <>
            <Button leftSection={<Plus size={16} />} onClick={() => setModalOpen(true)}>
          Nova movimentação
        </Button>
          </>
        }
      />

      <Group className="toolbar-card">
        <Select
          aria-label="Tipo de movimentação"
          placeholder="Todos os tipos"
          data={Object.entries(MOVE_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          clearable
          value={filters.type ?? null}
          onChange={(value) => setFilters((prev) => ({ ...prev, type: value ?? undefined }))}
        />
      </Group>

      <QueryState isLoading={isLoading || !ready} isError={isError} isEmpty={(moves ?? []).length === 0} errorMessage="Não foi possível carregar as movimentações." emptyMessage="Nenhuma movimentação encontrada." onRetry={() => void refetch()}>
        <DataTable minWidth={980}>
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
        </DataTable>
      </QueryState>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="Nova movimentação" size="xl">
        <MovementForm onSuccess={() => setModalOpen(false)} />
      </Modal>
    </div>
  );
}
