import { MantineProvider } from "@mantine/core";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BranchSwitcher } from "./BranchSwitcher";
import { useActiveBranch, useBranchStore } from "./useActiveBranch";

// jsdom has no ResizeObserver, which Mantine's Select relies on.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

Element.prototype.scrollIntoView ??= () => {};

let branches: { id: number; name: string }[] = [];

vi.mock("../../shared/api/catalog", () => ({
  useBranchesQuery: () => ({ data: branches, isLoading: false }),
}));

const A = { id: 1, name: "Filial A" };
const B = { id: 2, name: "Filial B" };

describe("useActiveBranch", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useBranchStore.setState({ selected: null });
    branches = [A, B];
  });

  it("starts on the consolidated view when the user has several branches", () => {
    const { result } = renderHook(() => useActiveBranch());
    expect(result.current.active).toBe("all");
    expect(result.current.branchId).toBeUndefined();
    expect(result.current.canConsolidate).toBe(true);
  });

  it("is locked on the only branch of a single-branch user, with no consolidated view", () => {
    branches = [B];
    const { result } = renderHook(() => useActiveBranch());
    expect(result.current.active).toBe(2);
    expect(result.current.branchId).toBe(2);
    expect(result.current.canConsolidate).toBe(false);
  });

  it("remembers the chosen branch in localStorage", () => {
    const { result } = renderHook(() => useActiveBranch());
    act(() => result.current.select(2));
    expect(result.current.branchId).toBe(2);
    expect(window.localStorage.getItem("estoque.activeBranch")).toBe("2");
  });

  it("ignores a stored branch the user can no longer use", () => {
    useBranchStore.setState({ selected: 99 });
    const { result } = renderHook(() => useActiveBranch());
    expect(result.current.active).toBe("all");
  });

  it("ignores 'all' for a user with a single branch", () => {
    branches = [A];
    useBranchStore.setState({ selected: "all" });
    const { result } = renderHook(() => useActiveBranch());
    expect(result.current.active).toBe(1);
  });

  it("falls back to nothing while the user has no branch", () => {
    branches = [];
    const { result } = renderHook(() => useActiveBranch());
    expect(result.current.active).toBeNull();
    expect(result.current.branchId).toBeUndefined();
  });
});

describe("BranchSwitcher", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useBranchStore.setState({ selected: null });
    branches = [A, B];
  });

  function renderSwitcher() {
    return render(
      <MantineProvider>
        <BranchSwitcher />
      </MantineProvider>
    );
  }

  it("lists only the user's branches plus the consolidated option", async () => {
    renderSwitcher();
    await userEvent.click(screen.getAllByLabelText("Filial ativa")[0]);
    const options = (await screen.findAllByRole("option", { hidden: true })).map((o) => o.textContent);
    expect(options).toEqual(["Todas as filiais", "Filial A", "Filial B"]);
  });

  it("switches the active branch", async () => {
    renderSwitcher();
    await userEvent.click(screen.getAllByLabelText("Filial ativa")[0]);
    await userEvent.click(await screen.findByRole("option", { name: "Filial B", hidden: true }));
    expect(useBranchStore.getState().selected).toBe(2);
  });

  it("has no consolidated option for a single-branch user", async () => {
    branches = [A];
    const { container } = renderSwitcher();
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input).toHaveValue("Filial A");
    await userEvent.click(input);
    expect(screen.queryByRole("option", { name: "Todas as filiais", hidden: true })).toBeNull();
  });

  it("tells the user when no branch was assigned", () => {
    branches = [];
    renderSwitcher();
    expect(screen.queryByLabelText("Filial ativa")).toBeNull();
    expect(screen.getByText("Sem filiais atribuídas")).toBeInTheDocument();
  });
});
