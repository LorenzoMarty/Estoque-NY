import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImportCatalogModal } from "./ImportCatalogModal";
import type { ImportReport } from "./importApi";

// jsdom has no ResizeObserver, which Mantine's Modal relies on.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const importCatalogCsv = vi.fn();
let failure: Error | null = null;
// a plain function: vitest's own mock bookkeeping must not see the rejection
vi.mock("./importApi", () => ({
  importCatalogCsv: (...args: unknown[]) =>
    failure ? Promise.reject(failure) : importCatalogCsv(...args),
}));

const totals = {
  rows: 3,
  valid_rows: 2,
  created_products: 2,
  created_skus: 2,
  updated_skus: 0,
  unchanged_skus: 0,
  opening_stock_applied: 2,
  opening_stock_skipped: 0,
  errors: 1,
};

const report = (overrides: Partial<ImportReport>): ImportReport => ({
  dry_run: true,
  mode: "all_or_nothing",
  applied: false,
  totals,
  errors: [{ row: 3, field: "price", message: "price cannot be negative" }],
  ...overrides,
});

function renderModal() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider>
        <ImportCatalogModal opened onClose={() => undefined} />
      </MantineProvider>
    </QueryClientProvider>
  );
}

async function pickFile(text: string) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, new File([text], "catalogo.csv", { type: "text/csv" }));
}

describe("ImportCatalogModal", () => {
  beforeEach(() => {
    importCatalogCsv.mockReset();
    failure = null;
  });

  it("cannot submit before a file is chosen", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Validar" })).toBeDisabled();
  });

  it("validates first (dry run, all or nothing) and lists the errors by line", async () => {
    importCatalogCsv.mockResolvedValue(report({}));
    renderModal();

    await pickFile("product_name,sku_code\nA,1\n");
    await userEvent.click(screen.getByRole("button", { name: "Validar" }));

    expect(importCatalogCsv).toHaveBeenCalledWith("product_name,sku_code\nA,1\n", {
      dryRun: true,
      mode: "all_or_nothing",
    });
    expect(await screen.findByText("Simulação: nada foi gravado.")).toBeInTheDocument();
    expect(screen.getByText("price cannot be negative")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Erros por linha" })).toHaveTextContent("3");
  });

  it("imports for real when the dry-run switch is turned off", async () => {
    importCatalogCsv.mockResolvedValue(report({ dry_run: false, applied: true, errors: [] }));
    renderModal();

    await pickFile("x");
    await userEvent.click(screen.getByRole("switch"));
    await userEvent.click(screen.getByRole("button", { name: "Importar" }));

    expect(importCatalogCsv).toHaveBeenCalledWith("x", { dryRun: false, mode: "all_or_nothing" });
    expect(await screen.findByText("Importação concluída.")).toBeInTheDocument();
  });

  it("says nothing was imported when errors blocked an all-or-nothing import", async () => {
    importCatalogCsv.mockResolvedValue(report({ dry_run: false, applied: false }));
    renderModal();

    await pickFile("x");
    await userEvent.click(screen.getByRole("switch"));
    await userEvent.click(screen.getByRole("button", { name: "Importar" }));

    expect(await screen.findByText(/Nada foi importado porque há linhas com erro/)).toBeInTheDocument();
  });

  it("shows the API error", async () => {
    failure = new Error("missing required columns: sku_code");
    renderModal();

    await pickFile("x");
    await userEvent.click(screen.getByRole("button", { name: "Validar" }));

    expect(await screen.findByText("missing required columns: sku_code")).toBeInTheDocument();
  });
});
