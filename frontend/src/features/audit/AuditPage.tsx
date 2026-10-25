import { Button, Group, Modal, Select, Table, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { QueryState } from "../../shared/ui/QueryState";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusPill } from "../../shared/ui/StatusPill";
import { DataTable } from "../../shared/ui/DataTable";
import { PageHeader } from "../../shared/ui/PageHeader";
import type { StatusTone } from "../../app/theme";
import { strings } from "../../shared/strings";
import { useBranchesQuery } from "../../shared/api/catalog";
import { downloadAuditCsv, useAuditLogsQuery, type AuditFilters, type AuditLog } from "./api";
import { computeDiff } from "./diff";

const tableFeatureSet = tableFeatures({});
const columnHelper = createColumnHelper<typeof tableFeatureSet, AuditLog>();
const EMPTY_ROWS: AuditLog[] = [];

const DIFF_TONES: Record<string, StatusTone> = { added: "good", removed: "critical", changed: "warning", unchanged: "neutral" };

function DiffModal({ log, onClose }: { log: AuditLog | null; onClose: () => void }) {
  const entries = useMemo(() => (log ? computeDiff(log.before_json, log.after_json) : []), [log]);
  return (
    <Modal opened={Boolean(log)} onClose={onClose} title={log ? `${log.action} — ${log.resource_type} #${log.resource_id ?? "-"}` : ""} size="lg">
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Campo</Table.Th>
            <Table.Th>Antes</Table.Th>
            <Table.Th>Depois</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {entries.map((entry) => (
            <Table.Tr key={entry.key}>
              <Table.Td>
                <StatusPill tone={DIFF_TONES[entry.status]}>
                  {entry.key}
                </StatusPill>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c={entry.status === "removed" || entry.status === "changed" ? "red" : "dimmed"}>
                  {entry.before === undefined ? "—" : JSON.stringify(entry.before)}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c={entry.status === "added" || entry.status === "changed" ? "teal" : "dimmed"}>
                  {entry.after === undefined ? "—" : JSON.stringify(entry.after)}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
          {entries.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={3}>
                <Text c="dimmed" ta="center" py="md">
                  Sem alterações registradas.
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Modal>
  );
}

export function AuditPage() {
  const [filters, setFilters] = useState<AuditFilters>({});
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const { data: logs, isLoading, isError, refetch } = useAuditLogsQuery(filters);
  const { data: branches } = useBranchesQuery();
  const branchOptions = useMemo(() => (branches ?? []).map((b) => ({ value: String(b.id), label: b.name })), [branches]);
  const setFilter = (key: keyof AuditFilters) => (value: string | null) =>
    setFilters((current) => ({ ...current, [key]: value || undefined }));

  async function exportCsv() {
    try {
      await downloadAuditCsv(filters);
    } catch (error) {
      notifications.show({
        color: "red",
        title: "Não foi possível exportar",
        message: error instanceof Error ? error.message : "Tente novamente.",
      });
    }
  }

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("created_at", { header: "Quando", cell: (info) => new Date(info.getValue()).toLocaleString("pt-BR") }),
        columnHelper.accessor("action", { header: "Ação" }),
        columnHelper.accessor("resource_type", { header: "Recurso" }),
        columnHelper.accessor("resource_id", { header: "ID", cell: (info) => info.getValue() ?? "—" }),
        columnHelper.accessor("user_id", { header: "Usuário", cell: (info) => (info.getValue() ? `#${info.getValue()}` : "Sistema") }),
        columnHelper.display({
          id: "actions",
          header: "Ações",
          cell: (info) => (
            <Button size="xs" variant="subtle" onClick={() => setSelectedLog(info.row.original)}>
              Ver diferenças
            </Button>
          ),
        }),
      ]),
    []
  );

  const table = useTable({ features: tableFeatureSet, columns, data: logs ?? EMPTY_ROWS });

  return (
    <div className="workspace-page">
      <PageHeader title={strings.nav.audit} subtitle="Trilha de auditoria de ações administrativas" />

      <Group className="toolbar-card">
        <TextInput
          aria-label="Buscar por ação ou recurso"
          placeholder="Buscar por ação ou recurso"
          leftSection={<Search size={16} />}
          value={filters.q ?? ""}
          onChange={(event) => setFilter("q")(event.currentTarget.value)}
          w={{ base: "100%", sm: 320 }}
        />
        <TextInput
          aria-label="Recurso"
          placeholder="Recurso (ex.: branch)"
          value={filters.resourceType ?? ""}
          onChange={(event) => setFilter("resourceType")(event.currentTarget.value)}
          w={{ base: "100%", sm: 170 }}
        />
        <TextInput
          aria-label="ID do recurso"
          placeholder="ID do recurso"
          value={filters.resourceId ?? ""}
          onChange={(event) => setFilter("resourceId")(event.currentTarget.value)}
          w={{ base: "100%", sm: 130 }}
        />
        <TextInput
          aria-label="ID do usuário"
          placeholder="ID do usuário"
          value={filters.userId ?? ""}
          onChange={(event) => setFilter("userId")(event.currentTarget.value)}
          w={{ base: "100%", sm: 130 }}
        />
        <Select
          aria-label="Filial"
          placeholder="Todas as filiais"
          clearable
          data={branchOptions}
          value={filters.branchId ?? null}
          onChange={setFilter("branchId")}
          w={{ base: "100%", sm: 190 }}
        />
        <TextInput
          type="date"
          aria-label="De"
          value={filters.fromDate ?? ""}
          onChange={(event) => setFilter("fromDate")(event.currentTarget.value)}
        />
        <TextInput
          type="date"
          aria-label="Até"
          value={filters.toDate ?? ""}
          onChange={(event) => setFilter("toDate")(event.currentTarget.value)}
        />
        <Button variant="default" leftSection={<Download size={16} />} onClick={() => void exportCsv()}>
          Exportar CSV
        </Button>
      </Group>

      <QueryState isLoading={isLoading} isError={isError} isEmpty={(logs ?? []).length === 0} errorMessage="Não foi possível carregar a auditoria." emptyMessage="Nenhum registro de auditoria encontrado." onRetry={() => void refetch()}>
        <DataTable minWidth={700}>
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
      </QueryState>

      <DiffModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
