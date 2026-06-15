import { EntitySchema } from "typeorm";

export interface CompanyEntity {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export const CompanySchema = new EntitySchema<CompanyEntity>({
  name: "Company",
  tableName: "companies",
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
      unique: true,
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
