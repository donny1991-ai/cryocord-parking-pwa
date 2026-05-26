import { describe, expect, it } from "vitest";

import { buildPassMessage, toWaNumber, waLink, waShareLink } from "./whatsapp";

describe("toWaNumber", () => {
  it("normalises local Malaysian mobile numbers", () => {
    expect(toWaNumber("012-345 6789")).toBe("60123456789");
  });

  it("preserves international +60 numbers as wa.me digits", () => {
    expect(toWaNumber("+60 12-345 6789")).toBe("60123456789");
  });

  it("returns null for empty or unusable input", () => {
    expect(toWaNumber("—")).toBeNull();
    expect(toWaNumber("not a phone number")).toBeNull();
    expect(toWaNumber("123")).toBeNull();
  });
});

describe("waLink", () => {
  it("builds an encoded WhatsApp click-to-chat URL", () => {
    expect(waLink("012-345 6789", "Hello gate pass")).toBe(
      "https://wa.me/60123456789?text=Hello%20gate%20pass",
    );
  });

  it("returns null when the contact number is unusable", () => {
    expect(waLink("—", "Hello")).toBeNull();
  });
});

describe("waShareLink", () => {
  it("builds an encoded WhatsApp share URL without a recipient", () => {
    expect(waShareLink("Hello gate pass")).toBe("https://wa.me/?text=Hello%20gate%20pass");
  });
});

describe("buildPassMessage", () => {
  it("builds the visitor pass message with labels and optional pass URL", () => {
    expect(
      buildPassMessage({
        visitorName: "Aina Rahman",
        plate: "ABC1234",
        visitType: "vip",
        validUntil: "26 May, 18:00",
        passUrl: "https://example.test/pass/token",
      }),
    ).toBe(
      [
        "*CryoCord Visitor Pass*",
        "Vehicle: ABC1234",
        "Visitor: Aina Rahman",
        "Type: VIP",
        "Valid until: 26 May, 18:00",
        "",
        "View & save your gate pass: https://example.test/pass/token",
        "",
        "Please show this pass at the CryoCord gate on arrival.",
      ].join("\n"),
    );
  });
});
