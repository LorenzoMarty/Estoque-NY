import { Button, Group, Loader, Modal, SegmentedControl, Table, Text, TextInput } from "@mantine/core";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { LayoutGrid, List, Package, Pencil, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import SpotlightCard from "../../shared/reactbits/SpotlightCard";
import { STOCK_STATUS_META, stockStatus, summarizeStock } from "../../shared/stock";
import { strings } from "../../shared/strings";
import type { Product } from "../../shared/types/stock";
import { DataTable } from "../../shared/ui/DataTable";
import { PageHeader } from "../../shared/ui/PageHeader";
import { StatusPill } from "../../shared/ui/StatusPill";
import { useProductsQuery, useProductStockQuery } from "./api";
import { ProductForm } from "./ProductForm";
import { StockSummaryBar } from "./StockSummaryBar";

interface ProductRow extends Product {
  on_hand: number;
}

type ViewMode = "list" | "grid";

const tableFeatureSet = tableFeatures({});
const columnHelper = createColumnHelper<typeof tableFeatureSet, ProductRow>();
const EMPTY_ROWS: ProductRow[] = [];

export function ProductsPage() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("list");
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const { data: products, isLoading, isError } = useProductsQuery({ q: search || undefined });
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
          cell: (info) => (
            <Button size="xs" variant="subtle" leftSection={<Pencil size={14} />} onClick={() => setEditing(info.row.original)}>
              Editar
            </Button>
          ),
        }),
      ]),
    []
  );

  const table = useTable({ features: tableFeatureSet, columns, data: rows.length ? rows : EMPTY_ROWS });

  return (
    <div className="workspace-page catalog-page">
      <PageHeader
        title={strings.nav.products}
        subtitle="Catálogo de produtos"
        actions={
          <Button leftSection={<Plus size={16} />} onClick={() => setCreating(true)}>
            Novo produto
          </Button>
        }
      />

      {!isLoading && !isError && <StockSummaryBar summary={summary} />}

      <Group justify="space-between" className="toolbar-card">
        <TextInput
          placeholder="Buscar por nome"
          leftSection={<Search size={16} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          w={{ base: "100%", sm: 420 }}
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

      {isLoading && (
        <Group justify="center" mt="xl">
          <Loader />
        </Group>
      )}
      {isError && (
        <Text c="red" mt="xl">
          Não foi possível carregar os produtos.
        </Text>
      )}

      {!isLoading && !isError && view === "list" && (
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
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={columns.length}>
                  <Text c="dimmed" ta="center" py="md">
                    Nenhum produto encontrado.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </DataTable>
      )}

      {!isLoading && !isError && view === "grid" && (
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
          {rows.length === 0 && (
            <Text c="dimmed" py="md">
              Nenhum produto encontrado.
            </Text>
          )}
        </div>
      )}

      <Modal opened={creating} onClose={() => setCreating(false)} title="Novo produto" size="xl">
        <ProductForm onSuccess={() => setCreating(false)} />
      </Modal>
      <Modal opened={Boolean(editing)} onClose={() => setEditing(null)} title="Editar produto" size="xl">
        {editing && <ProductForm product={editing} onSuccess={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
