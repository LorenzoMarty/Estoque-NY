import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "../../features/auth/store";
import { RequireAuth } from "./RequireAuth";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<div>Dashboard page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireAuth", () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
  });

  it("redirects to /login when not authenticated", () => {
    renderAt("/dashboard");
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("renders the protected route when authenticated", () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 1, name: "Ana", email: "ana@x.com", active: true, created_at: "2026-01-01T00:00:00Z" },
    });
    renderAt("/dashboard");
    expect(screen.getByText("Dashboard page")).toBeInTheDocument();
  });
});
