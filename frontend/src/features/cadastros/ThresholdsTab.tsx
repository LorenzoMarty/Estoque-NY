import { Alert, Button, Group, NumberInput, Select, Stack, Table } from "@mantine/core";
import { useMemo, useState, type FormEvent } from "react";
import { useBranchesQuery, useSkusQuery } from "../../shared/api/catalog";
import { DataTable } from "../../shared/ui/DataTable";
import { QueryState } from "../../shared/ui/QueryState";
import { useSetThreshold, useThresholdsQuery } from "./thresholds";

/** Minimum and maximum stock per SKU and branch. A minimum of 0 turns the alert off. */
export function ThresholdsTab() {
  const { data: branches } = useBranchesQuery();
  const { data: skus } = useSkusQuery();
  const query = useThresholdsQuery();
  const save = useSetThreshold();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [skuId, setSkuId] = useState<string | null>(null);
  const [min, setMin] = useState<number | string>("");
  const [max, setMax] = useState<number | string>("");
  const [error, setError] = useState<string | null>(null);

  const branchOptions = useMemo(() => (branches ?? []).map((b) => ({ value: String(b.id), label: b.name })), [branches]);
  const skuOptions = useMemo(
    () => (skus ?? []).map((s) => ({ value: String(s.id), label: `${s.sku_code} — ${s.name ?? "Sem nome"}` })),
    [skus]
  );
  const branchName = useMemo(() => new Map((branches ?? []).map((b) => [b.id, b.name])), [branches]);
  const skuLabel = useMemo(() => new Map((skus ?? []).map((s) => [s.id, `${s.sku_code} — ${s.name ?? "Sem nome"}`])), [skus]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!branchId || !skuId || min === "") {
      setError("Informe filial, variação e estoque mínimo.");
      return;
    }
    try {
      await save.mutateAsync({
        branch_id: Number(branchId),
        sku_id: Number(skuId),
        min_qty: Number(min),
        max_qty: max === "" ? null : Number(max),
      });
      setMin("");
      setMax("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  return (
    <div className="tab-stack">
      <form onSubmit={handleSubmit}>
        <Stack>
          <Group align="flex-end" grow>
            <Select label="Filial" data={branchOptions} value={branchId} onChange={setBranchId} />
            <Select label="Variação" searchable data={skuOptions} value={skuId} onChange={setSkuId} />
            <NumberInput label="Mínimo" min={0} value={min} onChange={setMin} description="0 desliga o alerta" />
            <NumberInput label="Máximo (opcional)" min={0} value={max} onChange={setMax} />
            <Button type="submit" loading={save.isPending}>
              Salvar
            </Button>
          </Group>
          {error && <Alert color="red">{error}</Alert>}
        </Stack>
      </form>

      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={(query.data ?? []).length === 0}
        errorMessage="Não foi possível carregar os limites."
        onRetry={() => void query.refetch?.()}
      >
        <DataTable minWidth={520}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Filial</Table.Th>
              <Table.Th>Variação</Table.Th>
              <Table.Th>Mínimo</Table.Th>
              <Table.Th>Máximo</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(query.data ?? []).map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td>{branchName.get(t.branch_id) ?? t.branch_id}</Table.Td>
                <Table.Td>{skuLabel.get(t.sku_id) ?? t.sku_id}</Table.Td>
                <Table.Td>{t.min_qty}</Table.Td>
                <Table.Td>{t.max_qty ?? "—"}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </DataTable>
      </QueryState>
    </div>
  );
}
