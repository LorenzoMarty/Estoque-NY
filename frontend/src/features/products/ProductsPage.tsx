import { Badge, Button, Group, Modal, Table, Text, TextInput, Title } from "@mantine/core";
import { QueryState } from "../../shared/ui/QueryState";
import { notifications } from "@mantine/notifications";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Download, Pencil, Plus, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { strings } from "../../shared/strings";
import type { Product } from "../../shared/types/stock";
import { useProductsQuery } from "./api";
import { downloadCatalogCsv } from "./importApi";
import { ImportCatalogModal } from "./ImportCatalogModal";
import { ProductForm } from "./ProductForm";

const tableFeatureSet = tableFeatures({});
const columnHelper = createColumnHelper<typeof tableFeatureSet, Product>();
const EMPTY_ROWS: Product[] = [];

async function exportCsv() {
  try {
    await downloadCatalogCsv();
  } catch (error) {
    notifications.show({
      color: "red",
      title: "Não foi possível exportar",
      message: error instanceof Error ? error.message : "Tente novamente.",
    });
  }
}

export function ProductsPage() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const { data: products, isLoading, isError, refetch } = useProductsQuery({ q: search || undefined });

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", { header: "Nome" }),
        columnHelper.accessor("brand", { header: "Marca", cell: (info) => info.getValue() || "—" }),
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

  const table = useTable({ features: tableFeatureSet, columns, data: products ?? EMPTY_ROWS });

  return (
    <div className="workspace-page catalog-page">
      <Group className="page-hero page-hero-catalog" justify="space-between">
        <div>
          <Title order={2}>{strings.nav.products}</Title>
          <Text c="dimmed" size="sm">
            Catálogo de produtos
          </Text>
        </div>
        <Group gap="xs">
          <Button variant="default" leftSection={<Download size={16} />} onClick={() => void exportCsv()}>
            Exportar CSV
          </Button>
          <Button variant="default" leftSection={<Upload size={16} />} onClick={() => setImporting(true)}>
            Importar CSV
          </Button>
          <Button leftSection={<Plus size={16} />} onClick={() => setCreating(true)}>
            Novo produto
          </Button>
        </Group>
      </Group>

      <Group className="toolbar-card">
        <TextInput
          placeholder="Buscar por nome"
          leftSection={<Search size={16} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          w={{ base: "100%", sm: 420 }}
        />
      </Group>

      <QueryState isLoading={isLoading} isError={isError} isEmpty={(products ?? []).length === 0} errorMessage="Não foi possível carregar os produtos." emptyMessage="Nenhum produto encontrado." onRetry={() => void refetch()}>
        <Table.ScrollContainer className="data-table-card" minWidth={760}>
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
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </QueryState>

      <ImportCatalogModal opened={importing} onClose={() => setImporting(false)} />

      <Modal opened={creating} onClose={() => setCreating(false)} title="Novo produto" size="xl">
        <ProductForm onSuccess={() => setCreating(false)} />
      </Modal>
      <Modal opened={Boolean(editing)} onClose={() => setEditing(null)} title="Editar produto" size="xl">
        {editing && <ProductForm product={editing} onSuccess={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
