import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { statusTones, theme } from "../../app/theme";
import { KpiStrip, trendText } from "../../features/dashboard/KpiStrip";
import type { Kpi } from "../../features/dashboard/kpis";
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

describe("KpiStrip", () => {
  const kpi = (overrides: Partial<Kpi>): Kpi => ({
    key: "stock_total",
    value: 1500,
    trend: { direction: "up", value: 56.4 },
    series: [1, 2, 3],
    ...overrides,
  });

  it("shows label, localized value and the improving trend as good", () => {
    renderWithTheme(<KpiStrip kpis={[kpi({})]} />);
    expect(screen.getByText("Saldo total")).toBeInTheDocument();
    expect(screen.getByText("1.500")).toBeInTheDocument();
    expect(screen.getByText("↑ 56% vs. período anterior")).toHaveAttribute("data-tone", "good");
  });

  it("colors by direction (better/worse) but draws the arrow from the real value change", () => {
    // Fewer stockouts: direction "up" (better, green) while the value went down.
    expect(trendText({ key: "stockout", trend: { direction: "up", value: 20 } })).toBe("↓ 20% vs. período anterior");
    renderWithTheme(<KpiStrip kpis={[kpi({ key: "stockout", value: 3, trend: { direction: "down", value: 20 } })]} />);
    const text = screen.getByText("↑ 20% vs. período anterior");
    expect(text).toHaveAttribute("data-tone", "critical");
  });

  it("shows flat trends as neutral text and hides the sparkline from assistive tech", () => {
    const { container } = renderWithTheme(<KpiStrip kpis={[kpi({ key: "open_counts", trend: { direction: "flat", value: 0 } })]} />);
    expect(screen.getByText("→ estável no período")).toHaveAttribute("data-tone", "neutral");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
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
