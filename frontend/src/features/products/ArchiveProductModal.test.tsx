import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Product } from "../../shared/types/stock";
import { ArchiveProductModal } from "./ArchiveProductModal";

const mutateAsync = vi.fn();
vi.mock("./api", () => ({ useArchiveProduct: () => ({ mutateAsync, isPending: false }) }));

const product = { id: 5, name: "Perfume" } as Product;

function renderModal(onClose = vi.fn()) {
  render(
    <MantineProvider>
      <ArchiveProductModal product={product} onClose={onClose} />
    </MantineProvider>
  );
  return onClose;
}

describe("ArchiveProductModal", () => {
  it("archives with the typed reason and closes", async () => {
    mutateAsync.mockResolvedValueOnce({});
    const onClose = renderModal();

    await userEvent.type(screen.getByLabelText("Motivo (opcional)"), "descontinuado");
    await userEvent.click(screen.getByRole("button", { name: "Arquivar" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({ id: 5, reason: "descontinuado", force: false });
  });

  it("asks for force and a reason when the API reports stock on hand", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("product 5 has 3 units on hand; archive with force=true and a reason"));
    mutateAsync.mockResolvedValueOnce({});
    const onClose = renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Arquivar" }));
    const confirm = await screen.findByLabelText(/Arquivar mesmo com estoque/);
    const submit = screen.getByRole("button", { name: "Arquivar" });
    expect(submit).toBeDisabled();

    await userEvent.click(confirm);
    await userEvent.type(screen.getByLabelText("Motivo"), "baixa de linha");
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenLastCalledWith({ id: 5, reason: "baixa de linha", force: true });
  });
});
