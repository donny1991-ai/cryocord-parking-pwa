import { EntitySchema } from "typeorm";
import type { VisitorEntity } from "./visitor.entity";

export type VisitorVehicleStatus = "pending" | "checked_in" | "checked_out" | "cancelled" | "rejected";

export interface VisitorVehicleEntity {
  id: string;
  visitorId: string;
  visitor?: VisitorEntity;
  vehicleNumber: string;
  vehicleNumberNormalised: string;
  isPrimary: boolean;
  status: VisitorVehicleStatus;
  checkedIn: Date | null;
  checkedOut: Date | null;
  checkedInBy: string | null;
  checkedOutBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const VisitorVehicleSchema = new EntitySchema<VisitorVehicleEntity>({
  name: "VisitorVehicle",
  tableName: "visitor_vehicles",
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
    isPrimary: {
      name: "is_primary",
      type: Boolean,
      default: false,
    },
    status: {
      type: "enum",
      enumName: "visitor_vehicle_status",
      enum: ["pending", "checked_in", "checked_out", "cancelled", "rejected"],
      default: "'pending'",
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
    visitor: {
      type: "many-to-one",
      target: "Visitor",
      joinColumn: {
        name: "visitor_id",
        referencedColumnName: "id",
      },
      onDelete: "CASCADE",
    },
  },
});
