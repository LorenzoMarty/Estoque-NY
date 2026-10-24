import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BranchProfileModal } from "./BranchProfileModal";

const mutateAsync = vi.fn().mockResolvedValue({});
vi.mock("../../shared/api/catalog", () => ({
  useUpdateBranch: () => ({ mutateAsync, isPending: false }),
}));

const branch = {
  id: 1,
  name: "Filial A",
  created_at: "",
  public_name: null,
  address: null,
  phone: null,
  opening_hours: null,
  timezone: null,
};

describe("BranchProfileModal", () => {
  it("sends the profile with blank fields as null and hours only when filled", async () => {
    const onClose = vi.fn();
    render(
      <MantineProvider>
        <BranchProfileModal branch={branch} onClose={onClose} />
      </MantineProvider>
    );

    await userEvent.type(screen.getByLabelText("Nome público"), "NY Centro");
    await userEvent.type(screen.getByLabelText("Segunda"), "09:00-18:00");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const sent = mutateAsync.mock.calls[0][0];
    expect(sent).toMatchObject({ name: "Filial A", public_name: "NY Centro", address: null, timezone: null });
    expect(sent.opening_hours).toMatchObject({ mon: "09:00-18:00", tue: null, sun: null });
  });
});
