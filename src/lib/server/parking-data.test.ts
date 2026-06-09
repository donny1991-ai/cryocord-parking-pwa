// @vitest-environment node

import { describe, expect, it } from "vitest";
import { describeDetailsUpdated, expandLogVehicleVisits, getOverstayCutoff, isOverstayed, toPurposeNotes } from "./parking-data";
import type { Visit } from "@/lib/types";

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

describe("visit log vehicle rows", () => {
  it("expands a linked registration into plate-specific log rows", () => {
    const rows = expandLogVehicleVisits([
      {
        id: "visit-1",
        plate: "TES 5678",
        additionalPlates: ["AAA 1234", "AAA 2345"],
        vehicles: [
          {
            id: "vehicle-primary",
            plate: "TES 5678",
            isPrimary: true,
            status: "checked_in",
            checkedIn: "2026-06-08T04:15:00.000Z",
          },
          {
            id: "vehicle-linked-out",
            plate: "AAA 1234",
            isPrimary: false,
            status: "checked_out",
            checkedIn: "2026-06-08T04:01:00.000Z",
            checkedOut: "2026-06-08T04:36:00.000Z",
          },
          {
            id: "vehicle-linked-pending",
            plate: "AAA 2345",
            isPrimary: false,
            status: "pending",
          },
        ],
        visitorName: "Visitor5",
        visitorContact: "0196776100",
        visitType: "visitor",
        purpose: "other",
        entryTime: "2026-06-08T04:15:00.000Z",
        entryGuardId: "guard-in",
        status: "inside",
        createdAt: "2026-06-08T03:55:00.000Z",
      } satisfies Visit,
    ]);

    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "visit-1",
          vehicleId: "vehicle-linked-out",
          plate: "AAA 1234",
          status: "exited",
          registrationPlate: "TES 5678",
          registrationVehicleCount: 3,
          registrationVehicleRole: "linked",
          exitTime: "2026-06-08T04:36:00.000Z",
        }),
        expect.objectContaining({
          vehicleId: "vehicle-primary",
          plate: "TES 5678",
          status: "inside",
          registrationVehicleRole: "primary",
        }),
        expect.objectContaining({
          vehicleId: "vehicle-linked-pending",
          plate: "AAA 2345",
          status: "pending",
          registrationVehicleRole: "linked",
        }),
      ]),
    );
  });
});

describe("parking audit detail descriptions", () => {
  it("describes the exact visitor details changed during arrival review", () => {
    expect(
      describeDetailsUpdated("arrival_manual_verification", {
        changes: {
          name: { from: "Typo Name", to: "Corrected Name" },
          organisation: { from: "Old Org", to: "Corrected Sdn Bhd" },
          nric: { from: "900101-14-1111", to: "900101-14-2222" },
          vehicleNumber: { from: "TYPO 100", to: "OK 200" },
          additionalVehicleNumbers: { from: null, to: "OK 201, TYPO 100" },
          typeCode: { from: "visitor", to: "vendor" },
          purpose: { from: "meeting", to: "delivery" },
        },
      }).description,
    ).toBe(
        "Changed Visitor name: Typo Name -> Corrected Name; Organisation: Old Org -> Corrected Sdn Bhd; " +
        "NRIC: [masked ending 1111] -> [masked ending 2222]; Vehicle number: TYPO 100 -> OK 200; " +
        "Linked vehicles: empty -> OK 201, TYPO 100; Visit type: Visitor -> Vendor; Purpose: Meeting -> Delivery.",
    );
  });

  it("keeps a fallback when an update event has no change metadata", () => {
    expect(describeDetailsUpdated("arrival_manual_verification").description).toBe(
      "Guard updated visitor details during arrival review.",
    );
  });

  it("includes the exact visit review flag reason when available", () => {
    expect(
      describeDetailsUpdated("visit_marked_for_review", {
        flagReason: "Watch out this guys okayyy",
      }).description,
    ).toBe("Admin marked this checked-in registration for guard follow-up: Watch out this guys okayyy.");

    expect(
      describeDetailsUpdated("visit_review_reason_updated", {
        previousReason: "Old reason",
        flagReason: "New reason",
      }).description,
    ).toBe('Review reason changed from "Old reason" to "New reason".');
  });
});

describe("visit detail notes", () => {
  it("keeps review flag text separate from visitor notes", () => {
    expect(toPurposeNotes("Bring me watahh")).toBe("Bring me watahh");
    expect(toPurposeNotes("")).toBeUndefined();
  });
});
