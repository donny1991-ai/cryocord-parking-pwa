import { EntitySchema } from "typeorm";

export interface VisitPurposeEntity {
  id: number;
  code: string;
  label: string;
  createdAt: Date;
  updatedAt: Date;
}

export const VisitPurposeSchema = new EntitySchema<VisitPurposeEntity>({
  name: "VisitPurpose",
  tableName: "visit_purposes",
  schema: "parking",
  columns: {
    id: {
      type: Number,
      primary: true,
      generated: "increment",
    },
    code: {
      type: String,
      length: 32,
      unique: true,
    },
    label: {
      type: String,
      length: 80,
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
