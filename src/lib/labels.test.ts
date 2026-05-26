import { describe, expect, it } from "vitest";

import { labelize } from "./labels";

describe("labelize", () => {
  it("converts snake_case values to title case", () => {
    expect(labelize("sample_delivery")).toBe("Sample Delivery");
  });

  it("preserves configured acronyms", () => {
    expect(labelize("vip")).toBe("VIP");
  });
});
