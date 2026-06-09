import "server-only";
import {
  VisitorEntrySnapshotSchema,
  VisitorScanEventSchema,
  VisitorSchema,
  VisitorVehicleSchema,
  type VisitorEntrySnapshotEntity,
} from "@/db/entities";
import type { AuthenticatedParkingUser } from "@/lib/server/auth";
import { getParkingDataSource } from "@/db/client";
import {
  createEntrySnapshotSignedUrl,
  deleteEntrySnapshotObject,
  removeEntrySnapshotObject,
  uploadEntrySnapshotObject,
  type StoredEntrySnapshot,
} from "@/lib/server/entry-snapshot-storage";
import type { EntityManager } from "typeorm";

export class EntrySnapshotNotEligibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntrySnapshotNotEligibleError";
  }
}

function assertVisitorCanCaptureSnapshot(status: string) {
  if (status === "checked_in") return;
  if (status === "pending") {
    throw new EntrySnapshotNotEligibleError("Snapshot becomes available after the visitor is checked in.");
  }
  if (status === "checked_out") {
    throw new EntrySnapshotNotEligibleError("Snapshot capture is locked after checkout.");
  }
  if (status === "cancelled") {
    throw new EntrySnapshotNotEligibleError("Cancelled registrations cannot capture an entry snapshot.");
  }
  throw new EntrySnapshotNotEligibleError("Snapshot capture is unavailable for this registration status.");
}

async function assertVisitorHasActiveVehicle(manager: EntityManager, visitorId: string) {
  const vehicles = await manager.find(VisitorVehicleSchema, { where: { visitorId } });
  if (vehicles.length === 0) return;
  if (vehicles.some((vehicle) => vehicle.status === "checked_in")) return;
  throw new EntrySnapshotNotEligibleError("Snapshot capture needs at least one checked-in vehicle.");
}

async function assertVisitorEligibleForSnapshot(manager: EntityManager, visitorId: string) {
  const visitor = await manager.findOne(VisitorSchema, {
    where: { id: visitorId },
    lock: { mode: "pessimistic_write" },
  });

  if (!visitor) {
    throw new Error("Visitor registration was not found.");
  }

  assertVisitorCanCaptureSnapshot(visitor.status);
  await assertVisitorHasActiveVehicle(manager, visitor.id);
  return visitor;
}

async function toSnapshotDto(snapshot: VisitorEntrySnapshotEntity) {
  return {
    id: snapshot.id,
    entryPhotoUrl: await createEntrySnapshotSignedUrl(snapshot.bucket, snapshot.path),
    entryPhotoCapturedAt: snapshot.capturedAt.toISOString(),
  };
}

async function setLatestVisitorSnapshotColumns(manager: EntityManager, visitorId: string) {
  const latest = await manager.findOne(VisitorEntrySnapshotSchema, {
    where: { visitorId },
    order: { capturedAt: "DESC", createdAt: "DESC" },
  });

  await manager.update(VisitorSchema, { id: visitorId }, {
    entryPhotoBucket: latest?.bucket ?? null,
    entryPhotoPath: latest?.path ?? null,
    entryPhotoContentType: latest?.contentType ?? null,
    entryPhotoCapturedAt: latest?.capturedAt ?? null,
    entryPhotoCapturedBy: latest?.capturedBy ?? null,
  });
}

async function insertSnapshot(input: {
  manager: EntityManager;
  visitorId: string;
  actor: AuthenticatedParkingUser;
  stored: StoredEntrySnapshot;
  eventReason: "entry_snapshot_captured" | "entry_snapshot_replaced";
}) {
  const capturedAt = new Date();
  const snapshot = await input.manager.save(
    VisitorEntrySnapshotSchema,
    input.manager.create(VisitorEntrySnapshotSchema, {
      visitorId: input.visitorId,
      bucket: input.stored.bucket,
      path: input.stored.path,
      contentType: input.stored.contentType,
      capturedAt,
      capturedBy: input.actor.id,
    }),
  );

  await input.manager.insert(VisitorScanEventSchema, {
    visitorId: input.visitorId,
    eventType: "details_updated",
    guardId: input.actor.id,
    metadata: {
      reason: input.eventReason,
      snapshotId: snapshot.id,
      storageBucket: input.stored.bucket,
      storagePath: input.stored.path,
      contentType: input.stored.contentType,
    },
  });

  await setLatestVisitorSnapshotColumns(input.manager, input.visitorId);
  return snapshot;
}

