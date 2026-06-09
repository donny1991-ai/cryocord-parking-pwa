import { createClient } from "@supabase/supabase-js";

const DEFAULT_ENTRY_SNAPSHOT_BUCKET = "parking-entry-snapshots";
const PARKING_STORAGE_PREFIXES = ["visitors/"] as const;
const LIST_LIMIT = 1000;
const REMOVE_BATCH_SIZE = 100;

interface StorageErrorLike {
  message?: string;
  statusCode?: string | number;
  status?: number;
}

interface StorageObjectLike {
  name: string;
  id?: string | null;
  metadata?: unknown;
}

interface StorageBucketApiLike {
  list(
    path?: string,
    options?: {
      limit?: number;
      offset?: number;
      sortBy?: { column: string; order: "asc" | "desc" };
    },
  ): Promise<{ data: StorageObjectLike[] | null; error: StorageErrorLike | null }>;
  remove(paths: string[]): Promise<{ error: StorageErrorLike | null }>;
}

interface StorageClientLike {
  storage: {
    getBucket(bucket: string): Promise<{ data: unknown | null; error: StorageErrorLike | null }>;
    from(bucket: string): StorageBucketApiLike;
  };
}

export interface FreshParkingStorageResult {
  bucket: string | null;
  prefixes: string[];
  objectsRemoved: number;
  skipped: boolean;
  reason?: string;
}

function getStorageConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;
  const bucket = process.env.PARKING_ENTRY_SNAPSHOT_BUCKET ?? DEFAULT_ENTRY_SNAPSHOT_BUCKET;

  if (!url && !serviceRoleKey) {
    return { configured: false as const, reason: "Supabase Storage is not configured." };
  }

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase Storage cleanup requires both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return { configured: true as const, url, serviceRoleKey, bucket };
}

function isNotFound(error: StorageErrorLike | null) {
  if (!error) return false;
  const status = String(error.statusCode ?? error.status ?? "");
  return status === "404" || /not found/i.test(error.message ?? "");
}

function joinStoragePath(prefix: string, name: string) {
  return `${prefix}${name}`.replace(/\/+/g, "/");
}

function isFolderObject(object: StorageObjectLike) {
  return object.id == null && object.metadata == null;
}

async function listStorageObjects(bucketApi: StorageBucketApiLike, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await bucketApi.list(prefix, {
      limit: LIST_LIMIT,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      throw new Error(error.message || `Unable to list Supabase Storage prefix "${prefix}".`);
    }

    const objects = data ?? [];
    for (const object of objects) {
      if (!object.name) continue;
      const path = joinStoragePath(prefix, object.name);
      if (isFolderObject(object)) {
        paths.push(...(await listStorageObjects(bucketApi, `${path}/`)));
      } else {
        paths.push(path);
      }
    }

    if (objects.length < LIST_LIMIT) break;
    offset += objects.length;
  }

  return paths;
}

export async function removeParkingStorageObjects(
  client: StorageClientLike,
  bucket: string,
  prefixes: readonly string[] = PARKING_STORAGE_PREFIXES,
) {
  const bucketApi = client.storage.from(bucket);
  const paths = (
    await Promise.all(prefixes.map((prefix) => listStorageObjects(bucketApi, prefix)))
  ).flat();

  for (let index = 0; index < paths.length; index += REMOVE_BATCH_SIZE) {
    const batch = paths.slice(index, index + REMOVE_BATCH_SIZE);
    const { error } = await bucketApi.remove(batch);
    if (error) {
      throw new Error(error.message || "Unable to remove parking Supabase Storage objects.");
    }
  }

  return paths.length;
}

export async function freshParkingStorageObjects(): Promise<FreshParkingStorageResult> {
  const config = getStorageConfig();
  const prefixes = [...PARKING_STORAGE_PREFIXES];

  if (!config.configured) {
    return {
      bucket: null,
      prefixes,
      objectsRemoved: 0,
      skipped: true,
      reason: config.reason,
    };
  }

  const client = createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as unknown as StorageClientLike;

  const bucket = await client.storage.getBucket(config.bucket);
  if (bucket.error) {
    if (isNotFound(bucket.error)) {
      return {
        bucket: config.bucket,
        prefixes,
        objectsRemoved: 0,
        skipped: true,
        reason: `Supabase Storage bucket "${config.bucket}" does not exist.`,
      };
    }

    throw new Error(bucket.error.message || `Unable to inspect Supabase Storage bucket "${config.bucket}".`);
  }

  return {
    bucket: config.bucket,
    prefixes,
    objectsRemoved: await removeParkingStorageObjects(client, config.bucket, prefixes),
    skipped: false,
  };
}
