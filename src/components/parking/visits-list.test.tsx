import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Visit } from "@/lib/types";
import { VisitsList } from "./visits-list";

const baseVisit = {
  id: "visit-1",
  visitorName: "Khals",
  visitorContact: "+60123456789",
  visitType: "visitor",
  purpose: "meeting",
  entryTime: "2026-06-12T03:46:00.000Z",
  entryGuardId: "guard-1",
  status: "pending",
  createdAt: "2026-06-12T03:46:00.000Z",
  registrationPlate: "TES 123",
  registrationVehicleCount: 3,
  vehicles: [
    { id: "vehicle-1", plate: "TES 123", isPrimary: true, status: "pending", displayStatus: "pending" },
    { id: "vehicle-2", plate: "AHA 456", isPrimary: false, status: "pending", displayStatus: "pending" },
    { id: "vehicle-3", plate: "WWW 199", isPrimary: false, status: "pending", displayStatus: "pending" },
  ],
} satisfies Omit<Visit, "plate" | "vehicleId" | "registrationVehicleRole">;

function visitRow(
  plate: string,
  vehicleId: string,
  registrationVehicleRole: Visit["registrationVehicleRole"],
): Visit {
  return {
    ...baseVisit,
    plate,
    vehicleId,
    registrationVehicleRole,
  };
}

describe("VisitsList", () => {
  it("sanitises plate searches and matches only the displayed linked vehicle row", () => {
    render(
      <VisitsList
        nowIso="2026-06-12T04:00:00.000Z"
        visits={[
          visitRow("TES 123", "vehicle-1", "primary"),
          visitRow("AHA 456", "vehicle-2", "linked"),
          visitRow("WWW 199", "vehicle-3", "linked"),
        ]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search plate or visitor"), {
      target: { value: "www199" },
    });

    expect(screen.getByText("WWW 199")).toBeInTheDocument();
    expect(screen.queryByText("TES 123")).not.toBeInTheDocument();
    expect(screen.queryByText("AHA 456")).not.toBeInTheDocument();
    expect(screen.getByText("1 records")).toBeInTheDocument();
  });
});
