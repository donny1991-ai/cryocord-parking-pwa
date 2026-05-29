import { EntitySchema } from "typeorm";

export type ParkingUserRole = "guard" | "supervisor" | "admin";

export interface ParkingUserEntity {
  id: string;
  name: string;
  phone: string | null;
  role: ParkingUserRole;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const ParkingUserSchema = new EntitySchema<ParkingUserEntity>({
  name: "ParkingUser",
  tableName: "users",
  schema: "parking",
  columns: {
    id: {
      type: "uuid",
      primary: true,
    },
    name: {
      type: String,
      length: 160,
    },
    phone: {
      type: String,
      length: 40,
      nullable: true,
    },
    role: {
      type: "enum",
      enumName: "parking_user_role",
      enum: ["guard", "supervisor", "admin"],
      default: "'guard'",
    },
    active: {
      type: Boolean,
      default: true,
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
