import { EntitySchema } from "typeorm";

export interface VisitorTypeEntity {
  id: number;
  code: string;
  label: string;
  createdAt: Date;
}

export const VisitorTypeSchema = new EntitySchema<VisitorTypeEntity>({
  name: "VisitorType",
  tableName: "visitor_types",
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
  },
});
