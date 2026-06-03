import { EntitySchema } from "typeorm";
import type { VisitorEntity } from "./visitor.entity";

export type VisitorScanEventType =
  | "pass_issued"
  | "check_in"
  | "check_out"
  | "pass_cancelled"
  | "scan_rejected";

export interface VisitorScanEventEntity {
  id: string;
  visitorId: string | null;
  visitor?: VisitorEntity;
  eventType: VisitorScanEventType;
  guardId: string | null;
  scannedAt: Date;
  source: string;
  metadata: Record<string, unknown>;
}

export const VisitorScanEventSchema = new EntitySchema<VisitorScanEventEntity>({
  name: "VisitorScanEvent",
  tableName: "visitor_scan_events",
  schema: "parking",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    visitorId: {
      name: "visitor_id",
      type: "uuid",
      nullable: true,
    },
    eventType: {
      name: "event_type",
      type: "enum",
      enumName: "visitor_scan_event_type",
      enum: ["pass_issued", "check_in", "check_out", "pass_cancelled", "scan_rejected"],
    },
    guardId: {
      name: "guard_id",
      type: String,
      length: 120,
      nullable: true,
    },
    scannedAt: {
      name: "scanned_at",
      type: "timestamptz",
      createDate: true,
    },
    source: {
      type: String,
      length: 64,
      default: "'pwa'",
    },
    metadata: {
      type: "jsonb",
      default: {},
    },
  },
  relations: {
    visitor: {
      type: "many-to-one",
      target: "Visitor",
      joinColumn: {
        name: "visitor_id",
        referencedColumnName: "id",
      },
      onDelete: "SET NULL",
    },
  },
});
