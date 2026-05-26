import { describe, expect, it } from "vitest";

import { durationSince, formatTime, normalisePlate } from "./utils";

describe("normalisePlate", () => {
  it("uppercases plates and strips spaces and dashes", () => {
    expect(normalisePlate("abc 123-4")).toBe("ABC1234");
  });
});

describe("durationSince", () => {
  it("formats elapsed time in minutes under one hour", () => {
    expect(durationSince(new Date("2026-05-26T08:00:00Z"), new Date("2026-05-26T08:42:59Z"))).toBe(
      "42m",
    );
  });

  it("formats elapsed time in hours and minutes", () => {
    expect(durationSince(new Date("2026-05-26T08:00:00Z"), new Date("2026-05-26T10:05:00Z"))).toBe(
      "2h 5m",
    );
  });

  it("does not return negative durations", () => {
    expect(durationSince(new Date("2026-05-26T10:00:00Z"), new Date("2026-05-26T08:00:00Z"))).toBe(
      "0m",
    );
  });
});

describe("formatTime", () => {
  it("formats a Date as en-GB hours and minutes", () => {
    expect(formatTime(new Date("2026-05-26T14:32:00"))).toBe("14:32");
  });
});
