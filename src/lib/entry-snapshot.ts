import type { Status } from "@/lib/enums";

export const ENTRY_SNAPSHOT_ELIGIBLE_STATUSES = ["inside", "overstayed", "flagged"] as const;

export function canCaptureEntrySnapshot(status: Status) {
  return (ENTRY_SNAPSHOT_ELIGIBLE_STATUSES as readonly Status[]).includes(status);
}

export function getEntrySnapshotUnavailableReason(status: Status) {
  if (canCaptureEntrySnapshot(status)) return null;

  switch (status) {
    case "pending":
      return "Snapshot becomes available after the visitor is checked in.";
    case "exited":
      return "Snapshot capture is locked after checkout.";
    case "cancelled":
      return "Cancelled registrations cannot capture an entry snapshot.";
    case "no_show":
      return "No-show registrations cannot capture an entry snapshot.";
    case "partially_arrived":
      return "Snapshot capture is unavailable after partial arrival closure.";
    default:
      return "Snapshot capture is unavailable for this registration status.";
  }
}
