import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "./store";
import { LoginPage } from "./LoginPage";

vi.mock("./api", () => ({
  login: vi.fn(),
}));

import { login } from "./api";

function renderLoginPage() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </MantineProvider>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    vi.mocked(login).mockReset();
  });

  it("shows a validation error for an invalid email without calling the API", async () => {
    renderLoginPage();

    await userEvent.type(screen.getByLabelText("E-mail"), "not-an-email");
    await userEvent.type(screen.getByLabelText("Senha"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Informe um e-mail válido.")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("logs in and marks the store authenticated on valid credentials", async () => {
    vi.mocked(login).mockResolvedValue({
      id: 1,
      name: "Ana",
      email: "ana@x.com",
      active: true,
      created_at: "2026-01-01T00:00:00Z",
    });

    renderLoginPage();

    await userEvent.type(screen.getByLabelText("E-mail"), "ana@x.com");
    await userEvent.type(screen.getByLabelText("Senha"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true));
    expect(useAuthStore.getState().user?.email).toBe("ana@x.com");
  });
});
