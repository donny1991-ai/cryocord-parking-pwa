import { EntitySchema } from "typeorm";

export interface ParkingSettingEntity {
  key: string;
  value: Record<string, unknown>;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ParkingSettingSchema = new EntitySchema<ParkingSettingEntity>({
  name: "ParkingSetting",
  tableName: "settings",
  schema: "parking",
  columns: {
    key: {
      type: String,
      length: 80,
      primary: true,
    },
    value: {
      type: "jsonb",
    },
    updatedBy: {
      name: "updated_by",
      type: "uuid",
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
