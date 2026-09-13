import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("renders one nav link per non-hidden route, grouped under their section label", () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getByText("Visão geral")).toBeInTheDocument();
    expect(screen.getByText("Usuários & Permissões")).toBeInTheDocument();
    expect(screen.queryByText("Login")).not.toBeInTheDocument();
    expect(screen.getByText("Operação")).toBeInTheDocument();
    expect(screen.getByText("Configurações")).toBeInTheDocument();
  });
});
