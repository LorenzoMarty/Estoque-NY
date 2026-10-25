import { BarChart, DonutChart } from "@mantine/charts";
import { Card, Pagination, SegmentedControl, Table, Tabs, Text, Title } from "@mantine/core";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import AnimatedRow from "../../shared/reactbits/AnimatedRow";
import { palette } from "../../app/theme";
import { useActiveBranch } from "../branch/useActiveBranch";
import { moveInGroup, type MoveGroup } from "../../shared/moveTypes";
import { strings } from "../../shared/strings";
import type { MoveType } from "../../shared/types/stock";
import { DataTable } from "../../shared/ui/DataTable";
import { QueryState } from "../../shared/ui/QueryState";
import { useDashboardQuery } from "./api";
import { KpiStrip } from "./KpiStrip";
import { LowStockCard } from "./LowStockCard";
import { flowByBucket, stockByCategory } from "./charts";
import { computeDashboardKpis, resolvePeriodRange, type DashboardFilters } from "./kpis";

const PAGE_SIZE = 8;
const PERIOD_OPTIONS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
];

type ChipTone = "pos" | "neg" | "warn" | "logi" | "neutral";

const MOVE_CHIPS: Record<MoveType, { label: string; tone: ChipTone }> = {
  RECEIPT: { label: "Entrada", tone: "pos" },
  ISSUE: { label: "Saída", tone: "neg" },
  ADJUSTMENT: { label: "Ajuste", tone: "warn" },
  TRANSFER_SHIP: { label: "Envio de transferência", tone: "logi" },
  TRANSFER_RECEIVE: { label: "Recebimento de transf.", tone: "logi" },
};

function formatSignedQty(qty: number): string {
  const sign = qty > 0 ? "+" : qty < 0 ? "−" : "";
  return `${sign}${Math.abs(qty).toLocaleString("pt-BR")}`;
}

const PAGINATION_LABELS = { first: "Primeira página", previous: "Página anterior", next: "Próxima página", last: "Última página" } as const;

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
    cell: (info) => {
      const date = new Date(info.getValue());
      return (
        <span className="cell-date">
          <span>{date.toLocaleDateString("pt-BR")}</span>
          <span className="mono cell-time">{date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
        </span>
      );
    },
  }),
  columnHelper.accessor("sku_id", {
    header: "Variação",
    cell: (info) => <span className="mono">{`VAR-${String(info.getValue()).padStart(4, "0")}`}</span>,
  }),
  columnHelper.accessor("move_type", {
    header: "Tipo",
    cell: (info) => {
      const chip = MOVE_CHIPS[info.getValue()] ?? { label: String(info.getValue()), tone: "neutral" as const };
      return (
        <span className="chip" data-tone={chip.tone}>
          {chip.label}
        </span>
      );
    },
  }),
  columnHelper.accessor("qty", {
    header: "Qtd",
    cell: (info) => (
      <span className="mono cell-qty" data-sign={Math.sign(info.getValue())}>
        {formatSignedQty(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("balance_after", {
    header: "Saldo após",
    cell: (info) => <span className="mono">{info.getValue().toLocaleString("pt-BR")}</span>,
  }),
  columnHelper.accessor("reference_id", {
    header: "Referência",
    cell: (info) => <span className="mono cell-ref">{info.getValue() || "—"}</span>,
  }),
]);
const NUMERIC_COLUMNS = new Set(["qty", "balance_after"]);
const EMPTY_MOVE_ROWS: MoveRow[] = [];

export function DashboardPage() {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useDashboardQuery();
  const { active, branches } = useActiveBranch();
  const [period, setPeriod] = useState<DashboardFilters["period"]>("30");
  const filters = useMemo<DashboardFilters>(
    () => ({ branchId: active === null || active === "all" ? "all" : String(active), period }),
    [active, period]
  );
  const [group, setGroup] = useState<MoveGroup>("all");
  const [page, setPage] = useState(1);
  const [rowsEntered, setRowsEntered] = useState(false);
  useEffect(() => setPage(1), [active]);

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

  if (isLoading || isError || !data) {
    return (
      <QueryState
        isLoading={isLoading}
        isError
        errorMessage="Não foi possível carregar os dados do dashboard."
        onRetry={() => void refetch()}
      >
        {null}
      </QueryState>
    );
  }

  const branchName =
    active === null || active === "all" ? "Todas as filiais" : (branches.find((branch) => branch.id === active)?.name ?? "Filial ativa");
  const updatedAt = new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const rangeStart = pagedRows.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = pagedRows.length ? rangeStart + pagedRows.length - 1 : 0;
  const categoryTotal = categorySlices.reduce((sum, slice) => sum + slice.value, 0);
  const hasFlow = flow.some((point) => point.entradas > 0 || point.saidas > 0);

  return (
    <div className="workspace-page dashboard-page">
      <header className="dash-header">
        <div className="dash-header-text">
          <span className="dash-eyebrow">Operação · {branchName}</span>
          <Title order={2} className="dash-title">
            {strings.nav.dashboard}
          </Title>
          <p className="dash-subtitle">
            Atualizado hoje às {updatedAt} · comparado aos {filters.period} dias anteriores
          </p>
        </div>
        <SegmentedControl
          aria-label="Período"
          className="period-control"
          data={PERIOD_OPTIONS}
          value={filters.period}
          onChange={(value) => setPeriod(value as DashboardFilters["period"])}
        />
      </header>

      <KpiStrip kpis={kpis} />

      <Card className="dash-card" padding={0}>
        <div className="dash-card-head">
          <Title order={3} className="dash-card-title">
            Movimentações recentes
          </Title>
          <Tabs
            value={group}
            onChange={(value) => {
              setGroup((value as MoveGroup) ?? "all");
              setPage(1);
            }}
            variant="pills"
            className="dash-group-tabs"
          >
            <Tabs.List>
              <Tabs.Tab value="all">Todas</Tabs.Tab>
              <Tabs.Tab value="in">Entradas</Tabs.Tab>
              <Tabs.Tab value="out">Saídas</Tabs.Tab>
              <Tabs.Tab value="transfer">Transferências</Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <Link className="dash-link" to="/movimentacoes">
            Ver todas as movimentações →
          </Link>
        </div>
        <DataTable bare tableClassName="dash-table" minWidth={760} label="Movimentações recentes">
          <Table.Thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <Table.Tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <Table.Th key={header.id} className={NUMERIC_COLUMNS.has(header.column.id) ? "num" : undefined}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </Table.Th>
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
                  <Table.Td key={cell.id} className={NUMERIC_COLUMNS.has(cell.column.id) ? "num" : undefined}>
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
        <div className="dash-card-foot">
          <span className="dash-range">
            Mostrando {rangeStart}–{rangeEnd} de {moveRows.length.toLocaleString("pt-BR")}
          </span>
          <nav aria-label="Paginação das movimentações">
            <Pagination
              total={totalPages}
              value={page}
              onChange={setPage}
              size="sm"
              className="dash-pagination"
              getControlProps={(control) => ({ "aria-label": PAGINATION_LABELS[control] })}
            />
          </nav>
        </div>
      </Card>

      <div className="dashboard-charts">
        <Card padding="lg">
          <Title order={3}>Entradas e saídas</Title>
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

        <Card padding="lg">
          <Title order={3}>Saldo por categoria</Title>
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

      <LowStockCard
        branchId={filters.branchId === "all" ? null : Number(filters.branchId)}
        branchNames={new Map((data?.branches ?? []).map((b) => [b.id, b.name]))}
      />
    </div>
  );
}