export async function captureVisitorEntrySnapshot(input: {
  visitorId: string;
  actor: AuthenticatedParkingUser;
  bytes: Uint8Array;
  contentType: string;
}) {
  const ds = await getParkingDataSource();
  const visitor = await ds.transaction(async (manager) => assertVisitorEligibleForSnapshot(manager, input.visitorId));

  const stored = await uploadEntrySnapshotObject({
    visitorId: visitor.id,
    bytes: input.bytes,
    contentType: input.contentType,
  });

  try {
    const snapshot = await ds.transaction(async (manager) => {
      await assertVisitorEligibleForSnapshot(manager, visitor.id);
      return insertSnapshot({
        manager,
        visitorId: visitor.id,
        actor: input.actor,
        stored,
        eventReason: "entry_snapshot_captured",
      });
    });

    return toSnapshotDto(snapshot);
  } catch (error) {
    await removeEntrySnapshotObject(stored.bucket, stored.path);
    throw error;
  }
}

export async function replaceVisitorEntrySnapshot(input: {
  visitorId: string;
  snapshotId: string;
  actor: AuthenticatedParkingUser;
  bytes: Uint8Array;
  contentType: string;
}) {
  const ds = await getParkingDataSource();
  await ds.transaction(async (manager) => {
    await assertVisitorEligibleForSnapshot(manager, input.visitorId);
    const snapshot = await manager.findOne(VisitorEntrySnapshotSchema, {
      where: { id: input.snapshotId, visitorId: input.visitorId },
      lock: { mode: "pessimistic_write" },
    });
    if (!snapshot) throw new Error("Entry snapshot was not found.");
  });

  const stored = await uploadEntrySnapshotObject({
    visitorId: input.visitorId,
    bytes: input.bytes,
    contentType: input.contentType,
  });

  try {
    const { snapshot, previous } = await ds.transaction(async (manager) => {
      await assertVisitorEligibleForSnapshot(manager, input.visitorId);
      const current = await manager.findOne(VisitorEntrySnapshotSchema, {
        where: { id: input.snapshotId, visitorId: input.visitorId },
        lock: { mode: "pessimistic_write" },
      });
      if (!current) throw new Error("Entry snapshot was not found.");

      const previousSnapshot = { bucket: current.bucket, path: current.path };
      current.bucket = stored.bucket;
      current.path = stored.path;
      current.contentType = stored.contentType;
      current.capturedAt = new Date();
      current.capturedBy = input.actor.id;
      const saved = await manager.save(VisitorEntrySnapshotSchema, current);

      await manager.insert(VisitorScanEventSchema, {
        visitorId: input.visitorId,
        eventType: "details_updated",
        guardId: input.actor.id,
        metadata: {
          reason: "entry_snapshot_replaced",
          snapshotId: saved.id,
          storageBucket: stored.bucket,
          storagePath: stored.path,
          contentType: stored.contentType,
        },
      });

      await setLatestVisitorSnapshotColumns(manager, input.visitorId);
      return { snapshot: saved, previous: previousSnapshot };
    });

    if (previous) {
      await deleteEntrySnapshotObject(previous.bucket, previous.path);
    }

    return toSnapshotDto(snapshot);
  } catch (error) {
    await removeEntrySnapshotObject(stored.bucket, stored.path);
    throw error;
  }
}

export async function removeVisitorEntrySnapshot(input: {
  visitorId: string;
  snapshotId: string;
  actor: AuthenticatedParkingUser;
}) {
  const ds = await getParkingDataSource();
  const snapshot = await ds.transaction(async (manager) => {
    await assertVisitorEligibleForSnapshot(manager, input.visitorId);
    const current = await manager.findOne(VisitorEntrySnapshotSchema, {
      where: { id: input.snapshotId, visitorId: input.visitorId },
      lock: { mode: "pessimistic_write" },
    });
    if (!current) throw new Error("Entry snapshot was not found.");
    return current;
  });

  await deleteEntrySnapshotObject(snapshot.bucket, snapshot.path);

  await ds.transaction(async (manager) => {
    await assertVisitorEligibleForSnapshot(manager, input.visitorId);
    await manager.delete(VisitorEntrySnapshotSchema, { id: input.snapshotId, visitorId: input.visitorId });
    await manager.insert(VisitorScanEventSchema, {
      visitorId: input.visitorId,
      eventType: "details_updated",
      guardId: input.actor.id,
      metadata: {
        reason: "entry_snapshot_removed",
        snapshotId: input.snapshotId,
        storageBucket: snapshot.bucket,
        storagePath: snapshot.path,
      },
    });
    await setLatestVisitorSnapshotColumns(manager, input.visitorId);
  });

  return { snapshotId: input.snapshotId };
}
