import "server-only";
import type { EntityManager } from "typeorm";
import { ParkingSettingSchema } from "@/db/entities";
import { getParkingDataSource } from "@/db/client";
import { cacheJson } from "@/lib/server/cache";
import { invalidateSettingsReadModelCache, PARKING_CACHE_KEYS } from "@/lib/server/parking-cache";
import { AuthError, type AuthenticatedParkingUser } from "@/lib/server/auth";

const AUTH_SESSION_KEY = "auth_session_expires_hours";
const OVERSTAY_DAYS_KEY = "overstay_allowed_days";

export interface ParkingAdminSettings {
  authSessionExpiresHours: number;
  authSessionExpiresSeconds: number;
  overstayAllowedDays: number;
}

export interface SaveParkingSettingsInput {
  authSessionExpiresHours?: unknown;
  overstayAllowedDays?: unknown;
}

const DEFAULT_SETTINGS: ParkingAdminSettings = {
  authSessionExpiresHours: 12,
  authSessionExpiresSeconds: 12 * 60 * 60,
  overstayAllowedDays: 0,
};

function integerInRange(value: unknown, label: string, min: number, max: number) {
  const numeric = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isInteger(numeric) || numeric < min || numeric > max) {
    throw new AuthError(`${label} must be a whole number between ${min} and ${max}.`, 400);
  }
  return numeric;
}

function hoursFromValue(value: Record<string, unknown> | null | undefined) {
  const hours = value?.hours;
  return typeof hours === "number" && Number.isInteger(hours) && hours >= 1 && hours <= 168
    ? hours
    : DEFAULT_SETTINGS.authSessionExpiresHours;
}

function daysFromValue(value: Record<string, unknown> | null | undefined) {
  const days = value?.days;
  return typeof days === "number" && Number.isInteger(days) && days >= 0 && days <= 30
    ? days
    : DEFAULT_SETTINGS.overstayAllowedDays;
}

async function loadParkingSettings(manager?: EntityManager): Promise<ParkingAdminSettings> {
  const activeManager = manager ?? (await getParkingDataSource()).manager;
  let rows;
  try {
    rows = await activeManager.find(ParkingSettingSchema, {
      where: [{ key: AUTH_SESSION_KEY }, { key: OVERSTAY_DAYS_KEY }],
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("parking.settings")) {
      return DEFAULT_SETTINGS;
    }
    throw error;
  }
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const authSessionExpiresHours = hoursFromValue(byKey.get(AUTH_SESSION_KEY));
  const overstayAllowedDays = daysFromValue(byKey.get(OVERSTAY_DAYS_KEY));

  return {
    authSessionExpiresHours,
    authSessionExpiresSeconds: authSessionExpiresHours * 60 * 60,
    overstayAllowedDays,
  };
}

export async function getParkingSettings(manager?: EntityManager): Promise<ParkingAdminSettings> {
  if (manager) return loadParkingSettings(manager);
  return cacheJson(PARKING_CACHE_KEYS.settings, 5 * 60, () => loadParkingSettings());
}

export async function updateParkingSettings(
  input: SaveParkingSettingsInput,
  actor: AuthenticatedParkingUser,
): Promise<ParkingAdminSettings> {
  const authSessionExpiresHours = integerInRange(input.authSessionExpiresHours, "Token expiry", 1, 168);
  const overstayAllowedDays = integerInRange(input.overstayAllowedDays, "Overstay allowance", 0, 30);
  const ds = await getParkingDataSource();

  await ds.manager.transaction(async (manager) => {
    await manager.upsert(
      ParkingSettingSchema,
      [
        {
          key: AUTH_SESSION_KEY,
          value: { hours: authSessionExpiresHours },
          updatedBy: actor.id,
        },
        {
          key: OVERSTAY_DAYS_KEY,
          value: { days: overstayAllowedDays },
          updatedBy: actor.id,
        },
      ],
      ["key"],
    );
  });

  await invalidateSettingsReadModelCache();
  return getParkingSettings();
}
