import { useActiveBranch } from "../branch/useActiveBranch";
import { BarChart, DonutChart } from "@mantine/charts";
import { Group, Table, Tabs } from "@mantine/core";
import { QueryState } from "../../shared/ui/QueryState";
import { useMemo } from "react";
import { palette } from "../../app/theme";
import { PageHeader } from "../../shared/ui/PageHeader";
import { StatusPill } from "../../shared/ui/StatusPill";
import { DataTable } from "../../shared/ui/DataTable";
import { useSkusQuery } from "../../shared/api/catalog";
import { strings } from "../../shared/strings";
import { useAbcReport, useTurnoverReport, useValuationReport } from "./api";
import { countByAbcClass, topValuationByLabel } from "./chartData";

function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(value);
}

export function ReportsPage() {
  const { branchId, ready } = useActiveBranch();
  const { data: skus } = useSkusQuery();
  const { data: valuation, isLoading: loadingValuation, isError: errorValuation, refetch: refetchValuation } = useValuationReport(branchId, ready);
  const { data: turnover, isLoading: loadingTurnover, isError: errorTurnover, refetch: refetchTurnover } = useTurnoverReport(branchId, ready);
  const { data: abc, isLoading: loadingAbc, isError: errorAbc, refetch: refetchAbc } = useAbcReport(branchId, ready);

  const skuLabel = useMemo(() => {
    const map = new Map((skus ?? []).map((s) => [s.id, s.sku_code]));
    return (id: number) => map.get(id) ?? `VAR-${id}`;
  }, [skus]);

  const valuationChart = useMemo(() => (valuation ? topValuationByLabel(valuation, skuLabel) : []), [valuation, skuLabel]);
  const abcCounts = useMemo(() => (abc ? countByAbcClass(abc) : []), [abc]);

  return (
    <div className="workspace-page report-page">
      <PageHeader title={strings.nav.reports} subtitle="Relatórios de estoque" />

      <Tabs className="report-tabs" defaultValue="valuation" variant="pills">
        <Tabs.List>
          <Tabs.Tab value="valuation">Valorização</Tabs.Tab>
          <Tabs.Tab value="turnover">Giro</Tabs.Tab>
          <Tabs.Tab value="abc">Curva ABC</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="valuation" pt="md">
          <QueryState isLoading={loadingValuation || !ready} isError={errorValuation} isEmpty={(valuation ?? []).length === 0} errorMessage="Não foi possível carregar o relatório de valorização." emptyMessage="Sem dados para este relatório." onRetry={() => void refetchValuation()}>
            <>
              {valuationChart.length > 0 && (
                <BarChart
                  className="report-chart-card"
                  h={300}
                  data={valuationChart as unknown as Record<string, unknown>[]}
                  dataKey="label"
                  series={[{ name: "valuation", color: palette.chartBlue }]}
                  mb="lg"
                  valueFormatter={(value) => formatMoney(value)}
                />
              )}
              <DataTable minWidth={760}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Variação</Table.Th>
                      <Table.Th>Saldo</Table.Th>
                      <Table.Th>Custo unit.</Table.Th>
                      <Table.Th>Valorização</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {(valuation ?? []).map((row, index) => (
                      <Table.Tr key={index}>
                        <Table.Td>{skuLabel(row.sku_id)}</Table.Td>
                        <Table.Td>{row.on_hand}</Table.Td>
                        <Table.Td>{formatMoney(Number(row.cost))}</Table.Td>
                        <Table.Td>{formatMoney(Number(row.valuation))}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </DataTable>
            </>
          </QueryState>
        </Tabs.Panel>

        <Tabs.Panel value="turnover" pt="md">
          <QueryState isLoading={loadingTurnover || !ready} isError={errorTurnover} isEmpty={(turnover ?? []).length === 0} errorMessage="Não foi possível carregar o relatório de giro." emptyMessage="Sem dados para este relatório." onRetry={() => void refetchTurnover()}>
            <DataTable minWidth={760}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Variação</Table.Th>
                    <Table.Th>Saída (qtd)</Table.Th>
                    <Table.Th>Estoque médio</Table.Th>
                    <Table.Th>Giro</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(turnover ?? []).map((row, index) => (
                    <Table.Tr key={index}>
                      <Table.Td>{skuLabel(row.sku_id)}</Table.Td>
                      <Table.Td>{row.issued_qty}</Table.Td>
                      <Table.Td>{row.average_stock.toFixed(1)}</Table.Td>
                      <Table.Td>{row.turnover.toFixed(2)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </DataTable>
          </QueryState>
        </Tabs.Panel>

        <Tabs.Panel value="abc" pt="md">
          <QueryState isLoading={loadingAbc || !ready} isError={errorAbc} isEmpty={(abc ?? []).length === 0} errorMessage="Não foi possível carregar o relatório de curva ABC." emptyMessage="Sem dados para este relatório." onRetry={() => void refetchAbc()}>
            <Group className="report-split-panel" align="flex-start">
              {abcCounts.some((c) => c.count > 0) && (
                <DonutChart
                  data={abcCounts.map((c) => ({ name: `Classe ${c.class_name}`, value: c.count, color: c.color }))}
                  withLabelsLine
                  withLabels
                />
              )}
              <DataTable minWidth={680} style={{ flex: 1 }}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Variação</Table.Th>
                      <Table.Th>Valor movimentado</Table.Th>
                      <Table.Th>% acumulado</Table.Th>
                      <Table.Th>Classe</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {(abc ?? []).map((row, index) => (
                      <Table.Tr key={index}>
                        <Table.Td>{skuLabel(row.sku_id)}</Table.Td>
                        <Table.Td>{formatMoney(Number(row.movement_value))}</Table.Td>
                        <Table.Td>{row.cumulative_percent.toFixed(1)}%</Table.Td>
                        <Table.Td>
                          <StatusPill tone={row.class_name === "A" ? "good" : row.class_name === "B" ? "warning" : "critical"}>
                            Classe {row.class_name}
                          </StatusPill>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </DataTable>
            </Group>
          </QueryState>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
