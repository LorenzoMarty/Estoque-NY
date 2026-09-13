import { describe, expect, it } from "vitest";
import { computeDiff } from "./diff";

describe("computeDiff", () => {
  it("marks a key present only in after as added", () => {
    const result = computeDiff({}, { name: "Ana" });
    expect(result).toEqual([{ key: "name", before: undefined, after: "Ana", status: "added" }]);
  });

  it("marks a key present only in before as removed", () => {
    const result = computeDiff({ name: "Ana" }, {});
    expect(result).toEqual([{ key: "name", before: "Ana", after: undefined, status: "removed" }]);
  });

  it("marks a key with a different value as changed", () => {
    const result = computeDiff({ status: "DRAFT" }, { status: "SHIPPED" });
    expect(result).toEqual([{ key: "status", before: "DRAFT", after: "SHIPPED", status: "changed" }]);
  });

  it("marks an identical key as unchanged", () => {
    const result = computeDiff({ status: "DRAFT" }, { status: "DRAFT" });
    expect(result).toEqual([{ key: "status", before: "DRAFT", after: "DRAFT", status: "unchanged" }]);
  });

  it("handles null before/after", () => {
    expect(computeDiff(null, { name: "Ana" })).toEqual([{ key: "name", before: undefined, after: "Ana", status: "added" }]);
    expect(computeDiff(null, null)).toEqual([]);
  });
});
