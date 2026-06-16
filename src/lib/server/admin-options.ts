import "server-only";
import { CompanySchema, VisitPurposeSchema, VisitTypePurposeRuleSchema, VisitorTypeSchema } from "@/db/entities";
import type { CompanyEntity, VisitPurposeEntity, VisitTypePurposeRuleEntity, VisitorTypeEntity } from "@/db/entities";
import { getParkingDataSource } from "@/db/client";
import { PURPOSES, VISIT_TYPES } from "@/lib/enums";
import { labelize } from "@/lib/labels";
import { AuthError } from "@/lib/server/auth";
import { cacheJson } from "@/lib/server/cache";
import { deleteCacheKeys } from "@/lib/server/cache";
import { PARKING_CACHE_KEYS } from "@/lib/server/parking-cache";
import type { EntityManager } from "typeorm";

export type AdminOptionKind = "company" | "visitorType" | "purpose";

export interface CompanyOption {
  id: string;
  name: string;
}

export interface CodeOption {
  id: number;
  code: string;
  label: string;
}

export interface VisitTypePurposeRuleOption {
  id: string;
  visitorTypeCode: string;
  purposeCode: string;
}

export interface ParkingAdminOptions {
  companies: CompanyOption[];
  visitorTypes: CodeOption[];
  purposes: CodeOption[];
  visitTypePurposeRules: VisitTypePurposeRuleOption[];
}

export interface SaveAdminOptionInput {
  kind?: unknown;
  id?: unknown;
  name?: unknown;
  code?: unknown;
  label?: unknown;
  visitorTypeCode?: unknown;
  purposeCode?: unknown;
}

const DEFAULT_COMPANIES = ["CryoCord", "Cytopeutic"];
const PROTECTED_CODES = new Set(["other"]);

function cleanText(value: unknown, label: string, max: number) {
  if (typeof value !== "string") throw new AuthError(`${label} is required.`, 400);
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) throw new AuthError(`${label} is required.`, 400);
  if (text.length > max) throw new AuthError(`${label} must be ${max} characters or fewer.`, 400);
  return text;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

function cleanCode(value: unknown, fallbackLabel: string) {
  const raw = typeof value === "string" && value.trim() ? value : slugify(fallbackLabel);
  const code = raw.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,31}$/.test(code)) {
    throw new AuthError("Code must start with a letter and contain only lowercase letters, numbers, and underscores.", 400);
  }
  return code;
}

function assertKind(value: unknown): AdminOptionKind {
  if (value === "company" || value === "visitorType" || value === "purpose") return value;
  throw new AuthError("Option kind is invalid.", 400);
}

function assertId(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) throw new AuthError("Option id is required.", 400);
  return text;
}

function companyDto(company: CompanyEntity): CompanyOption {
  return { id: company.id, name: company.name };
}

function codeOptionDto(option: VisitorTypeEntity | VisitPurposeEntity): CodeOption {
  return { id: option.id, code: option.code, label: option.label };
}

function purposeRuleDto(rule: VisitTypePurposeRuleEntity): VisitTypePurposeRuleOption {
  return { id: rule.id, visitorTypeCode: rule.visitorTypeCode, purposeCode: rule.purposeCode };
}

function defaultCodeOptions(values: readonly string[]) {
  return values.map((code, index) => ({ id: index + 1, code, label: labelize(code) }));
}

function isMissingOptionsTable(error: unknown) {
  return error instanceof Error && (
    error.message.includes("parking.companies") ||
    error.message.includes("parking.visit_purposes") ||
    error.message.includes("parking.visit_type_purpose_rules")
  );
}

function defaultOptions(): ParkingAdminOptions {
  return {
    companies: DEFAULT_COMPANIES.map((name, index) => ({ id: `default-${index}`, name })),
    visitorTypes: defaultCodeOptions(VISIT_TYPES),
    purposes: defaultCodeOptions(PURPOSES),
    visitTypePurposeRules: [{ id: "default-courier", visitorTypeCode: "courier", purposeCode: "delivery" }],
  };
}

function isOptionsStoreUnavailable(error: unknown) {
  return error instanceof Error && (
    error.message.includes("ENOTFOUND") ||
    error.message.includes("ECONNREFUSED") ||
    error.message.includes("DATABASE_URL") ||
    error.message.includes("SUPABASE_DB_URL")
  );
}

