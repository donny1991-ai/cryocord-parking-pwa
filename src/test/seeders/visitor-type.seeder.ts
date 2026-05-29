import type { EntityManager } from "typeorm";
import { VisitorTypeSchema } from "@/db/entities";
import { visitorTypeCodes } from "../factories/visitor.factory";

export async function seedVisitorTypes(manager: EntityManager) {
  for (const code of visitorTypeCodes) {
    await manager.upsert(
      VisitorTypeSchema,
      {
        code,
        label: code.charAt(0).toUpperCase() + code.slice(1),
      },
      ["code"],
    );
  }
}
