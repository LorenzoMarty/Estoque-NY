import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserBranchesModal } from "./UserBranchesModal";
import type { UserWithRoles } from "./api";

// jsdom has no ResizeObserver, which Mantine's Modal and MultiSelect rely on.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const mutateAsync = vi.fn();
let current:
  | { user_id: number; branch_ids: number[]; roles: Record<string, string>; unrestricted: boolean }
  | undefined;

vi.mock("./api", () => ({
  useUserBranchesQuery: () => ({ data: current, isLoading: false }),
  useSetUserBranches: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("../../shared/api/catalog", () => ({
  useBranchesQuery: () => ({
    data: [
      { id: 1, name: "Filial A" },
      { id: 2, name: "Filial B" },
    ],
  }),
}));

const user: UserWithRoles = { id: 7, name: "Ana", email: "ana@x.com", active: true, created_at: "2026-01-01", roles: [] };

function renderModal(onClose = vi.fn()) {
  render(
    <MantineProvider>
      <UserBranchesModal user={user} onClose={onClose} />
    </MantineProvider>
  );
  return onClose;
}

describe("UserBranchesModal", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    current = { user_id: 7, branch_ids: [1], roles: { "1": "auditor" }, unrestricted: false };
  });

  it("shows the branches the user already has and saves the new selection", async () => {
    mutateAsync.mockResolvedValue(undefined);
    const onClose = renderModal();

    expect((await screen.findAllByText("Filial A")).length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByLabelText("Filiais com acesso")[0]);
    await userEvent.click(await screen.findByRole("option", { name: "Filial B", hidden: true }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ userId: 7, branchIds: [1, 2], roles: { "1": "auditor" } }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("shows the API error and stays open when saving fails", async () => {
    mutateAsync.mockRejectedValue(new Error("unknown branch ids: [9]"));
    const onClose = renderModal();

    await userEvent.click(await screen.findByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("unknown branch ids: [9]")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("explains that admins ignore the list", async () => {
    current = { user_id: 7, branch_ids: [], roles: {}, unrestricted: true };
    renderModal();

    expect(await screen.findByText(/Administradores acessam todas as filiais/)).toBeInTheDocument();
  });
});
