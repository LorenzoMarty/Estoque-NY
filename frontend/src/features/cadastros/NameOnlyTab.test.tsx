import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NameOnlyTab } from "./NameOnlyTab";

function renderTab() {
  const create = vi.fn().mockResolvedValue({ id: 2, name: "Nike" });
  const remove = vi.fn().mockResolvedValue(undefined);
  const props = {
    label: "Marca",
    newLabel: "Nova marca",
    query: { isLoading: false, isError: false, data: [{ id: 1, name: "Adidas" }] },
    useCreate: () => ({ mutateAsync: create, isPending: false }),
    useUpdate: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDelete: () => ({ mutateAsync: remove, isPending: false }),
  };
  render(
    <MantineProvider>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <NameOnlyTab {...(props as any)} />
    </MantineProvider>
  );
  return { create, remove };
}

describe("NameOnlyTab", () => {
  it("uses the gendered label on the create button", () => {
    renderTab();
    expect(screen.getByRole("button", { name: "Nova marca" })).toBeInTheDocument();
  });

  it("saves on Enter and clears the stale error when typing", async () => {
    const { create } = renderTab();
    await userEvent.click(screen.getByRole("button", { name: "Nova marca" }));

    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Informe o nome.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Nome"), "Nike{Enter}");
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "Nike" }));
    expect(screen.queryByText("Informe o nome.")).not.toBeInTheDocument();
  });

  it("asks for confirmation before deleting; cancel does not delete", async () => {
    const { remove } = renderTab();

    await userEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(await screen.findByText(/Esta ação não pode ser desfeita/)).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes only after confirming", async () => {
    const { remove } = renderTab();

    await userEvent.click(screen.getByRole("button", { name: "Excluir" }));
    await userEvent.click(await within(await screen.findByRole("dialog")).findByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(1));
  });
});
