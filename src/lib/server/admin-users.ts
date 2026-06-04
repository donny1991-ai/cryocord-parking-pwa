import "server-only";
import { randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import { ParkingUserSchema, type ParkingUserRole } from "@/db/entities";
import { getParkingDataSource } from "@/db/client";
import { AuthError, type AuthenticatedParkingUser } from "@/lib/server/auth";

export const PARKING_USER_ROLES = ["guard", "supervisor", "admin"] as const satisfies readonly ParkingUserRole[];

export interface ParkingAdminUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: ParkingUserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveParkingUserInput {
  email?: unknown;
  name?: unknown;
  phone?: unknown;
  role?: unknown;
  active?: unknown;
}

interface ParkingUserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: ParkingUserRole;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function assertEmail(value: unknown) {
  if (typeof value !== "string") {
    throw new AuthError("A valid email is required.", 400);
  }

  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    throw new AuthError("A valid email is required.", 400);
  }

  return email;
}

function assertName(value: unknown) {
  if (typeof value !== "string") {
    throw new AuthError("Name is required.", 400);
  }

  const name = value.trim();
  if (!name || name.length > 160) {
    throw new AuthError("Name must be between 1 and 160 characters.", 400);
  }

  return name;
}

function assertPhone(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new AuthError("Phone must be text.", 400);
  }

  const phone = value.trim();
  if (!phone) {
    return null;
  }
  if (phone.length > 40) {
    throw new AuthError("Phone must be 40 characters or fewer.", 400);
  }

  return phone;
}

function assertRole(value: unknown): ParkingUserRole {
  if (PARKING_USER_ROLES.includes(value as ParkingUserRole)) {
    return value as ParkingUserRole;
  }

  throw new AuthError("Role must be guard, supervisor, or admin.", 400);
}

function assertActive(value: unknown) {
  if (value === undefined) {
    return true;
  }
  if (typeof value !== "boolean") {
    throw new AuthError("Active must be true or false.", 400);
  }
  return value;
}

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AuthError("User id is invalid.", 400);
  }
  return value;
}

function toDto(row: ParkingUserRow): ParkingAdminUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    role: row.role,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function assertAdminWillRemain(manager: EntityManager, currentUserId: string) {
  const [{ count }] = (await manager.query(
    `
      SELECT COUNT(*)::int AS "count"
      FROM "parking"."users"
      WHERE "role" = 'admin'
        AND "active" = true
        AND "id" <> $1
    `,
    [currentUserId],
  )) as Array<{ count: number }>;

  if (count < 1) {
    throw new AuthError("At least one active admin must remain.", 400);
  }
}

export async function listParkingUsers(): Promise<ParkingAdminUser[]> {
  const ds = await getParkingDataSource();
  const rows = (await ds.manager.query(`
    SELECT
      pu."id",
      au."email",
      pu."name",
      pu."phone",
      pu."role",
      pu."active",
      pu."created_at",
      pu."updated_at"
    FROM "parking"."users" pu
    INNER JOIN "auth"."users" au ON au."id" = pu."id"
    ORDER BY pu."active" DESC, pu."role" = 'admin' DESC, pu."name" ASC
  `)) as ParkingUserRow[];

  return rows.map(toDto);
}

