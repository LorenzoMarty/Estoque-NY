import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { RouteError } from "./RouteError";

describe("RouteError", () => {
  it("replaces the screen when a lazy route fails to load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const router = createMemoryRouter(
      [
        {
          path: "/",
          errorElement: <RouteError />,
          lazy: async () => {
            throw new Error("Failed to fetch dynamically imported module");
          },
        },
      ],
      { initialEntries: ["/"] }
    );
    render(
      <MantineProvider>
        <RouterProvider router={router} />
      </MantineProvider>
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Recarregar" })).toBeInTheDocument());
  });
});
