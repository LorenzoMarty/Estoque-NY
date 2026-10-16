import { Alert, Button, FileInput, Group, Modal, SegmentedControl, Stack, Switch, Table, Text } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { importCatalogCsv, type ImportMode, type ImportReport } from "./importApi";

const MAX_ERRORS_SHOWN = 50;

const TOTAL_LABELS: [keyof ImportReport["totals"], string][] = [
  ["rows", "Linhas lidas"],
  ["valid_rows", "Linhas válidas"],
  ["created_products", "Produtos novos"],
  ["created_skus", "Variações novas"],
  ["updated_skus", "Variações atualizadas"],
  ["unchanged_skus", "Variações sem mudança"],
  ["opening_stock_applied", "Estoque inicial lançado"],
  ["opening_stock_skipped", "Estoque inicial ignorado (já tem histórico)"],
  ["errors", "Linhas com erro"],
];

export function ImportCatalogModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [mode, setMode] = useState<ImportMode>("all_or_nothing");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importCatalogCsv(await file.text(), { dryRun, mode });
      setReport(result);
      if (result.applied) {
        await queryClient.invalidateQueries();
      }
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "Não foi possível importar o arquivo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Importar produtos, variações e estoque inicial" size="xl">
      <Stack>
        <Text size="sm" c="dimmed">
          CSV com as colunas product_name, brand, category, sku_code, sku_name, barcode, unit, cost, price, branch,
          location e opening_qty. O arquivo exportado por esta tela já está nesse formato. Reimportar o mesmo arquivo não
          duplica nada, e o estoque inicial só é lançado onde a variação ainda não tem movimentações.
        </Text>
        <FileInput
          label="Arquivo CSV"
          placeholder="Escolher arquivo"
          accept=".csv,text/csv"
          value={file}
          onChange={(value) => {
            setFile(value);
            setReport(null);
          }}
        />
        <Switch
          label="Somente validar (simulação, não grava nada)"
          checked={dryRun}
          onChange={(event) => setDryRun(event.currentTarget.checked)}
        />
        <SegmentedControl
          value={mode}
          onChange={(value) => setMode(value as ImportMode)}
          data={[
            { value: "all_or_nothing", label: "Tudo ou nada" },
            { value: "partial", label: "Importar as linhas válidas" },
          ]}
        />
        {error && <Alert color="red">{error}</Alert>}
        {report && (
          <Stack gap="xs">
            <Alert color={report.errors.length ? "yellow" : "teal"}>
              {report.dry_run
                ? "Simulação: nada foi gravado."
                : report.applied
                  ? "Importação concluída."
                  : "Nada foi importado porque há linhas com erro (modo tudo ou nada)."}
            </Alert>
            <Table withTableBorder>
              <Table.Tbody>
                {TOTAL_LABELS.map(([key, label]) => (
                  <Table.Tr key={key}>
                    <Table.Td>{label}</Table.Td>
                    <Table.Td>{report.totals[key]}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {report.errors.length > 0 && (
              <Table striped aria-label="Erros por linha">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Linha</Table.Th>
                    <Table.Th>Campo</Table.Th>
                    <Table.Th>Problema</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {report.errors.slice(0, MAX_ERRORS_SHOWN).map((item, index) => (
                    <Table.Tr key={`${item.row}-${index}`}>
                      <Table.Td>{item.row}</Table.Td>
                      <Table.Td>{item.field ?? "—"}</Table.Td>
                      <Table.Td>{item.message}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
            {report.errors.length > MAX_ERRORS_SHOWN && (
              <Text size="xs" c="dimmed">
                Mostrando os primeiros {MAX_ERRORS_SHOWN} de {report.errors.length} erros.
              </Text>
            )}
          </Stack>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={submit} loading={busy} disabled={!file}>
            {dryRun ? "Validar" : "Importar"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
