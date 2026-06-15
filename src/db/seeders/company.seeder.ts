import type { EntityManager } from "typeorm";
import { CompanySchema } from "../entities";

const COMPANIES = ["CryoCord", "Cytopeutic"];

export async function seedCompanies(manager: EntityManager) {
  const seeded = [];

  for (const name of COMPANIES) {
    const result = await manager.upsert(CompanySchema, { name }, ["name"]);
    seeded.push({ name, identifiers: result.identifiers });
  }

  return seeded;
}
