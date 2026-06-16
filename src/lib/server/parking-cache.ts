import "server-only";

import { deleteCacheKeys } from "@/lib/server/cache";

export const PARKING_CACHE_KEYS = {
  snapshot: "parking:snapshot:v2",
  vehicles: "parking:vehicles:v1",
  hosts: "parking:hosts:v1",
  settings: "parking:settings:v1",
  adminOptions: "parking:admin-options:v1",
} as const;

export async function invalidateParkingReadModelCache() {
  await deleteCacheKeys([PARKING_CACHE_KEYS.snapshot]);
}

export async function invalidateVehicleReadModelCache() {
  await deleteCacheKeys([PARKING_CACHE_KEYS.snapshot, PARKING_CACHE_KEYS.vehicles]);
}

export async function invalidateSettingsReadModelCache() {
  await deleteCacheKeys([PARKING_CACHE_KEYS.snapshot, PARKING_CACHE_KEYS.settings, PARKING_CACHE_KEYS.adminOptions]);
}
