import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryState } from "./QueryState";

const base = { isLoading: false, isError: false, errorMessage: "Falhou." };
const show = (props: Partial<Parameters<typeof QueryState>[0]>) =>
  render(
    <MantineProvider>
      <QueryState {...base} {...props}>
        <p>conteudo</p>
      </QueryState>
    </MantineProvider>
  );

describe("QueryState", () => {
  it("shows an announced loading state", () => {
    show({ isLoading: true });
    expect(screen.getByRole("status")).toHaveTextContent("Carregando");
    expect(screen.queryByText("conteudo")).not.toBeInTheDocument();
  });

  it("shows the error and retries on click", async () => {
    const onRetry = vi.fn();
    show({ isError: true, onRetry });
    expect(screen.getByRole("alert")).toHaveTextContent("Falhou.");
    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows the empty message, or the content when there is data", () => {
    const { unmount } = show({ isEmpty: true, emptyMessage: "Nada aqui." });
    expect(screen.getByText("Nada aqui.")).toBeInTheDocument();
    unmount();
    show({});
    expect(screen.getByText("conteudo")).toBeInTheDocument();
  });
});
