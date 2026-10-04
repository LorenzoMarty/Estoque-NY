import { Button, Group, Loader, Modal, Table, Text, TextInput } from "@mantine/core";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusPill } from "../../shared/ui/StatusPill";
import { DataTable } from "../../shared/ui/DataTable";
import { PageHeader } from "../../shared/ui/PageHeader";
import type { StatusTone } from "../../app/theme";
import { strings } from "../../shared/strings";
import { useAuditLogsQuery, type AuditLog } from "./api";
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
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const { data: logs, isLoading, isError } = useAuditLogsQuery({ q: search || undefined });

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
          header: "",
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
          placeholder="Buscar por ação ou recurso"
          leftSection={<Search size={16} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          w={{ base: "100%", sm: 420 }}
        />
      </Group>

      {isLoading && (
        <Group justify="center" mt="xl">
          <Loader />
        </Group>
      )}
      {isError && (
        <Text c="red" mt="xl">
          Não foi possível carregar a auditoria.
        </Text>
      )}

      {!isLoading && !isError && (
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
              {(logs ?? []).length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={columns.length}>
                    <Text c="dimmed" ta="center" py="md">
                      Nenhum registro de auditoria encontrado.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </DataTable>
      )}

      <DiffModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
