import { describe, expect, it } from "vitest";
import { visitorScanStateFactory } from "@/test/factories/visitor.factory";
import { assertScanAction, resolveVisitorScanTransition } from "./visitor-state";

const NOW = new Date("2026-05-29T08:30:00.000Z");
const CHECKED_IN_AT = new Date("2026-05-29T08:00:00.000Z");

describe("resolveVisitorScanTransition", () => {
  it("checks in a pending visitor on explicit check-in", () => {
    const result = resolveVisitorScanTransition(visitorScanStateFactory({ status: "pending" }), "check_in", NOW);

    expect(result).toEqual({
      changed: true,
      eventType: "check_in",
      status: "checked_in",
      checkedIn: NOW,
      checkedOut: null,
    });
  });

  it("checks in a pending visitor on auto scan", () => {
    const result = resolveVisitorScanTransition(visitorScanStateFactory({ status: "pending" }), "auto", NOW);

    expect(result.eventType).toBe("check_in");
    expect(result.status).toBe("checked_in");
  });

  it("checks out an active visitor on explicit check-out", () => {
    const result = resolveVisitorScanTransition(
      visitorScanStateFactory({ status: "checked_in", checkedIn: CHECKED_IN_AT }),
      "check_out",
      NOW,
    );

    expect(result).toEqual({
      changed: true,
      eventType: "check_out",
      status: "checked_out",
      checkedIn: CHECKED_IN_AT,
      checkedOut: NOW,
    });
  });

  it("checks out an active visitor on auto scan", () => {
    const result = resolveVisitorScanTransition(
      visitorScanStateFactory({ status: "checked_in", checkedIn: CHECKED_IN_AT }),
      "auto",
      NOW,
    );

    expect(result.eventType).toBe("check_out");
    expect(result.status).toBe("checked_out");
  });

  it("rejects check-out before check-in", () => {
    expect(() =>
      resolveVisitorScanTransition(visitorScanStateFactory({ status: "pending" }), "check_out", NOW),
    ).toThrow("Visitor must check in before check-out.");
  });

  it("rejects duplicate check-in", () => {
    expect(() =>
      resolveVisitorScanTransition(
        visitorScanStateFactory({ status: "checked_in", checkedIn: CHECKED_IN_AT }),
        "check_in",
        NOW,
      ),
    ).toThrow("Visitor has already checked in.");
  });

  it("rejects duplicate check-out", () => {
    expect(() =>
      resolveVisitorScanTransition(
        visitorScanStateFactory({ status: "checked_out", checkedIn: CHECKED_IN_AT, checkedOut: NOW }),
        "auto",
        NOW,
      ),
    ).toThrow("Visitor has already checked out.");
  });

  it("rejects cancelled passes", () => {
    expect(() =>
      resolveVisitorScanTransition(visitorScanStateFactory({ status: "cancelled" }), "auto", NOW),
    ).toThrow("Visitor pass has been cancelled.");
  });

  it("rejects active visitors with missing check-in timestamp", () => {
    expect(() =>
      resolveVisitorScanTransition(visitorScanStateFactory({ status: "checked_in", checkedIn: null }), "check_out", NOW),
    ).toThrow("Visitor check-in timestamp is missing.");
  });

  it("rejects check-out times earlier than check-in", () => {
    expect(() =>
      resolveVisitorScanTransition(
        visitorScanStateFactory({ status: "checked_in", checkedIn: new Date("2026-05-29T09:00:00.000Z") }),
        "check_out",
        NOW,
      ),
    ).toThrow("Check-out time cannot be before check-in time.");
  });
});

describe("assertScanAction", () => {
  it("defaults undefined action to auto", () => {
    expect(assertScanAction(undefined)).toBe("auto");
  });

  it("accepts explicit scan actions", () => {
    expect(assertScanAction("auto")).toBe("auto");
    expect(assertScanAction("check_in")).toBe("check_in");
    expect(assertScanAction("check_out")).toBe("check_out");
  });

  it("rejects malformed actions", () => {
    expect(() => assertScanAction("checkout")).toThrow("Invalid scan action.");
    expect(() => assertScanAction(null)).toThrow("Invalid scan action.");
    expect(() => assertScanAction(1)).toThrow("Invalid scan action.");
  });
});
