/**
 * Single source of truth for the parking enums.
 * These mirror the DB CHECK constraints in the `parking` schema exactly —
 * keep snake_case here, surface human labels via lib/labels.ts.
 */

export const VISIT_TYPES = [
  "visitor",
  "vendor",
  "courier",
  "patient",
  "staff",
  "contractor",
  "vip",
] as const;
export type VisitType = (typeof VISIT_TYPES)[number];

export const PURPOSES = [
  "meeting",
  "sample_delivery",
  "consultation",
  "maintenance",
  "delivery",
  "pickup",
  "other",
] as const;
export type Purpose = (typeof PURPOSES)[number];

export const STATUSES = ["inside", "exited", "overstayed", "flagged"] as const;
export type Status = (typeof STATUSES)[number];

export const OWNER_TYPES = [
  "staff",
  "resident",
  "vendor",
  "patient",
  "visitor",
  "vip",
] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];
