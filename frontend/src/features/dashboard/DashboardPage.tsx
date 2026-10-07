import { BarChart, DonutChart } from "@mantine/charts";
import { Card, Group, Loader, Pagination, Select, Table, Tabs, Text, Title } from "@mantine/core";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  ClipboardCheck,
  Layers,
  PackageX,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import AnimatedRow from "../../shared/reactbits/AnimatedRow";
import { palette } from "../../app/theme";
import { MOVE_TYPE_LABELS, MOVE_TYPE_TONES, moveInGroup, type MoveGroup } from "../../shared/moveTypes";
import { strings } from "../../shared/strings";
import type { MoveType } from "../../shared/types/stock";
import { DataTable } from "../../shared/ui/DataTable";
import { KpiCard } from "../../shared/ui/KpiCard";
import { PageHeader } from "../../shared/ui/PageHeader";
import { StatusPill } from "../../shared/ui/StatusPill";
import { useDashboardQuery } from "./api";
import { flowByBucket, stockByCategory } from "./charts";
import { computeDashboardKpis, resolvePeriodRange, type DashboardFilters, type Kpi } from "./kpis";

const KPI_META: Record<Kpi["key"], { label: string; icon: LucideIcon }> = {
  stock_total: { label: "Saldo total", icon: Boxes },
  active_variations: { label: "Variações ativas", icon: Layers },
  stockout: { label: "Rupturas", icon: PackageX },
  low_stock: { label: "Estoque baixo", icon: AlertTriangle },
  pending_transfers: { label: "Transferências pendentes", icon: ArrowLeftRight },
  open_counts: { label: "Contagens abertas", icon: ClipboardCheck },
};

const PAGE_SIZE = 8;

interface MoveRow {
  id: number;
  occurred_at: string;
  sku_id: number;
  move_type: MoveType;
  qty: number;
  balance_after: number;
  reference_id: string | null;
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
  columnHelper.accessor("move_type", {
    header: "Tipo",
    cell: (info) => (
      <StatusPill tone={MOVE_TYPE_TONES[info.getValue()]}>{MOVE_TYPE_LABELS[info.getValue()]}</StatusPill>
    ),
  }),
  columnHelper.accessor("qty", { header: "Qtd" }),
  columnHelper.accessor("balance_after", { header: "Saldo após" }),
  columnHelper.accessor("reference_id", { header: "Referência", cell: (info) => info.getValue() || "—" }),
]);
const EMPTY_MOVE_ROWS: MoveRow[] = [];

