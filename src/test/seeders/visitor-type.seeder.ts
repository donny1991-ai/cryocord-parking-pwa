import type { EntityManager } from "typeorm";
import { VisitorTypeSchema } from "@/db/entities";
import { labelize } from "@/lib/labels";
import { visitorTypeCodes } from "../factories/visitor.factory";

export async function seedVisitorTypes(manager: EntityManager) {
  for (const code of visitorTypeCodes) {
    await manager.upsert(
      VisitorTypeSchema,
      {
        code,
        label: labelize(code),
      },
      ["code"],
    );
  }
}
