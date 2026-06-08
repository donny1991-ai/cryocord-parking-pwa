import { EntitySchema } from "typeorm";

export interface HrDepartmentEntity {
  id: number;
  name: string;
  slug: string | null;
  deletedAt: Date | null;
}

export const HrDepartmentSchema = new EntitySchema<HrDepartmentEntity>({
  name: "HrDepartment",
  tableName: "departments",
  schema: "public",
  columns: {
    id: {
      type: Number,
      primary: true,
    },
    name: {
      type: String,
    },
    slug: {
      type: String,
      nullable: true,
    },
    deletedAt: {
      name: "deleted_at",
      type: "timestamptz",
      nullable: true,
    },
  },
});
