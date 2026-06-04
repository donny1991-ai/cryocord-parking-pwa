// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getOverstayCutoff, isOverstayed } from "./parking-data";

describe("parking overstay policy", () => {
  it("uses the end of the Malaysia check-in day when no extra days are allowed", () => {
    const checkedIn = new Date("2026-06-01T09:30:00+08:00");

    expect(getOverstayCutoff(checkedIn, 0).toISOString()).toBe("2026-06-01T16:00:00.000Z");
    expect(isOverstayed(checkedIn, new Date("2026-06-01T15:59:59.000Z"), 0)).toBe(false);
    expect(isOverstayed(checkedIn, new Date("2026-06-01T16:00:00.000Z"), 0)).toBe(true);
  });

  it("adds configured allowance days before a visit becomes overstayed", () => {
    const checkedIn = new Date("2026-06-01T23:30:00+08:00");

    expect(getOverstayCutoff(checkedIn, 1).toISOString()).toBe("2026-06-02T16:00:00.000Z");
  });
});
