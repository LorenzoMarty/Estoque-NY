import { requestJson, requestText } from "../../shared/api/httpClient";

export type ImportMode = "partial" | "all_or_nothing";

export interface ImportRowError {
  row: number;
  field: string | null;
  message: string;
}

export interface ImportReport {
  dry_run: boolean;
  mode: ImportMode;
  applied: boolean;
  totals: {
    rows: number;
    valid_rows: number;
    created_products: number;
    created_skus: number;
    updated_skus: number;
    unchanged_skus: number;
    opening_stock_applied: number;
    opening_stock_skipped: number;
    errors: number;
  };
  errors: ImportRowError[];
}

export function importCatalogCsv(text: string, options: { dryRun: boolean; mode: ImportMode }): Promise<ImportReport> {
  const query = new URLSearchParams({ dry_run: String(options.dryRun), mode: options.mode });
  return requestJson<ImportReport>(`/data/import/catalog?${query.toString()}`, {
    method: "POST",
    rawBody: text,
    headers: { "Content-Type": "text/csv" },
    timeoutMs: 120_000,
  });
}

export async function downloadCatalogCsv(): Promise<void> {
  const text = await requestText("/data/export/catalog.csv");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "catalogo.csv";
  link.click();
  URL.revokeObjectURL(url);
}
