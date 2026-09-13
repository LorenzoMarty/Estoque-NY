import { Badge, Card, Group, Loader, Pagination, Select, SimpleGrid, Table, Text, Title } from "@mantine/core";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { strings } from "../../shared/strings";
import { useDashboardQuery } from "./api";
import { computeDashboardKpis, type DashboardFilters, type Kpi } from "./kpis";

const KPI_LABELS: Record<Kpi["key"], string> = {
  stock_total: "Saldo total",
  active_variations: "Variações ativas",
  stockout: "Rupturas",
  low_stock: "Estoque baixo",
  pending_transfers: "Transferências pendentes",
  open_counts: "Contagens abertas",
};

const PAGE_SIZE = 10;

interface MoveRow {
  id: number;
  occurred_at: string;
  sku_id: number;
  move_type: string;
  qty: number;
  balance_after: number;
  reference_id: string | null;
}

function trendColor(trend: Kpi["trend"]): string {
  if (trend.direction === "up") return "teal";
  if (trend.direction === "down") return "red";
  return "gray";
}

const tableFeatureSet = tableFeatures({});
const columnHelper = createColumnHelper<typeof tableFeatureSet, MoveRow>();
const moveColumns = columnHelper.columns([
  columnHelper.accessor("occurred_at", {
    header: "Data",
    cell: (info) => new Date(info.getValue()).toLocaleString("pt-BR"),
  }),
  columnHelper.accessor("sku_id", {
    header: "Variação",
    cell: (info) => `VAR-${String(info.getValue()).padStart(4, "0")}`,
  }),
  columnHelper.accessor("move_type", { header: "Tipo" }),
  columnHelper.accessor("qty", { header: "Qtd" }),
  columnHelper.accessor("balance_after", { header: "Saldo após" }),
  columnHelper.accessor("reference_id", { header: "Referência", cell: (info) => info.getValue() || "—" }),
]);
const EMPTY_MOVE_ROWS: MoveRow[] = [];

export function DashboardPage() {
  const { data, isLoading, isError } = useDashboardQuery();
  const [filters, setFilters] = useState<DashboardFilters>({ branchId: "all", period: "30" });
  const [page, setPage] = useState(1);

  const kpis = useMemo(() => (data ? computeDashboardKpis(data, filters) : []), [data, filters]);

  const moveRows: MoveRow[] = useMemo(() => {
    if (!data) return [];
    return data.moves
      .filter((move) => filters.branchId === "all" || move.branch_id === Number(filters.branchId))
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
  }, [data, filters.branchId]);

  const totalPages = Math.max(1, Math.ceil(moveRows.length / PAGE_SIZE));
  const pagedRows = moveRows.length ? moveRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : EMPTY_MOVE_ROWS;

  const table = useTable({ features: tableFeatureSet, columns: moveColumns, data: pagedRows });

  if (isLoading) {
    return (
      <Group justify="center" mt="xl">
        <Loader />
      </Group>
    );
  }

  if (isError || !data) {
    return (
      <Text c="red" mt="xl">
        Não foi possível carregar os dados do dashboard.
      </Text>
    );
  }

  return (
    <div className="workspace-page dashboard-page">
      <Group className="page-hero page-hero-operation" justify="space-between">
        <div>
          <Title order={2}>{strings.nav.dashboard}</Title>
          <Text c="dimmed" size="sm">
            Visão geral do estoque
          </Text>
        </div>
        <Group className="dashboard-filter-bar">
          <Select
            data={[{ value: "all", label: "Todas as filiais" }, ...data.branches.map((b) => ({ value: String(b.id), label: b.name }))]}
            value={filters.branchId}
            onChange={(value) => {
              setFilters((prev) => ({ ...prev, branchId: value ?? "all" }));
              setPage(1);
            }}
          />
          <Select
            data={[
              { value: "7", label: "Últimos 7 dias" },
              { value: "30", label: "Últimos 30 dias" },
              { value: "90", label: "Últimos 90 dias" },
            ]}
            value={filters.period}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, period: (value as DashboardFilters["period"]) ?? "30" }))
            }
          />
        </Group>
      </Group>

      <SimpleGrid className="kpi-panel-grid" cols={{ base: 1, sm: 2, lg: 3 }}>
        {kpis.map((kpi) => (
          <Card key={kpi.key} className="kpi-card-shell" withBorder radius="md" padding="md">
            <Text size="sm" c="dimmed">
              {KPI_LABELS[kpi.key]}
            </Text>
            <Group justify="space-between" align="flex-end" mt="xs">
              <Text fw={700} size="xl">
                {kpi.value.toLocaleString("pt-BR")}
              </Text>
              <Badge color={trendColor(kpi.trend)} variant="light">
                {kpi.trend.direction === "flat" ? "estável" : `${kpi.trend.value.toFixed(0)}%`}
              </Badge>
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      <Card className="workspace-card" withBorder radius="md" padding="md">
        <Title order={4} mb="sm">
          Movimentações recentes
        </Title>
        <Table.ScrollContainer className="data-table-card" minWidth={860}>
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
              {pagedRows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={moveColumns.length}>
                    <Text c="dimmed" ta="center" py="md">
                      Nenhuma movimentação no período selecionado.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Group justify="flex-end" mt="sm">
          <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
        </Group>
      </Card>
    </div>
  );
}