export async function createParkingUser(input: SaveParkingUserInput): Promise<ParkingAdminUser> {
  const email = assertEmail(input.email);
  const name = assertName(input.name);
  const phone = assertPhone(input.phone);
  const role = assertRole(input.role);
  const active = assertActive(input.active);
  const ds = await getParkingDataSource();

  const userId = await ds.manager.transaction(async (manager) => {
    const existing = (await manager.query(
      `
        SELECT au."id", pu."id" IS NOT NULL AS "has_parking_access"
        FROM "auth"."users" au
        LEFT JOIN "parking"."users" pu ON pu."id" = au."id"
        WHERE lower(au."email") = $1
        LIMIT 1
      `,
      [email],
    )) as Array<{ id: string; has_parking_access: boolean }>;

    if (existing[0]?.has_parking_access) {
      throw new AuthError("A parking user with this email already exists.", 409);
    }

    const id = existing[0]?.id ?? randomUUID();

    await manager.query(
      `
        INSERT INTO "auth"."users" (
          "id",
          "aud",
          "role",
          "email",
          "email_confirmed_at",
          "raw_app_meta_data",
          "raw_user_meta_data",
          "is_super_admin",
          "is_sso_user",
          "is_anonymous",
          "created_at",
          "updated_at"
        )
        VALUES (
          $1,
          'authenticated',
          'authenticated',
          $2,
          now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('name', $3::text),
          $4::boolean,
          false,
          false,
          now(),
          now()
        )
        ON CONFLICT ("id") DO UPDATE SET
          "email" = EXCLUDED."email",
          "raw_user_meta_data" = COALESCE("auth"."users"."raw_user_meta_data", '{}'::jsonb) || EXCLUDED."raw_user_meta_data",
          "updated_at" = now()
      `,
      [id, email, name, role === "admin"],
    );

    await manager.insert(ParkingUserSchema, {
      id,
      name,
      phone,
      role,
      active,
    });

    return id;
  });

  return getParkingUserById(userId);
}

export async function updateParkingUser(
  id: string,
  input: SaveParkingUserInput,
  actor: AuthenticatedParkingUser,
): Promise<ParkingAdminUser> {
  id = assertUuid(id);
  const email = assertEmail(input.email);
  const name = assertName(input.name);
  const phone = assertPhone(input.phone);
  const role = assertRole(input.role);
  const active = assertActive(input.active);
  const ds = await getParkingDataSource();

  if (actor.id === id && (role !== "admin" || !active)) {
    throw new AuthError("You cannot remove your own admin access.", 400);
  }

  await ds.manager.transaction(async (manager) => {
    const existingUser = await manager.findOneBy(ParkingUserSchema, { id });
    if (!existingUser) {
      throw new AuthError("Parking user was not found.", 404);
    }

    if (existingUser.role === "admin" && (role !== "admin" || !active)) {
      await assertAdminWillRemain(manager, id);
    }

    const emailConflict = (await manager.query(
      `
        SELECT "id"
        FROM "auth"."users"
        WHERE lower("email") = $1
          AND "id" <> $2
        LIMIT 1
      `,
      [email, id],
    )) as Array<{ id: string }>;

    if (emailConflict.length > 0) {
      throw new AuthError("Another auth user already uses this email.", 409);
    }

    await manager.query(
      `
        UPDATE "auth"."users"
        SET
          "email" = $2,
          "raw_user_meta_data" = COALESCE("raw_user_meta_data", '{}'::jsonb) || jsonb_build_object('name', $3::text),
          "updated_at" = now()
        WHERE "id" = $1
      `,
      [id, email, name],
    );

    await manager.update(ParkingUserSchema, { id }, { name, phone, role, active });
  });

  return getParkingUserById(id);
}

export async function deactivateParkingUser(id: string, actor: AuthenticatedParkingUser): Promise<ParkingAdminUser> {
  id = assertUuid(id);
  if (actor.id === id) {
    throw new AuthError("You cannot deactivate your own account.", 400);
  }

  const ds = await getParkingDataSource();
  await ds.manager.transaction(async (manager) => {
    const user = await manager.findOneBy(ParkingUserSchema, { id });
    if (!user) {
      throw new AuthError("Parking user was not found.", 404);
    }

    if (user.role === "admin" && user.active) {
      await assertAdminWillRemain(manager, id);
    }

    await manager.update(ParkingUserSchema, { id }, { active: false });
  });

  return getParkingUserById(id);
}

async function getParkingUserById(id: string): Promise<ParkingAdminUser> {
  const ds = await getParkingDataSource();
  const rows = (await ds.manager.query(
    `
      SELECT
        pu."id",
        au."email",
        pu."name",
        pu."phone",
        pu."role",
        pu."active",
        pu."created_at",
        pu."updated_at"
      FROM "parking"."users" pu
      INNER JOIN "auth"."users" au ON au."id" = pu."id"
      WHERE pu."id" = $1
      LIMIT 1
    `,
    [id],
  )) as ParkingUserRow[];

  if (!rows[0]) {
    throw new AuthError("Parking user was not found.", 404);
  }

  return toDto(rows[0]);
}
