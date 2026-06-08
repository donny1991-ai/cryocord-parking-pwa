import { EntitySchema } from "typeorm";
import type { HrDepartmentEntity } from "./hr-department.entity";

export interface HrUserEntity {
  id: number;
  email: string;
  name: string;
  nickname: string | null;
  empNo: string | null;
  phone: string | null;
  extension: string | null;
  departmentId: number | null;
  department?: HrDepartmentEntity | null;
  deletedAt: Date | null;
}

export const HrUserSchema = new EntitySchema<HrUserEntity>({
  name: "HrUser",
  tableName: "users",
  schema: "public",
  columns: {
    id: {
      type: Number,
      primary: true,
    },
    email: {
      type: String,
    },
    name: {
      type: String,
    },
    nickname: {
      type: String,
      nullable: true,
    },
    empNo: {
      name: "emp_no",
      type: String,
      nullable: true,
    },
    phone: {
      type: String,
      nullable: true,
    },
    extension: {
      type: String,
      nullable: true,
    },
    departmentId: {
      name: "department_id",
      type: Number,
      nullable: true,
    },
    deletedAt: {
      name: "deleted_at",
      type: "timestamptz",
      nullable: true,
    },
  },
  relations: {
    department: {
      type: "many-to-one",
      target: "HrDepartment",
      joinColumn: {
        name: "department_id",
        referencedColumnName: "id",
      },
      nullable: true,
    },
  },
});
