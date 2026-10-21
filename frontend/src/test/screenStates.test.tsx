import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditPage } from "../features/audit/AuditPage";
import { InventoryCountsPage } from "../features/inventory-counts/InventoryCountsPage";
import { CadastrosPage } from "../features/cadastros/CadastrosPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { MovementsPage } from "../features/movements/MovementsPage";
import { ProductsPage } from "../features/products/ProductsPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { TransfersPage } from "../features/transfers/TransfersPage";
import { UsersPage } from "../features/users/UsersPage";
import { VariationsPage } from "../features/variations/VariationsPage";

// jsdom has no ResizeObserver / scrollIntoView, which Mantine and Recharts rely on.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

const EMPTY_PAGE = { items: [], meta: { page: 1, page_size: 100, total: 0, next: null, prev: null } };

function jwt(): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify({ sub: "1", exp }))}.sig`;
}

function renderScreen(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MantineProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>
  );
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// [screen, element, error text, empty text] - the 3 states every screen must show.
const SCREENS: [string, () => ReactElement, RegExp, RegExp][] = [
  ["Produtos", () => <ProductsPage />, /carregar os produtos/, /Nenhum produto encontrado/],
  ["Variações", () => <VariationsPage />, /carregar as variações/, /Nenhuma variação encontrada/],
  ["Movimentações", () => <MovementsPage />, /carregar as movimentações/, /Nenhuma movimentação encontrada/],
  ["Transferências", () => <TransfersPage />, /carregar as transferências/, /Nenhuma transferência encontrada/],
  ["Contagem", () => <InventoryCountsPage />, /carregar as contagens/, /Nenhuma contagem encontrada/],
  ["Usuários", () => <UsersPage />, /carregar os usuários/, /Nenhum usuário encontrado/],
  ["Auditoria", () => <AuditPage />, /carregar a auditoria/, /Nenhum registro de auditoria encontrado/],
  ["Dashboard", () => <DashboardPage />, /dados do dashboard/, /Nenhuma movimentação no período/],
  ["Cadastros", () => <CadastrosPage />, /carregar marcas/i, /Nenhum registro encontrado/],
  ["Relatórios", () => <ReportsPage />, /carregar o relatório de valorização/, /Sem dados para este relatório/],
];

describe.each(SCREENS)("%s states", (_name, element, errorText, emptyText) => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("ESTOQUE_API_TOKEN", jwt());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("loading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderScreen(element());
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Carregando");
  });

  it("empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => json(String(url).includes("/auth/roles") ? [] : EMPTY_PAGE)));
    renderScreen(element());
    expect((await screen.findAllByText(emptyText))[0]).toBeInTheDocument();
  });

  it("error, then retry recovers", async () => {
    let failing = true;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (failing && !String(url).includes("/branches") ? json({}, 500) : json(String(url).includes("/auth/roles") ? [] : EMPTY_PAGE))));
    renderScreen(element());
    expect(await screen.findByText(errorText)).toBeInTheDocument();

    failing = false;
    await userEvent.click(screen.getAllByRole("button", { name: "Tentar novamente" })[0]);
    await waitFor(() => expect(screen.queryByText(errorText)).not.toBeInTheDocument());
    expect((await screen.findAllByText(emptyText))[0]).toBeInTheDocument();
  });
});
