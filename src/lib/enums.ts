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
  "other",
] as const;
export type VisitType = string;

export const PURPOSES = [
  "meeting",
  "sample_delivery",
  "consultation",
  "maintenance",
  "delivery",
  "pickup",
  "other",
] as const;
export type Purpose = string;

export const STATUSES = [
  "pending",
  "inside",
  "exited",
  "overstayed",
  "flagged",
  "cancelled",
  "no_show",
  "partially_arrived",
] as const;
export type Status = (typeof STATUSES)[number];

export const OWNER_TYPES = [
  "staff",
  "resident",
  "vendor",
  "courier",
  "patient",
  "visitor",
  "contractor",
  "vip",
  "other",
] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];
