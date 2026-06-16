import { EntitySchema } from "typeorm";
import type { VisitorTypeEntity } from "./visitor-type.entity";
import type { VisitorVehicleEntity } from "./visitor-vehicle.entity";

export type VisitorStatus = "pending" | "checked_in" | "checked_out" | "cancelled";

export interface VisitorEntity {
  id: string;
  name: string;
  phoneNumber: string;
  organisation: string | null;
  representingOrganisation: string | null;
  identityType: "nric" | "passport" | null;
  nric: string | null;
  passportNumber: string | null;
  vehicleNumber: string;
  vehicleNumberNormalised: string;
  additionalVehicleNumbers: string[];
  otherVisitorNames: string[];
  vehicles?: VisitorVehicleEntity[];
  checkedIn: Date | null;
  checkedOut: Date | null;
  typeId: number;
  type?: VisitorTypeEntity;
  remarks: string | null;
  purpose: string;
  visitDate: string | null;
  visitTime: string | null;
  visitorCount: number | null;
  hostStaffId: string | null;
  hostDepartment: string | null;
  flagReason: string | null;
  flaggedBy: string | null;
  flaggedAt: Date | null;
  entryPhotoBucket: string | null;
  entryPhotoPath: string | null;
  entryPhotoContentType: string | null;
  entryPhotoCapturedAt: Date | null;
  entryPhotoCapturedBy: string | null;
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
    representingOrganisation: {
      name: "representing_organisation",
      type: String,
      length: 160,
      nullable: true,
    },
    identityType: {
      name: "identity_type",
      type: String,
      length: 16,
      nullable: true,
    },
    nric: {
      type: String,
      length: 14,
      nullable: true,
    },
    passportNumber: {
      name: "passport_number",
      type: String,
      length: 20,
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
    additionalVehicleNumbers: {
      name: "additional_vehicle_numbers",
      type: "text",
      array: true,
      default: () => "ARRAY[]::text[]",
    },
    otherVisitorNames: {
      name: "other_visitor_names",
      type: "text",
      array: true,
      default: () => "ARRAY[]::text[]",
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
    visitTime: {
      name: "visit_time",
      type: "time",
      nullable: true,
    },
    visitorCount: {
      name: "visitor_count",
      type: "integer",
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
    entryPhotoBucket: {
      name: "entry_photo_bucket",
      type: String,
      length: 120,
      nullable: true,
    },
    entryPhotoPath: {
      name: "entry_photo_path",
      type: "text",
      nullable: true,
    },
    entryPhotoContentType: {
      name: "entry_photo_content_type",
      type: String,
      length: 80,
      nullable: true,
    },
    entryPhotoCapturedAt: {
      name: "entry_photo_captured_at",
      type: "timestamptz",
      nullable: true,
    },
    entryPhotoCapturedBy: {
      name: "entry_photo_captured_by",
      type: "uuid",
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
    vehicles: {
      type: "one-to-many",
      target: "VisitorVehicle",
      inverseSide: "visitor",
    },
  },
});
