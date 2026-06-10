import { EntitySchema } from "typeorm";

export type VisitorRequestStatus = "submitted" | "converted" | "rejected";

export interface VisitorRequestEntity {
  id: string;
  name: string;
  phoneNumber: string;
  organisation: string | null;
  identityType: "nric" | "passport";
  nric: string | null;
  passportNumber: string | null;
  vehicleNumber: string;
  vehicleNumberNormalised: string;
  purpose: string;
  visitorCount: number | null;
  otherVisitorNames: string[];
  requestedHostText: string;
  remarks: string | null;
  status: VisitorRequestStatus;
  convertedVisitorId: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const VisitorRequestSchema = new EntitySchema<VisitorRequestEntity>({
  name: "VisitorRequest",
  tableName: "visitor_requests",
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
    identityType: {
      name: "identity_type",
      type: String,
      length: 16,
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
    purpose: {
      type: String,
      length: 32,
      default: "'meeting'",
    },
    visitorCount: {
      name: "visitor_count",
      type: Number,
      nullable: true,
    },
    otherVisitorNames: {
      name: "other_visitor_names",
      type: "text",
      array: true,
      default: () => "ARRAY[]::text[]",
    },
    requestedHostText: {
      name: "requested_host_text",
      type: String,
      length: 160,
    },
    remarks: {
      type: "text",
      nullable: true,
    },
    status: {
      type: String,
      length: 24,
      default: "'submitted'",
    },
    convertedVisitorId: {
      name: "converted_visitor_id",
      type: "uuid",
      nullable: true,
    },
    reviewedBy: {
      name: "reviewed_by",
      type: "uuid",
      nullable: true,
    },
    reviewedAt: {
      name: "reviewed_at",
      type: "timestamptz",
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
});
