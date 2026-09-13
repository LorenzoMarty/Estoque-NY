import { Badge, Button, Group, Loader, Modal, Table, Text, TextInput, Title } from "@mantine/core";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Pencil, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { strings } from "../../shared/strings";
import type { Sku } from "../../shared/types/stock";
import { useSkusListQuery } from "./api";
import { SkuForm } from "./SkuForm";

const tableFeatureSet = tableFeatures({});
const columnHelper = createColumnHelper<typeof tableFeatureSet, Sku>();
const EMPTY_ROWS: Sku[] = [];

function formatMoney(value: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(Number(value));
}

export function VariationsPage() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Sku | null>(null);
  const [creating, setCreating] = useState(false);
  const { data: skus, isLoading, isError } = useSkusListQuery();

  const filtered = useMemo(() => {
    if (!skus) return EMPTY_ROWS;
    const term = search.toLowerCase();
    if (!term) return skus;
    return skus.filter(
      (sku) =>
        sku.sku_code.toLowerCase().includes(term) ||
        (sku.name ?? "").toLowerCase().includes(term) ||
        (sku.barcode ?? "").includes(term)
    );
  }, [skus, search]);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("sku_code", { header: "Código" }),
        columnHelper.accessor("name", { header: "Nome", cell: (info) => info.getValue() || "—" }),
        columnHelper.accessor("barcode", { header: "Código de barras", cell: (info) => info.getValue() || "—" }),
        columnHelper.accessor("price", { header: "Preço", cell: (info) => formatMoney(info.getValue()) }),
        columnHelper.accessor("active", {
          header: "Status",
          cell: (info) => (
            <Badge color={info.getValue() ? "teal" : "gray"} variant="light">
              {info.getValue() ? "Ativo" : "Inativo"}
            </Badge>
          ),
        }),
        columnHelper.display({
          id: "actions",
          header: "Ações",
          cell: (info) => (
            <Button size="xs" variant="subtle" leftSection={<Pencil size={14} />} onClick={() => setEditing(info.row.original)}>
              Editar
            </Button>
          ),
        }),
      ]),
    []
  );

  const table = useTable({ features: tableFeatureSet, columns, data: filtered });

  return (
    <div>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={2}>{strings.nav.variations}</Title>
          <Text c="dimmed" size="sm">
            Variações (SKUs) do catálogo
          </Text>
        </div>
        <Button leftSection={<Plus size={16} />} onClick={() => setCreating(true)}>
          Nova variação
        </Button>
      </Group>

      <TextInput
        placeholder="Buscar por código, nome ou código de barras"
        leftSection={<Search size={16} />}
        mb="md"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        maw={420}
      />

      {isLoading && (
        <Group justify="center" mt="xl">
          <Loader />
        </Group>
      )}
      {isError && (
        <Text c="red" mt="xl">
          Não foi possível carregar as variações.
        </Text>
      )}

      {!isLoading && !isError && (
        <Table.ScrollContainer minWidth={600}>
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
              {filtered.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={columns.length}>
                    <Text c="dimmed" ta="center" py="md">
                      Nenhuma variação encontrada.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Modal opened={creating} onClose={() => setCreating(false)} title="Nova variação">
        <SkuForm onSuccess={() => setCreating(false)} />
      </Modal>
      <Modal opened={Boolean(editing)} onClose={() => setEditing(null)} title="Editar variação">
        {editing && <SkuForm sku={editing} onSuccess={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
