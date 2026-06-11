import "server-only";
import { VehicleSchema, VisitorVehicleSchema, type VehicleEntity } from "@/db/entities";
import { getParkingDataSource } from "@/db/client";
import { AuthError } from "@/lib/server/auth";
import { OWNER_TYPES, type OwnerType } from "@/lib/enums";
import { normalisePlate } from "@/lib/utils";
import type { Vehicle } from "@/lib/types";
import { getHostByStaffId } from "./hosts";

export interface CreateVehicleInput {
  plate?: unknown;
  ownerName?: unknown;
  ownerContact?: unknown;
  ownerEmail?: unknown;
  ownerType?: unknown;
  staffId?: unknown;
  notes?: unknown;
  blacklisted?: unknown;
}

export interface UpdateVehicleInput extends CreateVehicleInput {
  blacklisted?: unknown;
}

function assertText(value: unknown, label: string, max: number, required = false) {
  if (value === null || value === undefined) {
    if (required) throw new AuthError(`${label} is required.`, 400);
    return null;
  }
  if (typeof value !== "string") {
    throw new AuthError(`${label} must be text.`, 400);
  }
  const text = value.trim();
  if (!text) {
    if (required) throw new AuthError(`${label} is required.`, 400);
    return null;
  }
  if (text.length > max) {
    throw new AuthError(`${label} must be ${max} characters or fewer.`, 400);
  }
  return text;
}

function assertOwnerType(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "string" && (OWNER_TYPES as readonly string[]).includes(value)) {
    return value as OwnerType;
  }
  throw new AuthError("Owner type is invalid.", 400);
}

function assertBoolean(value: unknown, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new AuthError("Blacklisted must be true or false.", 400);
  }
  return value;
}

function normaliseVehicleStaffId(ownerType: OwnerType | string | null, value: unknown) {
  if (ownerType === "visitor") {
    return null;
  }
  return assertText(value, "Staff ID", 80);
}

function usesHrOwnerFields(ownerType: OwnerType | string | null) {
  return ownerType === "staff";
}

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AuthError("Vehicle id is invalid.", 400);
  }
  return value;
}

async function toDto(vehicle: VehicleEntity): Promise<Vehicle> {
  const host = usesHrOwnerFields(vehicle.ownerType) ? await getHostByStaffId(vehicle.staffId) : null;

  return {
    id: vehicle.id,
    plate: vehicle.plate,
    plateNormalised: vehicle.plateNormalised,
    ownerName: host?.name ?? vehicle.ownerName ?? undefined,
    ownerContact: host?.phone ?? vehicle.ownerContact ?? undefined,
    ownerEmail: host?.email ?? vehicle.ownerEmail ?? undefined,
    ownerDepartment: usesHrOwnerFields(vehicle.ownerType) ? host?.department : undefined,
    ownerType: vehicle.ownerType ? (vehicle.ownerType as OwnerType) : undefined,
    staffId: vehicle.ownerType === "visitor" ? undefined : host?.staffId ?? vehicle.staffId ?? undefined,
    notes: vehicle.notes ?? undefined,
    blacklisted: vehicle.blacklisted,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
  };
}

