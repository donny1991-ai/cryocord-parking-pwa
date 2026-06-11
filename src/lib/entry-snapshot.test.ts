import { describe, expect, it } from "vitest";
import { canCaptureEntrySnapshot, getEntrySnapshotUnavailableReason } from "./entry-snapshot";

describe("entry snapshot status rules", () => {
  it.each(["inside", "overstayed", "flagged"] as const)("allows capture for live status %s", (status) => {
    expect(canCaptureEntrySnapshot(status)).toBe(true);
    expect(getEntrySnapshotUnavailableReason(status)).toBeNull();
  });

  it.each([
    ["pending", "checked in"],
    ["exited", "checkout"],
    ["cancelled", "Cancelled"],
  ] as const)("explains why %s cannot capture a snapshot", (status, expectedText) => {
    expect(canCaptureEntrySnapshot(status)).toBe(false);
    expect(getEntrySnapshotUnavailableReason(status)).toContain(expectedText);
  });
});
