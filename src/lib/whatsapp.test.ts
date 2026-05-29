import { describe, expect, it } from "vitest";
import { buildPassMessage, toWaNumber, waLink } from "./whatsapp";

describe("toWaNumber", () => {
  it("normalises Malaysian local numbers", () => {
    expect(toWaNumber("012-345 6789")).toBe("60123456789");
  });

  it("normalises international-prefix numbers", () => {
    expect(toWaNumber("0060 12 345 6789")).toBe("60123456789");
  });

  it("keeps already-international numbers as digits", () => {
    expect(toWaNumber("+60 12 345 6789")).toBe("60123456789");
  });

  it("rejects empty, short, and overly long numbers", () => {
    expect(toWaNumber("")).toBeNull();
    expect(toWaNumber("123")).toBeNull();
    expect(toWaNumber("1234567890123456")).toBeNull();
  });
});

describe("waLink", () => {
  it("builds an encoded wa.me link without sending anything", () => {
    const link = waLink("+60 12 345 6789", "Line 1\nLine 2");

    expect(link).toBe("https://wa.me/60123456789?text=Line%201%0ALine%202");
  });

  it("returns null for unusable phone numbers", () => {
    expect(waLink("123", "hello")).toBeNull();
  });
});

describe("buildPassMessage", () => {
  it("includes pass details and optional pass URL", () => {
    const message = buildPassMessage({
      visitorName: "Aisyah",
      plate: "WA 18 K",
      visitType: "guest",
      validUntil: "24 Aug 2026",
      passUrl: "https://example.test/pass/token",
    });

    expect(message).toContain("*CryoCord Visitor Pass*");
    expect(message).toContain("Vehicle: WA 18 K");
    expect(message).toContain("Visitor: Aisyah");
    expect(message).toContain("Type: Guest");
    expect(message).toContain("View & save your gate pass: https://example.test/pass/token");
  });
});
