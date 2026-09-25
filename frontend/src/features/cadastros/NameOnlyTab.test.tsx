import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NameOnlyTab } from "./NameOnlyTab";

function renderTab(label = "Marca", newLabel = "Nova marca") {
  const create = vi.fn().mockResolvedValue({ id: 2, name: "Nike" });
  const remove = vi.fn().mockResolvedValue(undefined);
  const props = {
    label,
    newLabel,
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

async function openCreateModal(newLabel = "Nova marca") {
  await userEvent.click(screen.getByRole("button", { name: newLabel }));
  return within(await screen.findByRole("dialog"));
}

describe("NameOnlyTab", () => {
  it.each([
    ["Marca", "Nova marca"],
    ["Filial", "Nova filial"],
  ])("uses the gendered create label for %s", async (label, newLabel) => {
    renderTab(label, newLabel);
    expect(screen.getByRole("button", { name: newLabel })).toBeInTheDocument();

    const dialog = await openCreateModal(newLabel);
    expect(dialog.getByText(newLabel)).toBeInTheDocument();
  });

  it("clears the validation error as soon as the user types", async () => {
    const { create } = renderTab();
    const dialog = await openCreateModal();

    await userEvent.click(dialog.getByRole("button", { name: "Salvar" }));
    expect(await dialog.findByText("Informe o nome.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    await userEvent.type(dialog.getByLabelText("Nome"), "N");
    expect(dialog.queryByText("Informe o nome.")).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("saves when pressing Enter in the name field", async () => {
    const { create } = renderTab();
    const dialog = await openCreateModal();

    await userEvent.type(dialog.getByLabelText("Nome"), "Nike{Enter}");
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "Nike" }));
  });

  it("asks for confirmation before deleting; cancel does not delete", async () => {
    const { remove } = renderTab();

    await userEvent.click(screen.getByRole("button", { name: "Excluir" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(await dialog.findByText(/Esta ação não pode ser desfeita/)).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes only after confirming", async () => {
    const { remove } = renderTab();

    await userEvent.click(screen.getByRole("button", { name: "Excluir" }));
    const dialog = within(await screen.findByRole("dialog"));
    await userEvent.click(await dialog.findByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(1));
  });
});
