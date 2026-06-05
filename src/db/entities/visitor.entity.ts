import { EntitySchema } from "typeorm";
import type { VisitorTypeEntity } from "./visitor-type.entity";

export type VisitorStatus = "pending" | "checked_in" | "checked_out" | "cancelled";

export interface VisitorEntity {
  id: string;
  name: string;
  phoneNumber: string;
  organisation: string | null;
  vehicleNumber: string;
  vehicleNumberNormalised: string;
  checkedIn: Date | null;
  checkedOut: Date | null;
  typeId: number;
  type?: VisitorTypeEntity;
  remarks: string | null;
  purpose: string;
  visitDate: string | null;
  hostStaffId: string | null;
  hostDepartment: string | null;
  flagReason: string | null;
  flaggedBy: string | null;
  flaggedAt: Date | null;
  qrTokenJti: string | null;
  status: VisitorStatus;
  createdBy: string | null;
  checkedInBy: string | null;
  checkedOutBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const VisitorSchema = new EntitySchema<VisitorEntity>({
  name: "Visitor",
  tableName: "visitors",
  schema: "parking",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    name: {
      type: String,
      length: 160,
    },
    phoneNumber: {
      name: "phone_number",
      type: String,
      length: 40,
    },
    organisation: {
      type: String,
      length: 160,
      nullable: true,
    },
    vehicleNumber: {
      name: "vehicle_number",
      type: String,
      length: 32,
    },
    vehicleNumberNormalised: {
      name: "vehicle_number_normalised",
      type: String,
      length: 32,
    },
    checkedIn: {
      name: "checked_in",
      type: "timestamptz",
      nullable: true,
    },
    checkedOut: {
      name: "checked_out",
      type: "timestamptz",
      nullable: true,
    },
    typeId: {
      name: "type_id",
      type: Number,
    },
    remarks: {
      type: "text",
      nullable: true,
    },
    purpose: {
      type: String,
      length: 32,
      default: "'other'",
    },
    visitDate: {
      name: "visit_date",
      type: "date",
      nullable: true,
    },
    hostStaffId: {
      name: "host_staff_id",
      type: String,
      length: 80,
      nullable: true,
    },
    hostDepartment: {
      name: "host_department",
      type: String,
      length: 120,
      nullable: true,
    },
    flagReason: {
      name: "flag_reason",
      type: "text",
      nullable: true,
    },
    flaggedBy: {
      name: "flagged_by",
      type: "uuid",
      nullable: true,
    },
    flaggedAt: {
      name: "flagged_at",
      type: "timestamptz",
      nullable: true,
    },
    qrTokenJti: {
      name: "qr_token_jti",
      type: String,
      length: 80,
      nullable: true,
      unique: true,
    },
    status: {
      type: "enum",
      enumName: "visitor_status",
      enum: ["pending", "checked_in", "checked_out", "cancelled"],
      default: "'pending'",
    },
    createdBy: {
      name: "created_by",
      type: String,
      length: 120,
      nullable: true,
    },
    checkedInBy: {
      name: "checked_in_by",
      type: String,
      length: 120,
      nullable: true,
    },
    checkedOutBy: {
      name: "checked_out_by",
      type: String,
      length: 120,
      nullable: true,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
    updatedAt: {
      name: "updated_at",
      type: "timestamptz",
      updateDate: true,
    },
  },
  relations: {
    type: {
      type: "many-to-one",
      target: "VisitorType",
      joinColumn: {
        name: "type_id",
        referencedColumnName: "id",
      },
      onDelete: "RESTRICT",
    },
  },
});
