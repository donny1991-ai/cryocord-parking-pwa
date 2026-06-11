import { describe, expect, it } from "vitest";
import { canShareVisitPass, getVisitPassHeading } from "./visitor-pass";

describe("canShareVisitPass", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");
  const validUntilTonight = "2026-06-10T15:59:59.000Z";

  it("allows sharing for unexpired pending, partial, and inside visits", () => {
    expect(canShareVisitPass({ status: "pending", qrToken: "token", qrTokenExpiresAt: validUntilTonight, now })).toBe(true);
    expect(canShareVisitPass({ status: "partially_arrived", qrToken: "token", qrTokenExpiresAt: validUntilTonight, now })).toBe(true);
    expect(canShareVisitPass({ status: "inside", qrToken: "token", qrTokenExpiresAt: validUntilTonight, now })).toBe(true);
  });

  it("blocks sharing after expiry or terminal status", () => {
    expect(canShareVisitPass({ status: "pending", qrToken: "token", qrTokenExpiresAt: "2026-06-09T15:59:59.000Z", now })).toBe(false);
    expect(canShareVisitPass({ status: "cancelled", qrToken: "token", qrTokenExpiresAt: validUntilTonight, now })).toBe(false);
    expect(canShareVisitPass({ status: "exited", qrToken: "token", qrTokenExpiresAt: validUntilTonight, now })).toBe(false);
  });
});

describe("getVisitPassHeading", () => {
  it("keeps arrival wording for partial arrivals", () => {
    expect(getVisitPassHeading("partially_arrived")).toBe("Scan at gate to check in");
  });
});