async function readOptions(manager: EntityManager): Promise<ParkingAdminOptions> {
  try {
    const [companies, visitorTypes, purposes, visitTypePurposeRules] = await Promise.all([
      manager.find(CompanySchema, { order: { name: "ASC" } }),
      manager.find(VisitorTypeSchema, { order: { id: "ASC" } }),
      manager.find(VisitPurposeSchema, { order: { id: "ASC" } }),
      manager.find(VisitTypePurposeRuleSchema, { order: { visitorTypeCode: "ASC" } }),
    ]);

    return {
      companies: companies.map(companyDto),
      visitorTypes: visitorTypes.map(codeOptionDto),
      purposes: purposes.map(codeOptionDto),
      visitTypePurposeRules: visitTypePurposeRules.map(purposeRuleDto),
    };
  } catch (error) {
    if (!isMissingOptionsTable(error)) throw error;
    return defaultOptions();
  }
}

export async function getParkingAdminOptions(manager?: EntityManager): Promise<ParkingAdminOptions> {
  if (manager) return readOptions(manager);
  return cacheJson(PARKING_CACHE_KEYS.adminOptions, 5 * 60, async () => {
    try {
      const ds = await getParkingDataSource();
      return readOptions(ds.manager);
    } catch (error) {
      if (isOptionsStoreUnavailable(error)) return defaultOptions();
      throw error;
    }
  });
}

async function invalidateAdminOptions() {
  await deleteCacheKeys([PARKING_CACHE_KEYS.adminOptions, PARKING_CACHE_KEYS.snapshot]);
}

export async function createAdminOption(input: SaveAdminOptionInput) {
  const kind = assertKind(input.kind);
  const ds = await getParkingDataSource();

  try {
    if (kind === "company") {
      const name = cleanText(input.name ?? input.label, "Company name", 160);
      const saved = await ds.manager.save(CompanySchema, ds.manager.create(CompanySchema, { name }));
      await invalidateAdminOptions();
      return { kind, option: companyDto(saved) };
    }

    const label = cleanText(input.label ?? input.name, kind === "visitorType" ? "Visitor type" : "Purpose", 80);
    const code = cleanCode(input.code, label);
    const saved = kind === "visitorType"
      ? await ds.manager.save(VisitorTypeSchema, ds.manager.create(VisitorTypeSchema, { code, label }))
      : await ds.manager.save(VisitPurposeSchema, ds.manager.create(VisitPurposeSchema, { code, label }));
    await invalidateAdminOptions();
    return { kind, option: codeOptionDto(saved) };
  } catch (error) {
    if (error instanceof Error && error.message.includes("duplicate")) {
      throw new AuthError("An option with this name or code already exists.", 409);
    }
    throw error;
  }
}

export async function updateAdminOption(input: SaveAdminOptionInput) {
  const kind = assertKind(input.kind);
  const id = assertId(input.id);
  const ds = await getParkingDataSource();

  if (kind === "company") {
    const name = cleanText(input.name ?? input.label, "Company name", 160);
    const existing = await ds.manager.findOneBy(CompanySchema, { id });
    if (!existing) throw new AuthError("Company was not found.", 404);
    existing.name = name;
    const saved = await ds.manager.save(CompanySchema, existing);
    await invalidateAdminOptions();
    return { kind, option: companyDto(saved) };
  }

  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) throw new AuthError("Option id is invalid.", 400);
  const existing = kind === "visitorType"
    ? await ds.manager.findOneBy(VisitorTypeSchema, { id: numericId })
    : await ds.manager.findOneBy(VisitPurposeSchema, { id: numericId });
  if (!existing) throw new AuthError("Option was not found.", 404);
  existing.label = cleanText(input.label ?? input.name, kind === "visitorType" ? "Visitor type" : "Purpose", 80);
  const saved = kind === "visitorType"
    ? await ds.manager.save(VisitorTypeSchema, existing as VisitorTypeEntity)
    : await ds.manager.save(VisitPurposeSchema, existing as VisitPurposeEntity);
  await invalidateAdminOptions();
  return { kind, option: codeOptionDto(saved) };
}

