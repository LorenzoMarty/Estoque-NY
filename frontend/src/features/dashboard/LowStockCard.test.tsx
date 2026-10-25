import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LowStockCard } from "./LowStockCard";

const state = vi.hoisted(() => ({ value: { data: [] as unknown[], isLoading: false, isError: false } }));
vi.mock("../cadastros/thresholds", () => ({ useLowStockQuery: () => state.value }));

function renderCard() {
  render(
    <MantineProvider>
      <LowStockCard branchId={null} branchNames={new Map([[1, "Filial A"]])} />
    </MantineProvider>
  );
}

describe("LowStockCard", () => {
  it("lists SKUs under their minimum with the gap", () => {
    state.value = {
      isLoading: false,
      isError: false,
      data: [{ threshold_id: 1, branch_id: 1, sku_id: 2, sku_code: "SKU-9", name: "Perfume", on_hand: 4, min_qty: 10, max_qty: null, missing: 6 }],
    };
    renderCard();
    expect(screen.getByText("SKU-9 — Perfume")).toBeInTheDocument();
    expect(screen.getByText("Filial A")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("says so when nothing is below the minimum", () => {
    state.value = { isLoading: false, isError: false, data: [] };
    renderCard();
    expect(screen.getByText("Nenhuma variação abaixo do mínimo.")).toBeInTheDocument();
  });

  it("shows an error instead of an empty state when the request fails", () => {
    state.value = { isLoading: false, isError: true, data: [] };
    renderCard();
    expect(screen.getByText(/Não foi possível carregar/)).toBeInTheDocument();
  });
});
