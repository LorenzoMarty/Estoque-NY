import { describe, expect, it, vi } from "vitest";
import { mapApiError } from "./formErrors";
import { ApiError } from "./httpClient";

const validation = (details: unknown) =>
  new ApiError("invalid request payload", {
    status: 400,
    path: "/x",
    code: "validation_error",
    payload: { error: { code: "validation_error", details } },
  });

describe("mapApiError", () => {
  const form = () => ({ setError: vi.fn(), getValues: () => ({ name: "", sku_code: "" }) }) as never;

  it("maps issues to fields and leaves no form-level message when all are mapped", () => {
    const f = form() as { setError: ReturnType<typeof vi.fn> };
    const msg = mapApiError(validation([{ loc: ["body", "name"], msg: "Campo obrigatório" }]), f as never, "fallback");
    expect(msg).toBeNull();
    expect(f.setError).toHaveBeenCalledWith("name", { type: "server", message: "Campo obrigatório" });
  });

  it("keeps unknown-field issues as the form-level message", () => {
    const msg = mapApiError(validation([{ loc: ["body", "other"], msg: "Ruim" }]), form(), "fallback");
    expect(msg).toBe("Ruim");
  });

  it("uses the error message for other failures and the fallback for non-errors", () => {
    expect(mapApiError(new Error("Conflito"), form(), "fallback")).toBe("Conflito");
    expect(mapApiError("x", form(), "fallback")).toBe("fallback");
  });
});
