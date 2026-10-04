import { describe, expect, it } from "vitest";
import { MOVE_TYPE_LABELS, MOVE_TYPE_TONES, moveInGroup } from "./moveTypes";

describe("moveInGroup", () => {
  it("keeps everything in the all group", () => {
    expect(Object.keys(MOVE_TYPE_LABELS).every((type) => moveInGroup(type as keyof typeof MOVE_TYPE_LABELS, "all"))).toBe(true);
  });

  it("splits receipts, issues and transfers", () => {
    expect(moveInGroup("RECEIPT", "in")).toBe(true);
    expect(moveInGroup("ISSUE", "in")).toBe(false);
    expect(moveInGroup("ISSUE", "out")).toBe(true);
    expect(moveInGroup("TRANSFER_SHIP", "transfer")).toBe(true);
    expect(moveInGroup("TRANSFER_RECEIVE", "transfer")).toBe(true);
    expect(moveInGroup("ADJUSTMENT", "transfer")).toBe(false);
  });

  it("has a tone for every type", () => {
    expect(Object.keys(MOVE_TYPE_TONES).sort()).toEqual(Object.keys(MOVE_TYPE_LABELS).sort());
  });
});
