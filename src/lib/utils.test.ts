import { describe, expect, it } from "vitest";
import { durationSince, formatDate, formatDateTime, normalisePlate } from "./utils";

describe("normalisePlate", () => {
  it("uppercases plates and removes spaces and dashes", () => {
    expect(normalisePlate("wa 18-k")).toBe("WA18K");
  });

  it("preserves non-space separators that may be meaningful OCR output", () => {
    expect(normalisePlate("abc/123")).toBe("ABC/123");
  });
});

describe("durationSince", () => {
  it("formats durations under one hour in minutes", () => {
    expect(
      durationSince(
        new Date("2026-05-29T08:00:00.000Z"),
        new Date("2026-05-29T08:45:00.000Z"),
      ),
    ).toBe("45m");
  });

  it("formats durations over one hour in hours and minutes", () => {
    expect(
      durationSince(
        new Date("2026-05-29T08:00:00.000Z"),
        new Date("2026-05-29T10:05:00.000Z"),
      ),
    ).toBe("2h 5m");
  });

  it("clamps negative durations to zero", () => {
    expect(
      durationSince(
        new Date("2026-05-29T09:00:00.000Z"),
        new Date("2026-05-29T08:00:00.000Z"),
      ),
    ).toBe("0m");
  });
});

describe("date formatting", () => {
  it("keeps date-only visit dates on the Malaysia calendar day", () => {
    expect(formatDate("2026-06-05")).toBe("05 June 2026");
  });

  it("formats token expiry in Malaysia time", () => {
    expect(formatDateTime("2026-06-05T15:59:59.000Z")).toBe("05 June at 23:59");
  });
});
