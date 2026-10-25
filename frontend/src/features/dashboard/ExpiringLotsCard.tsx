import { Card, Table, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../shared/api/httpClient";
import type { Paginated } from "../../shared/types/pagination";
import { DataTable } from "../../shared/ui/DataTable";

export interface ExpiringLot {
  id: number;
  branch_id: number;
  sku_code: string;
  code: string;
  expires_on: string | null;
  on_hand: number;
  days_to_expiry: number | null;
}

const WINDOW_DAYS = 30;

export function useExpiringLotsQuery(branchId: number | null) {
  return useQuery({
    queryKey: ["lots", "expiring", branchId],
    queryFn: async () => {
      const branch = branchId ? `&branch_id=${branchId}` : "";
      const page = await apiClient.get<Paginated<ExpiringLot>>(
        `/stock/lots?expiring_within_days=${WINDOW_DAYS}&page=1&page_size=10${branch}`
      );
      return page.items;
    },
    staleTime: 30_000,
  });
}

function daysLabel(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return `vencido há ${-days} d`;
  if (days === 0) return "vence hoje";
  return `em ${days} d`;
}

/** Lots that expire within a month (or already did), soonest first. */
export function ExpiringLotsCard({ branchId, branchNames }: { branchId: number | null; branchNames: Map<number, string> }) {
  const { data, isLoading, isError } = useExpiringLotsQuery(branchId);
  const items = data ?? [];

  return (
    <Card padding="lg" className="expiring-lots-card">
      <Title order={3}>Vencimento próximo</Title>
      <Text c="dimmed" size="sm" mb="md">
        Lotes que vencem em até {WINDOW_DAYS} dias, ou já venceram
      </Text>
      {isLoading ? (
        <Text c="dimmed">Carregando…</Text>
      ) : isError ? (
        <Text c="red">Não foi possível carregar os lotes.</Text>
      ) : items.length === 0 ? (
        <Text c="dimmed" ta="center" py="md">
          Nenhum lote perto do vencimento.
        </Text>
      ) : (
        <DataTable minWidth={520}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Variação</Table.Th>
              <Table.Th>Lote</Table.Th>
              <Table.Th>Filial</Table.Th>
              <Table.Th>Quantidade</Table.Th>
              <Table.Th>Vencimento</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((lot) => (
              <Table.Tr key={lot.id}>
                <Table.Td>{lot.sku_code}</Table.Td>
                <Table.Td>{lot.code}</Table.Td>
                <Table.Td>{branchNames.get(lot.branch_id) ?? lot.branch_id}</Table.Td>
                <Table.Td>{lot.on_hand}</Table.Td>
                <Table.Td>
                  <Text span c={lot.days_to_expiry !== null && lot.days_to_expiry < 0 ? "red" : undefined}>
                    {lot.expires_on ? new Date(`${lot.expires_on}T00:00:00`).toLocaleDateString("pt-BR") : "—"} · {daysLabel(lot.days_to_expiry)}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </DataTable>
      )}
    </Card>
  );
}
