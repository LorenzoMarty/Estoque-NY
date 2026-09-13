import { Alert, Badge, Button, Group, Loader, Modal, NumberInput, Table, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { useSkusQuery } from "../../shared/api/catalog";
import { useCloseCount, useInventoryCountQuery, usePatchCountLines, usePostCount, useCancelCount } from "./api";

const STATUS_LABELS: Record<string, string> = { OPEN: "Aberta", CLOSED: "Fechada", POSTED: "Lançada", CANCELLED: "Cancelada" };

export function CountDetailModal({ countId, onClose }: { countId: number | null; onClose: () => void }) {
  const { data: count, isLoading } = useInventoryCountQuery(countId);
  const { data: skus } = useSkusQuery();
  const [countedById, setCountedById] = useState<Record<number, number>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const patchLines = usePatchCountLines(countId ?? 0);
  const closeCount = useCloseCount();
  const postCount = usePostCount();
  const cancelCount = useCancelCount();

  const skuById = useMemo(() => new Map((skus ?? []).map((s) => [s.id, s])), [skus]);

  useEffect(() => {
    if (!count) return;
    setCountedById(
      Object.fromEntries(count.lines.map((line) => [line.sku_id, line.counted_qty ?? line.system_qty]))
    );
  }, [count]);

  async function handleSaveLines() {
    if (!count) return;
    setApiError(null);
    try {
      await patchLines.mutateAsync(
        count.lines.map((line) => ({ sku_id: line.sku_id, counted_qty: countedById[line.sku_id] ?? line.system_qty }))
      );
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Não foi possível salvar a contagem.");
    }
  }

  async function handleAction(action: "close" | "post" | "cancel") {
    if (!countId) return;
    setApiError(null);
    try {
      if (action === "close") await closeCount.mutateAsync(countId);
      else if (action === "post") await postCount.mutateAsync(countId);
      else await cancelCount.mutateAsync(countId);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Ação não pôde ser concluída.");
    }
  }

  return (
    <Modal opened={countId != null} onClose={onClose} title={count ? `Contagem #${count.id}` : "Contagem"} size="lg">
      {isLoading && (
        <Group justify="center" py="lg">
          <Loader />
        </Group>
      )}
      {count && (
        <>
          <Group justify="space-between" mb="md">
            <Badge>{STATUS_LABELS[count.status] ?? count.status}</Badge>
            {count.status === "OPEN" && (
              <Group gap="xs">
                <Button size="xs" variant="light" onClick={handleSaveLines} loading={patchLines.isPending}>
                  Salvar contagem
                </Button>
                <Button size="xs" onClick={() => handleAction("close")} loading={closeCount.isPending}>
                  Fechar
                </Button>
                <Button size="xs" color="red" variant="subtle" onClick={() => handleAction("cancel")} loading={cancelCount.isPending}>
                  Cancelar
                </Button>
              </Group>
            )}
            {count.status === "CLOSED" && (
              <Button size="xs" onClick={() => handleAction("post")} loading={postCount.isPending}>
                Lançar ajustes
              </Button>
            )}
          </Group>

          {apiError && (
            <Alert color="red" mb="md">
              {apiError}
            </Alert>
          )}

          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Variação</Table.Th>
                <Table.Th>Sistema</Table.Th>
                <Table.Th>Contado</Table.Th>
                <Table.Th>Diferença</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {count.lines.map((line) => {
                const sku = skuById.get(line.sku_id);
                const counted = countedById[line.sku_id] ?? line.system_qty;
                return (
                  <Table.Tr key={line.id}>
                    <Table.Td>{sku ? `${sku.sku_code} — ${sku.name ?? ""}` : `VAR-${line.sku_id}`}</Table.Td>
                    <Table.Td>{line.system_qty}</Table.Td>
                    <Table.Td>
                      {count.status === "OPEN" ? (
                        <NumberInput
                          value={counted}
                          min={0}
                          w={100}
                          onChange={(value) => setCountedById((prev) => ({ ...prev, [line.sku_id]: Number(value) || 0 }))}
                        />
                      ) : (
                        (line.counted_qty ?? "—")
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text c={counted - line.system_qty === 0 ? "dimmed" : counted - line.system_qty > 0 ? "teal" : "red"}>
                        {counted - line.system_qty > 0 ? "+" : ""}
                        {counted - line.system_qty}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </>
      )}
    </Modal>
  );
}
