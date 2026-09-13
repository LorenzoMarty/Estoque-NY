import { BarChart, DonutChart } from "@mantine/charts";
import { Badge, Group, Loader, Select, Table, Tabs, Text, Title } from "@mantine/core";
import { useMemo, useState } from "react";
import { useBranchesQuery, useSkusQuery } from "../../shared/api/catalog";
import { strings } from "../../shared/strings";
import { useAbcReport, useTurnoverReport, useValuationReport } from "./api";
import { countByAbcClass, topValuationByLabel } from "./chartData";

function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(value);
}

export function ReportsPage() {
  const [branchId, setBranchId] = useState<number | undefined>(undefined);
  const { data: branches } = useBranchesQuery();
  const { data: skus } = useSkusQuery();
  const { data: valuation, isLoading: loadingValuation } = useValuationReport(branchId);
  const { data: turnover, isLoading: loadingTurnover } = useTurnoverReport(branchId);
  const { data: abc, isLoading: loadingAbc } = useAbcReport(branchId);

  const skuLabel = useMemo(() => {
    const map = new Map((skus ?? []).map((s) => [s.id, s.sku_code]));
    return (id: number) => map.get(id) ?? `VAR-${id}`;
  }, [skus]);

  const valuationChart = useMemo(() => (valuation ? topValuationByLabel(valuation, skuLabel) : []), [valuation, skuLabel]);
  const abcCounts = useMemo(() => (abc ? countByAbcClass(abc) : []), [abc]);
  const branchOptions = useMemo(() => (branches ?? []).map((b) => ({ value: String(b.id), label: b.name })), [branches]);

  return (
    <div>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={2}>{strings.nav.reports}</Title>
          <Text c="dimmed" size="sm">
            Relatórios de estoque
          </Text>
        </div>
        <Select
          placeholder="Todas as filiais"
          data={branchOptions}
          clearable
          value={branchId ? String(branchId) : null}
          onChange={(value) => setBranchId(value ? Number(value) : undefined)}
        />
      </Group>

      <Tabs defaultValue="valuation">
        <Tabs.List>
          <Tabs.Tab value="valuation">Valorização</Tabs.Tab>
          <Tabs.Tab value="turnover">Giro</Tabs.Tab>
          <Tabs.Tab value="abc">Curva ABC</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="valuation" pt="md">
          {loadingValuation ? (
            <Loader />
          ) : (
            <>
              {valuationChart.length > 0 && (
                <BarChart
                  h={300}
                  data={valuationChart as unknown as Record<string, unknown>[]}
                  dataKey="label"
                  series={[{ name: "valuation", color: "blue.6" }]}
                  mb="lg"
                  valueFormatter={(value) => formatMoney(value)}
                />
              )}
              <Table.ScrollContainer minWidth={500}>
                <Table striped>
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
                </Table>
              </Table.ScrollContainer>
            </>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="turnover" pt="md">
          {loadingTurnover ? (
            <Loader />
          ) : (
            <Table.ScrollContainer minWidth={500}>
              <Table striped>
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
              </Table>
            </Table.ScrollContainer>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="abc" pt="md">
          {loadingAbc ? (
            <Loader />
          ) : (
            <Group align="flex-start">
              {abcCounts.some((c) => c.count > 0) && (
                <DonutChart
                  data={abcCounts.map((c) => ({ name: `Classe ${c.class_name}`, value: c.count, color: c.color }))}
                  withLabelsLine
                  withLabels
                />
              )}
              <Table.ScrollContainer minWidth={400} style={{ flex: 1 }}>
                <Table striped>
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
                          <Badge color={row.class_name === "A" ? "teal" : row.class_name === "B" ? "yellow" : "red"}>
                            {row.class_name}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Group>
          )}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
