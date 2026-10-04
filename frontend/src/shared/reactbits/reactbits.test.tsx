import { MantineProvider, Table } from "@mantine/core";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { theme } from "../../app/theme";
import AnimatedRow from "./AnimatedRow";
import CountUp from "./CountUp";
import SpotlightCard from "./SpotlightCard";
import { useReducedMotion } from "./useReducedMotion";

type Listener = () => void;

function mockReducedMotion(initial: boolean) {
  const listeners = new Set<Listener>();
  const state = { matches: initial };
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      get matches() {
        return state.matches;
      },
      media: query,
      addEventListener: (_: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
    })
  );
  return {
    set(value: boolean) {
      state.matches = value;
      listeners.forEach((listener) => listener());
    },
  };
}

function withTheme(ui: ReactElement) {
  return <MantineProvider theme={theme}>{ui}</MantineProvider>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useReducedMotion", () => {
  it("reads the preference and follows changes while mounted", () => {
    const media = mockReducedMotion(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
  });
});

describe("CountUp", () => {
  it("shows the final value immediately when motion is reduced", () => {
    mockReducedMotion(true);
    const { container } = render(withTheme(<CountUp to={1500} />));
    const visible = container.querySelector("[aria-hidden]");
    expect(visible).toHaveTextContent("1.500");
  });

  it("always exposes the final value to assistive tech, even before the animation ends", () => {
    mockReducedMotion(false);
    const { container } = render(withTheme(<CountUp to={1500} />));
    expect(screen.getByText("1.500")).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden]")).toHaveTextContent("0");
  });
});

describe("AnimatedRow", () => {
  const renderRow = (props: { animate: boolean }) =>
    render(
      withTheme(
        <Table>
          <Table.Tbody>
            <AnimatedRow index={0} {...props}>
              <Table.Td>valor</Table.Td>
            </AnimatedRow>
          </Table.Tbody>
        </Table>
      )
    );

  it("renders a plain table row when it should not animate", () => {
    mockReducedMotion(false);
    renderRow({ animate: false });
    expect(screen.getByText("valor").closest("tr")).not.toHaveStyle({ opacity: "0" });
  });

  it("renders a plain table row with reduced motion even when asked to animate", () => {
    mockReducedMotion(true);
    renderRow({ animate: true });
    expect(screen.getByText("valor").closest("tr")).not.toHaveStyle({ opacity: "0" });
  });

  it("starts hidden when animating with motion allowed", () => {
    mockReducedMotion(false);
    renderRow({ animate: true });
    expect(screen.getByText("valor").closest("tr")).toHaveStyle({ opacity: "0" });
  });
});

describe("SpotlightCard", () => {
  it("renders as the requested element, forwards props and tracks the pointer", () => {
    render(
      <SpotlightCard as="article" aria-label="Saldo" className="kpi-tile">
        conteudo
      </SpotlightCard>
    );
    const card = screen.getByLabelText("Saldo");
    expect(card.tagName).toBe("ARTICLE");
    expect(card).toHaveClass("card-spotlight", "kpi-tile");
    fireEvent.mouseMove(card, { clientX: 10, clientY: 20 });
    expect(card.style.getPropertyValue("--mouse-x")).toBe("10px");
    expect(card.style.getPropertyValue("--mouse-y")).toBe("20px");
  });
});
