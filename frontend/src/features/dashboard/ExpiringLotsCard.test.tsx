import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ value: { data: [] as unknown[], isLoading: false, isError: false } }));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => state.value,
}));

import { ExpiringLotsCard } from "./ExpiringLotsCard";

function renderCard() {
  render(
    <MantineProvider>
      <ExpiringLotsCard branchId={null} branchNames={new Map([[1, "Filial A"]])} />
    </MantineProvider>
  );
}

describe("ExpiringLotsCard", () => {
  it("lists lots with how many days are left, flagging expired ones", () => {
    state.value = {
      isLoading: false,
      isError: false,
      data: [
        { id: 1, branch_id: 1, sku_code: "SKU-1", code: "L-OLD", expires_on: "2026-01-01", on_hand: 3, days_to_expiry: -4 },
        { id: 2, branch_id: 1, sku_code: "SKU-2", code: "L-NEW", expires_on: "2026-02-01", on_hand: 5, days_to_expiry: 12 },
      ],
    };
    renderCard();
    expect(screen.getByText("L-OLD")).toBeInTheDocument();
    expect(screen.getByText(/vencido há 4 d/)).toBeInTheDocument();
    expect(screen.getByText(/em 12 d/)).toBeInTheDocument();
  });

  it("says so when no lot is near expiry", () => {
    state.value = { isLoading: false, isError: false, data: [] };
    renderCard();
    expect(screen.getByText("Nenhum lote perto do vencimento.")).toBeInTheDocument();
  });

  it("shows an error instead of an empty state when the request fails", () => {
    state.value = { isLoading: false, isError: true, data: [] };
    renderCard();
    expect(screen.getByText(/Não foi possível carregar/)).toBeInTheDocument();
  });
});
