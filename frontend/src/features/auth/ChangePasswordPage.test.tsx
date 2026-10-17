import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangePasswordPage } from "./ChangePasswordPage";
import { useAuthStore } from "./store";

vi.mock("./api", () => ({
  changePassword: vi.fn(),
}));

import { changePassword } from "./api";

const user = { id: 1, name: "Ana", email: "ana@x.com", active: true, must_change_password: true, created_at: "2026-01-01" };

async function fill(current: string, next: string, confirm: string) {
  await userEvent.type(screen.getByLabelText("Senha atual"), current);
  await userEvent.type(screen.getByLabelText(/^Nova senha/), next);
  await userEvent.type(screen.getByLabelText("Confirme a nova senha"), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
}

function renderPage() {
  return render(
    <MantineProvider>
      <ChangePasswordPage />
    </MantineProvider>
  );
}

describe("ChangePasswordPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: true, isInitializing: false, user });
    vi.mocked(changePassword).mockReset();
  });

  it("rejects a short password without calling the API", async () => {
    renderPage();
    await fill("Old-Pass-123", "short1", "short1");
    expect(await screen.findByText("A nova senha precisa de pelo menos 10 caracteres.")).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("rejects a password without digits", async () => {
    renderPage();
    await fill("Old-Pass-123", "onlylettershere", "onlylettershere");
    expect(await screen.findByText("A nova senha precisa ter letras e números.")).toBeInTheDocument();
  });

  it("rejects a confirmation that does not match", async () => {
    renderPage();
    await fill("Old-Pass-123", "Brand-New-Pass-9", "Brand-New-Pass-8");
    expect(await screen.findByText("As senhas não conferem.")).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("rejects reusing the current password", async () => {
    renderPage();
    await fill("Old-Pass-123", "Old-Pass-123", "Old-Pass-123");
    expect(await screen.findByText("A nova senha precisa ser diferente da atual.")).toBeInTheDocument();
  });

  it("changes the password and clears the forced-change flag", async () => {
    vi.mocked(changePassword).mockResolvedValue(undefined);
    renderPage();
    await fill("Old-Pass-123", "Brand-New-Pass-9", "Brand-New-Pass-9");

    await vi.waitFor(() => expect(changePassword).toHaveBeenCalledWith("Old-Pass-123", "Brand-New-Pass-9"));
    await vi.waitFor(() => expect(useAuthStore.getState().user?.must_change_password).toBe(false));
  });

  it("shows the API error and keeps the flag when the API refuses", async () => {
    vi.mocked(changePassword).mockRejectedValue(new Error("current password is incorrect"));
    renderPage();
    await fill("Old-Pass-123", "Brand-New-Pass-9", "Brand-New-Pass-9");

    expect(await screen.findByText("current password is incorrect")).toBeInTheDocument();
    expect(useAuthStore.getState().user?.must_change_password).toBe(true);
  });
});
