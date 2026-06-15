import { EntitySchema } from "typeorm";

export interface VisitTypePurposeRuleEntity {
  id: string;
  visitorTypeCode: string;
  purposeCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export const VisitTypePurposeRuleSchema = new EntitySchema<VisitTypePurposeRuleEntity>({
  name: "VisitTypePurposeRule",
  tableName: "visit_type_purpose_rules",
  schema: "parking",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    visitorTypeCode: {
      name: "visitor_type_code",
      type: String,
      length: 32,
      unique: true,
    },
    purposeCode: {
      name: "purpose_code",
      type: String,
      length: 32,
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