export async function deleteAdminOption(input: SaveAdminOptionInput) {
  const kind = assertKind(input.kind);
  const id = assertId(input.id);
  const ds = await getParkingDataSource();

  if (kind === "company") {
    const existing = await ds.manager.findOneBy(CompanySchema, { id });
    if (!existing) throw new AuthError("Company was not found.", 404);
    await ds.manager.delete(CompanySchema, { id });
    await invalidateAdminOptions();
    return { kind, id };
  }

  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) throw new AuthError("Option id is invalid.", 400);
  const existing = kind === "visitorType"
    ? await ds.manager.findOneBy(VisitorTypeSchema, { id: numericId })
    : await ds.manager.findOneBy(VisitPurposeSchema, { id: numericId });
  if (!existing) throw new AuthError("Option was not found.", 404);
  if (PROTECTED_CODES.has(existing.code)) {
    throw new AuthError("The Other option is required and cannot be removed.", 400);
  }

  try {
    if (kind === "visitorType") {
      await ds.manager.delete(VisitorTypeSchema, { id: numericId });
    } else {
      await ds.manager.delete(VisitPurposeSchema, { id: numericId });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("foreign key")) {
      throw new AuthError("This option is already used by visitor history and cannot be removed.", 400);
    }
    throw error;
  }
  await invalidateAdminOptions();
  return { kind, id };
}

async function assertCodeExists(
  manager: EntityManager,
  schema: typeof VisitorTypeSchema | typeof VisitPurposeSchema,
  code: string,
  label: string,
) {
  const existing = await manager.findOneBy(schema, { code });
  if (!existing) throw new AuthError(`${label} is invalid.`, 400);
}

export async function createPurposeRule(input: SaveAdminOptionInput) {
  const visitorTypeCode = cleanCode(input.visitorTypeCode, "visitor_type");
  const purposeCode = cleanCode(input.purposeCode, "purpose");
  const ds = await getParkingDataSource();

  await assertCodeExists(ds.manager, VisitorTypeSchema, visitorTypeCode, "Visit type");
  await assertCodeExists(ds.manager, VisitPurposeSchema, purposeCode, "Purpose");

  try {
    const saved = await ds.manager.save(
      VisitTypePurposeRuleSchema,
      ds.manager.create(VisitTypePurposeRuleSchema, { visitorTypeCode, purposeCode }),
    );
    await invalidateAdminOptions();
    return { rule: purposeRuleDto(saved) };
  } catch (error) {
    if (error instanceof Error && error.message.includes("duplicate")) {
      throw new AuthError("A rule for this visit type already exists.", 409);
    }
    throw error;
  }
}

export async function updatePurposeRule(input: SaveAdminOptionInput) {
  const id = assertId(input.id);
  const visitorTypeCode = cleanCode(input.visitorTypeCode, "visitor_type");
  const purposeCode = cleanCode(input.purposeCode, "purpose");
  const ds = await getParkingDataSource();
  const existing = await ds.manager.findOneBy(VisitTypePurposeRuleSchema, { id });
  if (!existing) throw new AuthError("Rule was not found.", 404);

  await assertCodeExists(ds.manager, VisitorTypeSchema, visitorTypeCode, "Visit type");
  await assertCodeExists(ds.manager, VisitPurposeSchema, purposeCode, "Purpose");

  existing.visitorTypeCode = visitorTypeCode;
  existing.purposeCode = purposeCode;
  try {
    const saved = await ds.manager.save(VisitTypePurposeRuleSchema, existing);
    await invalidateAdminOptions();
    return { rule: purposeRuleDto(saved) };
  } catch (error) {
    if (error instanceof Error && error.message.includes("duplicate")) {
      throw new AuthError("A rule for this visit type already exists.", 409);
    }
    throw error;
  }
}

export async function deletePurposeRule(input: SaveAdminOptionInput) {
  const id = assertId(input.id);
  const ds = await getParkingDataSource();
  const existing = await ds.manager.findOneBy(VisitTypePurposeRuleSchema, { id });
  if (!existing) throw new AuthError("Rule was not found.", 404);

  await ds.manager.delete(VisitTypePurposeRuleSchema, { id });
  await invalidateAdminOptions();
  return { id };
}
