import { Card, Table, Text, Title } from "@mantine/core";
import { DataTable } from "../../shared/ui/DataTable";
import { useLowStockQuery } from "../cadastros/thresholds";

/** SKUs under the minimum set in Cadastros → Estoque mínimo, biggest gap first. */
export function LowStockCard({ branchId, branchNames }: { branchId: number | null; branchNames: Map<number, string> }) {
  const { data, isLoading, isError } = useLowStockQuery(branchId);
  const items = data ?? [];

  return (
    <Card padding="lg" className="low-stock-card">
      <Title order={3}>Abaixo do mínimo</Title>
      <Text c="dimmed" size="sm" mb="md">
        Variações com menos estoque que o mínimo da filial
      </Text>
      {isLoading ? (
        <Text c="dimmed">Carregando…</Text>
      ) : isError ? (
        <Text c="red">Não foi possível carregar os alertas de estoque.</Text>
      ) : items.length === 0 ? (
        <Text c="dimmed" ta="center" py="md">
          Nenhuma variação abaixo do mínimo.
        </Text>
      ) : (
        <DataTable minWidth={520}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Variação</Table.Th>
              <Table.Th>Filial</Table.Th>
              <Table.Th>Em estoque</Table.Th>
              <Table.Th>Mínimo</Table.Th>
              <Table.Th>Faltam</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((item) => (
              <Table.Tr key={item.threshold_id}>
                <Table.Td>
                  {item.sku_code} — {item.name ?? "Sem nome"}
                </Table.Td>
                <Table.Td>{branchNames.get(item.branch_id) ?? item.branch_id}</Table.Td>
                <Table.Td>{item.on_hand}</Table.Td>
                <Table.Td>{item.min_qty}</Table.Td>
                <Table.Td>
                  <strong>{item.missing}</strong>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </DataTable>
      )}
    </Card>
  );
}