export async function createParkingVehicle(input: CreateVehicleInput): Promise<Vehicle> {
  const plate = assertText(input.plate, "Plate", 32, true) ?? "";
  const plateNormalised = normalisePlate(plate);
  if (plateNormalised.length < 3) {
    throw new AuthError("Plate must contain at least 3 letters or numbers.", 400);
  }
  const ownerType = assertOwnerType(input.ownerType);
  const staffId = normaliseVehicleStaffId(ownerType, input.staffId);
  if (usesHrOwnerFields(ownerType)) {
    if (!staffId) {
      throw new AuthError("Staff owner must be selected from the HR directory.", 400);
    }
    const staffOwner = await getHostByStaffId(staffId);
    if (!staffOwner) {
      throw new AuthError("Staff owner was not found in the HR directory.", 400);
    }
  }

  const vehicle = {
    plate: plate.toUpperCase(),
    plateNormalised,
    ownerName: usesHrOwnerFields(ownerType) ? null : assertText(input.ownerName, "Owner name", 160),
    ownerContact: usesHrOwnerFields(ownerType) ? null : assertText(input.ownerContact, "Owner contact", 40),
    ownerEmail: usesHrOwnerFields(ownerType) ? null : assertText(input.ownerEmail, "Owner email", 320),
    ownerType,
    staffId,
    notes: assertText(input.notes, "Notes", 2000),
    blacklisted: assertBoolean(input.blacklisted),
  };

  const ds = await getParkingDataSource();
  try {
    const saved = await ds.manager.save(VehicleSchema, ds.manager.create(VehicleSchema, vehicle));
    return await toDto(saved);
  } catch (error) {
    if (error instanceof Error && error.message.includes("duplicate")) {
      throw new AuthError("A vehicle with this plate already exists.", 409);
    }
    throw error;
  }
}

export async function updateParkingVehicle(id: string, input: UpdateVehicleInput): Promise<Vehicle> {
  id = assertUuid(id);
  const ds = await getParkingDataSource();
  const existing = await ds.manager.findOneBy(VehicleSchema, { id });
  if (!existing) {
    throw new AuthError("Vehicle was not found.", 404);
  }

  const patch: Partial<VehicleEntity> = {};
  let ownerType = existing.ownerType;

  if (input.plate !== undefined) {
    const plate = assertText(input.plate, "Plate", 32, true) ?? "";
    const plateNormalised = normalisePlate(plate);
    if (plateNormalised.length < 3) {
      throw new AuthError("Plate must contain at least 3 letters or numbers.", 400);
    }
    patch.plate = plate.toUpperCase();
    patch.plateNormalised = plateNormalised;
  }
  if (input.ownerType !== undefined) {
    ownerType = assertOwnerType(input.ownerType);
    patch.ownerType = ownerType;
  }
  if (usesHrOwnerFields(ownerType)) {
    if (
      input.ownerType !== undefined ||
      input.ownerName !== undefined ||
      input.ownerContact !== undefined ||
      input.ownerEmail !== undefined
    ) {
      patch.ownerName = null;
      patch.ownerContact = null;
      patch.ownerEmail = null;
    }
  } else {
    if (input.ownerName !== undefined) patch.ownerName = assertText(input.ownerName, "Owner name", 160);
    if (input.ownerContact !== undefined) patch.ownerContact = assertText(input.ownerContact, "Owner contact", 40);
    if (input.ownerEmail !== undefined) patch.ownerEmail = assertText(input.ownerEmail, "Owner email", 320);
  }
  if (input.staffId !== undefined) patch.staffId = normaliseVehicleStaffId(ownerType, input.staffId);
  if (ownerType === "visitor") patch.staffId = null;
  if (input.notes !== undefined) patch.notes = assertText(input.notes, "Notes", 2000);
  if (input.blacklisted !== undefined) patch.blacklisted = assertBoolean(input.blacklisted, existing.blacklisted);

  await ds.manager.update(VehicleSchema, { id }, patch);
  return await toDto(await ds.manager.findOneByOrFail(VehicleSchema, { id }));
}

export async function deleteParkingVehicle(id: string) {
  id = assertUuid(id);
  const ds = await getParkingDataSource();
  const existing = await ds.manager.findOneBy(VehicleSchema, { id });
  if (!existing) {
    throw new AuthError("Vehicle was not found.", 404);
  }

  const activeVisitCount = await ds.manager.count(VisitorVehicleSchema, {
    where: {
      vehicleNumberNormalised: existing.plateNormalised,
      status: "checked_in",
    },
  });
  if (activeVisitCount > 0) {
    throw new AuthError("Vehicle cannot be removed while it is currently checked in.", 400);
  }

  await ds.manager.delete(VehicleSchema, { id });
  return { id };
}
