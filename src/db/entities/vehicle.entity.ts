import { EntitySchema } from "typeorm";

export interface VehicleEntity {
  id: string;
  plate: string;
  plateNormalised: string;
  ownerName: string | null;
  ownerContact: string | null;
  ownerEmail: string | null;
  ownerType: string | null;
  staffId: string | null;
  notes: string | null;
  blacklisted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const VehicleSchema = new EntitySchema<VehicleEntity>({
  name: "Vehicle",
  tableName: "vehicles",
  schema: "parking",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    plate: {
      type: String,
      length: 32,
    },
    plateNormalised: {
      name: "plate_normalised",
      type: String,
      length: 32,
      unique: true,
    },
    ownerName: {
      name: "owner_name",
      type: String,
      length: 160,
      nullable: true,
    },
    ownerContact: {
      name: "owner_contact",
      type: String,
      length: 40,
      nullable: true,
    },
    ownerEmail: {
      name: "owner_email",
      type: String,
      length: 320,
      nullable: true,
    },
    ownerType: {
      name: "owner_type",
      type: String,
      length: 32,
      nullable: true,
    },
    staffId: {
      name: "staff_id",
      type: String,
      length: 80,
      nullable: true,
    },
    notes: {
      type: "text",
      nullable: true,
    },
    blacklisted: {
      type: Boolean,
      default: false,
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
