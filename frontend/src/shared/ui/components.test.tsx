import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { Package } from "lucide-react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { statusTones, theme } from "../../app/theme";
import { KpiCard } from "./KpiCard";
import { PageHeader } from "./PageHeader";
import { StatusPill } from "./StatusPill";

function renderWithTheme(ui: ReactElement) {
  return render(<MantineProvider theme={theme}>{ui}</MantineProvider>);
}

describe("StatusPill", () => {
  it("renders the label and exposes its tone", () => {
    renderWithTheme(<StatusPill tone="critical">Sem estoque</StatusPill>);
    expect(screen.getByText("Sem estoque").closest("[data-tone]")).toHaveAttribute("data-tone", "critical");
  });

  it("maps every tone to a theme color", () => {
    expect(Object.keys(statusTones).sort()).toEqual(["critical", "good", "info", "neutral", "warning"]);
  });
});

describe("KpiCard", () => {
  it("shows label, localized value and the upward trend as good", () => {
    renderWithTheme(<KpiCard label="Saldo total" value={1500} icon={Package} trend={{ direction: "up", value: 56.4 }} />);
    expect(screen.getByText("Saldo total")).toBeInTheDocument();
    expect(screen.getByText("1.500")).toBeInTheDocument();
    expect(screen.getByText("56%").closest("[data-tone]")).toHaveAttribute("data-tone", "good");
  });

  it("shows a downward trend as critical and a flat trend as neutral text", () => {
    const { rerender } = renderWithTheme(
      <KpiCard label="Rupturas" value={3} icon={Package} trend={{ direction: "down", value: 20 }} />
    );
    expect(screen.getByText("20%").closest("[data-tone]")).toHaveAttribute("data-tone", "critical");

    rerender(
      <MantineProvider theme={theme}>
        <KpiCard label="Rupturas" value={3} icon={Package} trend={{ direction: "flat", value: 0 }} />
      </MantineProvider>
    );
    expect(screen.getByText("Estável").closest("[data-tone]")).toHaveAttribute("data-tone", "neutral");
  });
});

describe("PageHeader", () => {
  it("renders title, subtitle and actions", () => {
    renderWithTheme(<PageHeader title="Produtos" subtitle="Catálogo de produtos" actions={<button>Novo</button>} />);
    expect(screen.getByRole("heading", { name: "Produtos" })).toBeInTheDocument();
    expect(screen.getByText("Catálogo de produtos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Novo" })).toBeInTheDocument();
  });
});
