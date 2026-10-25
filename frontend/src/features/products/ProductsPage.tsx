import { Button, Group, Modal, SegmentedControl, Switch, Table, Text, TextInput } from "@mantine/core";
import { QueryState } from "../../shared/ui/QueryState";
import { notifications } from "@mantine/notifications";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Archive, ArchiveRestore, Download, LayoutGrid, List, Package, Pencil, Plus, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import SpotlightCard from "../../shared/reactbits/SpotlightCard";
import { STOCK_STATUS_META, stockStatus, summarizeStock } from "../../shared/stock";
import { strings } from "../../shared/strings";
import type { Product } from "../../shared/types/stock";
import { DataTable } from "../../shared/ui/DataTable";
import { PageHeader } from "../../shared/ui/PageHeader";
import { StatusPill } from "../../shared/ui/StatusPill";
import { ArchiveProductModal } from "./ArchiveProductModal";
import { useProductsQuery, useProductStockQuery, useRestoreProduct } from "./api";
import { downloadCatalogCsv } from "./importApi";
import { ImportCatalogModal } from "./ImportCatalogModal";
import { ProductForm } from "./ProductForm";
import { StockSummaryBar } from "./StockSummaryBar";

interface ProductRow extends Product {
  on_hand: number;
}

type ViewMode = "list" | "grid";

const tableFeatureSet = tableFeatures({});
const columnHelper = createColumnHelper<typeof tableFeatureSet, ProductRow>();
const EMPTY_ROWS: ProductRow[] = [];

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
  const [view, setView] = useState<ViewMode>("list");
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState<Product | null>(null);
  const restore = useRestoreProduct();
  const { data: products, isLoading, isError, refetch } = useProductsQuery({
    q: search || undefined,
    archived: showArchived,
  });
  const { data: stockByProduct } = useProductStockQuery();

  const rows: ProductRow[] = useMemo(
    () => (products ?? []).map((product) => ({ ...product, on_hand: stockByProduct?.get(product.id) ?? 0 })),
    [products, stockByProduct]
  );
  const summary = useMemo(() => summarizeStock(rows.map((row) => row.on_hand)), [rows]);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", { header: "Produto" }),
        columnHelper.accessor("brand", { header: "Marca", cell: (info) => info.getValue() || "—" }),
        columnHelper.accessor("on_hand", {
          header: "Em estoque",
          cell: (info) => info.getValue().toLocaleString("pt-BR"),
        }),
        columnHelper.display({
          id: "stock_status",
          header: "Situação",
          cell: (info) => {
            const meta = STOCK_STATUS_META[stockStatus(info.row.original.on_hand)];
            return <StatusPill tone={meta.tone}>{meta.label}</StatusPill>;
          },
        }),
        columnHelper.accessor("active", {
          header: "Cadastro",
          cell: (info) => (
            <StatusPill tone={info.getValue() ? "good" : "neutral"}>{info.getValue() ? "Ativo" : "Inativo"}</StatusPill>
          ),
        }),
        columnHelper.display({
          id: "actions",
          header: "Ações",
          cell: (info) =>
            showArchived ? (
              <Button
                size="xs"
                variant="subtle"
                leftSection={<ArchiveRestore size={14} />}
                loading={restore.isPending && restore.variables === info.row.original.id}
                onClick={() => restore.mutate(info.row.original.id)}
              >
                Restaurar
              </Button>
            ) : (
              <Group gap="xs">
                <Button size="xs" variant="subtle" leftSection={<Pencil size={14} />} onClick={() => setEditing(info.row.original)}>
                  Editar
                </Button>
                <Button size="xs" variant="subtle" color="red" leftSection={<Archive size={14} />} onClick={() => setArchiving(info.row.original)}>
                  Arquivar
                </Button>
              </Group>
            ),
        }),
      ]),
    [showArchived, restore]
  );

  const table = useTable({ features: tableFeatureSet, columns, data: rows.length ? rows : EMPTY_ROWS });

  return (
    <div className="workspace-page catalog-page">
      <PageHeader
        title={strings.nav.products}
        subtitle="Catálogo de produtos"
        actions={
          <>
            <Button variant="default" leftSection={<Download size={16} />} onClick={() => void exportCsv()}>
              Exportar CSV
            </Button>
            <Button variant="default" leftSection={<Upload size={16} />} onClick={() => setImporting(true)}>
              Importar CSV
            </Button>
            <Button leftSection={<Plus size={16} />} onClick={() => setCreating(true)}>
              Novo produto
            </Button>
          </>
        }
      />

      {!isLoading && !isError && <StockSummaryBar summary={summary} />}

      <Group justify="space-between" className="toolbar-card">
        <TextInput
          aria-label="Buscar por nome"
          placeholder="Buscar por nome"
          leftSection={<Search size={16} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          w={{ base: "100%", sm: 420 }}
        />
        <Switch
          label="Mostrar arquivados"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.currentTarget.checked)}
        />
        <SegmentedControl
          aria-label="Modo de visualização"
          value={view}
          onChange={(value) => setView(value as ViewMode)}
          data={[
            { value: "list", label: <List size={16} aria-label="Lista" /> },
            { value: "grid", label: <LayoutGrid size={16} aria-label="Cards" /> },
          ]}
        />
      </Group>

      <QueryState isLoading={isLoading} isError={isError} isEmpty={rows.length === 0} errorMessage="Não foi possível carregar os produtos." emptyMessage="Nenhum produto encontrado." onRetry={() => void refetch()}>
      {view === "list" ? (
        <DataTable minWidth={820}>
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
        </DataTable>
      ) : (
        <div className="product-grid">
          {rows.map((row) => {
            const meta = STOCK_STATUS_META[stockStatus(row.on_hand)];
            return (
              <SpotlightCard as="article" className="product-card" key={row.id}>
                <div className="product-card-media" aria-hidden>
                  <Package size={36} />
                </div>
                <div>
                  <h3>{row.name}</h3>
                  <Text c="dimmed" size="xs">
                    {row.brand || "Sem marca"}
                  </Text>
                </div>
                <div className="product-card-meta">
                  <span>{row.on_hand.toLocaleString("pt-BR")} em estoque</span>
                  <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                </div>
                <Button size="xs" variant="light" leftSection={<Pencil size={14} />} onClick={() => setEditing(row)}>
                  Editar
                </Button>
              </SpotlightCard>
            );
          })}
        </div>
      )}
      </QueryState>

      <ImportCatalogModal opened={importing} onClose={() => setImporting(false)} />
      <ArchiveProductModal product={archiving} onClose={() => setArchiving(null)} />

      <Modal opened={creating} onClose={() => setCreating(false)} title="Novo produto" size="xl">
        <ProductForm onSuccess={() => setCreating(false)} />
      </Modal>
      <Modal opened={Boolean(editing)} onClose={() => setEditing(null)} title="Editar produto" size="xl">
        {editing && <ProductForm product={editing} onSuccess={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
