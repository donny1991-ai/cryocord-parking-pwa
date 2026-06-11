import type { Status } from "./enums";

export function canShareVisitPass({
  status,
  qrToken,
  qrTokenExpiresAt,
  now = new Date(),
}: {
  status: Status;
  qrToken?: string;
  qrTokenExpiresAt?: string;
  now?: Date;
}) {
  if (!qrToken || !qrTokenExpiresAt) return false;
  if (status === "cancelled" || status === "exited") return false;

  const expiresAt = new Date(qrTokenExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) return false;

  return expiresAt > now;
}

export function getVisitPassHeading(status: Status) {
  if (status === "pending" || status === "partially_arrived") {
    return "Scan at gate to check in";
  }

  if (status === "inside" || status === "overstayed" || status === "flagged") {
    return "Keep for exit scan";
  }

  return "Archived visitor pass";
}
