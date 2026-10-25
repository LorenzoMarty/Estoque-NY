import { describe, expect, it } from "vitest";
import { auditFilterParams } from "./api";

describe("auditFilterParams", () => {
  it("is empty without filters", () => {
    expect(auditFilterParams({}).toString()).toBe("");
  });

  it("maps every filter to the API's query names", () => {
    const params = auditFilterParams({
      q: "x",
      action: "branch.create",
      resourceType: "branch",
      resourceId: "7",
      userId: "3",
      branchId: "7",
    });
    expect(Object.fromEntries(params)).toEqual({
      q: "x",
      action: "branch.create",
      resource_type: "branch",
      resource_id: "7",
      user_id: "3",
      branch_id: "7",
    });
  });

  it("turns local days into the instants that bound them", () => {
    const params = auditFilterParams({ fromDate: "2026-10-01", toDate: "2026-10-01" });
    const from = new Date(params.get("from_date") as string);
    const to = new Date(params.get("to_date") as string);
    expect(from.getHours()).toBe(0);
    expect(to.getHours()).toBe(23);
    expect(to.getTime() - from.getTime()).toBeGreaterThan(23 * 3600 * 1000);
  });
});