export function DashboardPage() {
  const { data, isLoading, isError } = useDashboardQuery();
  const [filters, setFilters] = useState<DashboardFilters>({ branchId: "all", period: "30" });
  const [group, setGroup] = useState<MoveGroup>("all");
  const [page, setPage] = useState(1);
  const [rowsEntered, setRowsEntered] = useState(false);

  const kpis = useMemo(() => (data ? computeDashboardKpis(data, filters) : []), [data, filters]);
  const flow = useMemo(
    () => (data ? flowByBucket(data.moves, resolvePeriodRange(filters), filters.branchId) : []),
    [data, filters]
  );
  const categorySlices = useMemo(
    () =>
      data ? stockByCategory(data.balances, data.skus, data.products, data.categories, filters.branchId) : [],
    [data, filters.branchId]
  );

  const moveRows: MoveRow[] = useMemo(() => {
    if (!data) return [];
    return data.moves
      .filter((move) => filters.branchId === "all" || move.branch_id === Number(filters.branchId))
      .filter((move) => moveInGroup(move.move_type, group))
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
  }, [data, filters.branchId, group]);

  const totalPages = Math.max(1, Math.ceil(moveRows.length / PAGE_SIZE));
  const pagedRows = moveRows.length ? moveRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : EMPTY_MOVE_ROWS;
  const table = useTable({ features: tableFeatureSet, columns: moveColumns, data: pagedRows });
  const lastAnimatedIndex = Math.min(pagedRows.length - 1, 8);

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

  const categoryTotal = categorySlices.reduce((sum, slice) => sum + slice.value, 0);
  const hasFlow = flow.some((point) => point.entradas > 0 || point.saidas > 0);

  return (
    <div className="workspace-page dashboard-page">
      <PageHeader
        title={strings.nav.dashboard}
        subtitle="Visão geral do estoque"
        actions={
          <>
            <Select
              aria-label="Filial"
              data={[
                { value: "all", label: "Todas as filiais" },
                ...data.branches.map((b) => ({ value: String(b.id), label: b.name })),
              ]}
              value={filters.branchId}
              onChange={(value) => {
                setFilters((prev) => ({ ...prev, branchId: value ?? "all" }));
                setPage(1);
              }}
            />
            <Select
              aria-label="Período"
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
          </>
        }
      />

      <section className="kpi-tile-grid" aria-label="Indicadores">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.key}
            label={KPI_META[kpi.key].label}
            icon={KPI_META[kpi.key].icon}
            value={kpi.value}
            trend={kpi.trend}
          />
        ))}
      </section>

      <div className="dashboard-charts">
        <Card className="workspace-card" padding="lg">
          <Title order={4}>Entradas e saídas</Title>
          <Text c="dimmed" size="sm" mb="md">
            Unidades por intervalo, sem transferências nem ajustes
          </Text>
          {hasFlow ? (
            <BarChart
              h={260}
              data={flow}
              dataKey="label"
              series={[
                { name: "entradas", label: "Entradas", color: palette.chartBlue },
                { name: "saidas", label: "Saídas", color: palette.chartOrange },
              ]}
              withLegend
              legendProps={{ verticalAlign: "bottom", height: 32 }}
              gridAxis="x"
              tickLine="none"
              barProps={{ radius: [4, 4, 0, 0], maxBarSize: 18 }}
            />
          ) : (
            <Text c="dimmed" ta="center" py="xl">
              Sem entradas ou saídas no período selecionado.
            </Text>
          )}
        </Card>

        <Card className="workspace-card" padding="lg">
          <Title order={4}>Saldo por categoria</Title>
          <Text c="dimmed" size="sm" mb="md">
            Participação no estoque atual
          </Text>
          {categorySlices.length ? (
            <div className="category-donut">
              <DonutChart
                size={170}
                thickness={26}
                paddingAngle={2}
                data={categorySlices}
                withTooltip
                chartLabel={categoryTotal.toLocaleString("pt-BR")}
              />
              <ul className="category-legend">
                {categorySlices.map((slice) => (
                  <li key={slice.name}>
                    <span className="legend-swatch" style={{ background: slice.color }} aria-hidden />
                    <span className="legend-name">{slice.name}</span>
                    <strong>{slice.value.toLocaleString("pt-BR")}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Text c="dimmed" ta="center" py="xl">
              Nenhum saldo em estoque.
            </Text>
          )}
        </Card>
      </div>

      <Card className="workspace-card" padding="lg">
        <Group className="section-toolbar" justify="space-between" mb="sm">
          <Title order={4}>Movimentações recentes</Title>
          <Tabs
            value={group}
            onChange={(value) => {
              setGroup((value as MoveGroup) ?? "all");
              setPage(1);
            }}
            variant="pills"
          >
            <Tabs.List>
              <Tabs.Tab value="all">Todas</Tabs.Tab>
              <Tabs.Tab value="in">Entradas</Tabs.Tab>
              <Tabs.Tab value="out">Saídas</Tabs.Tab>
              <Tabs.Tab value="transfer">Transferências</Tabs.Tab>
            </Tabs.List>
          </Tabs>
        </Group>
        <DataTable minWidth={760}>
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
            {table.getRowModel().rows.map((row, index) => (
              <AnimatedRow
                key={row.id}
                index={index}
                animate={!rowsEntered}
                onEntered={index === lastAnimatedIndex ? () => setRowsEntered(true) : undefined}
              >
                {row.getAllCells().map((cell) => (
                  <Table.Td key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </Table.Td>
                ))}
              </AnimatedRow>
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
        </DataTable>
        <Group justify="flex-end" mt="sm">
          <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
        </Group>
      </Card>
    </div>
  );
}
