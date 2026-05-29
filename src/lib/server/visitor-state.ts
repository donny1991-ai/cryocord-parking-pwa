import type { VisitorStatus } from "@/db/entities";

export type ScanAction = "auto" | "check_in" | "check_out";

export interface VisitorScanState {
  status: VisitorStatus;
  checkedIn: Date | null;
  checkedOut: Date | null;
}

export type VisitorScanTransition =
  | {
      changed: true;
      eventType: "check_in";
      status: "checked_in";
      checkedIn: Date;
      checkedOut: null;
    }
  | {
      changed: true;
      eventType: "check_out";
      status: "checked_out";
      checkedIn: Date;
      checkedOut: Date;
    };

export function assertScanAction(value: unknown): ScanAction {
  if (value === undefined || value === "auto") return "auto";
  if (value === "check_in" || value === "check_out") return value;

  throw new Error("Invalid scan action.");
}

export function resolveVisitorScanTransition(
  visitor: VisitorScanState,
  action: ScanAction,
  now: Date,
): VisitorScanTransition {
  if (visitor.status === "cancelled") {
    throw new Error("Visitor pass has been cancelled.");
  }

  if (visitor.status === "checked_out") {
    throw new Error("Visitor has already checked out.");
  }

  if (action === "check_out" && visitor.status === "pending") {
    throw new Error("Visitor must check in before check-out.");
  }

  if (action === "check_in" && visitor.status === "checked_in") {
    throw new Error("Visitor has already checked in.");
  }

  if ((action === "check_in" || action === "auto") && visitor.status === "pending") {
    return {
      changed: true,
      eventType: "check_in",
      status: "checked_in",
      checkedIn: now,
      checkedOut: null,
    };
  }

  if ((action === "check_out" || action === "auto") && visitor.status === "checked_in") {
    if (!visitor.checkedIn) {
      throw new Error("Visitor check-in timestamp is missing.");
    }

    if (visitor.checkedIn > now) {
      throw new Error("Check-out time cannot be before check-in time.");
    }

    return {
      changed: true,
      eventType: "check_out",
      status: "checked_out",
      checkedIn: visitor.checkedIn,
      checkedOut: now,
    };
  }

  throw new Error("Visitor pass cannot be scanned in its current state.");
}
