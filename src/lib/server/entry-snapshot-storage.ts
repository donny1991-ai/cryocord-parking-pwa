import "server-only";
import { createClient } from "@supabase/supabase-js";
import { rewriteSupabaseStorageSignedUrl } from "@/lib/supabase-storage-url";

const DEFAULT_BUCKET = "parking-entry-snapshots";
const SIGNED_URL_TTL_SECONDS = 10 * 60;
const ensuredBuckets = new Set<string>();

export const ENTRY_SNAPSHOT_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ENTRY_SNAPSHOT_MAX_BYTES = 4 * 1024 * 1024;

export type EntrySnapshotContentType = (typeof ENTRY_SNAPSHOT_ALLOWED_TYPES)[number];

export class EntrySnapshotStorageConfigError extends Error {
  constructor() {
    super("Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    this.name = "EntrySnapshotStorageConfigError";
  }
}

export interface StoredEntrySnapshot {
  bucket: string;
  path: string;
  contentType: EntrySnapshotContentType;
  signedUrl: string | null;
}

function getStorageConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicUrl =
    process.env.SUPABASE_STORAGE_PUBLIC_URL ??
    process.env.SUPABASE_PUBLIC_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;
  const bucket = process.env.PARKING_ENTRY_SNAPSHOT_BUCKET ?? DEFAULT_BUCKET;

  if (!url || !serviceRoleKey) {
    throw new EntrySnapshotStorageConfigError();
  }

  return { url, publicUrl, serviceRoleKey, bucket };
}

export function getEntrySnapshotBucketName() {
  return process.env.PARKING_ENTRY_SNAPSHOT_BUCKET ?? DEFAULT_BUCKET;
}

function getSupabaseStorageClient() {
  const config = getStorageConfig();
  return {
    bucket: config.bucket,
    client: createClient(config.url, config.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
  };
}

function assertEntrySnapshotContentType(contentType: string): EntrySnapshotContentType {
  if ((ENTRY_SNAPSHOT_ALLOWED_TYPES as readonly string[]).includes(contentType)) {
    return contentType as EntrySnapshotContentType;
  }

  throw new Error("Entry snapshot must be a JPEG, PNG, or WebP image.");
}

function extensionForContentType(contentType: EntrySnapshotContentType) {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

async function ensurePrivateBucket() {
  const { bucket, client } = getSupabaseStorageClient();
  if (ensuredBuckets.has(bucket)) return { bucket, client };

  const existing = await client.storage.getBucket(bucket);
  if (existing.data) {
    if (existing.data.public) {
      throw new Error(`Supabase Storage bucket "${bucket}" must be private for visitor snapshots.`);
    }
    ensuredBuckets.add(bucket);
    return { bucket, client };
  }

  const created = await client.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: `${ENTRY_SNAPSHOT_MAX_BYTES}`,
    allowedMimeTypes: [...ENTRY_SNAPSHOT_ALLOWED_TYPES],
  });
  if (created.error) {
    throw new Error(created.error.message || "Unable to create the visitor snapshot storage bucket.");
  }

  ensuredBuckets.add(bucket);
  return { bucket, client };
}

export async function createEntrySnapshotSignedUrl(bucket: string, path: string) {
  try {
    const { url, publicUrl } = getStorageConfig();
    const { client } = getSupabaseStorageClient();
    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error) return null;
    return rewriteSupabaseStorageSignedUrl({
      signedUrl: data.signedUrl,
      serverUrl: url,
      publicUrl,
    });
  } catch (error) {
    if (error instanceof EntrySnapshotStorageConfigError) return null;
    throw error;
  }
}

export async function uploadEntrySnapshotObject(input: {
  visitorId: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<StoredEntrySnapshot> {
  if (input.bytes.byteLength > ENTRY_SNAPSHOT_MAX_BYTES) {
    throw new Error("Entry snapshot must be 4 MB or smaller.");
  }

  const contentType = assertEntrySnapshotContentType(input.contentType);
  const { bucket, client } = await ensurePrivateBucket();
  const path = `visitors/${input.visitorId}/entry/${Date.now()}-${crypto.randomUUID()}.${extensionForContentType(contentType)}`;
  const uploaded = await client.storage.from(bucket).upload(path, input.bytes, {
    cacheControl: "31536000",
    contentType,
    upsert: false,
  });

  if (uploaded.error) {
    throw new Error(uploaded.error.message || "Unable to upload entry snapshot.");
  }

  return {
    bucket,
    path,
    contentType,
    signedUrl: await createEntrySnapshotSignedUrl(bucket, path),
  };
}

export async function removeEntrySnapshotObject(bucket: string, path: string) {
  try {
    const { client } = getSupabaseStorageClient();
    await client.storage.from(bucket).remove([path]);
  } catch {
    // Best effort cleanup only; the visitor record remains the source of truth.
  }
}

export async function deleteEntrySnapshotObject(bucket: string, path: string) {
  const { client } = getSupabaseStorageClient();
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) {
    throw new Error(error.message || "Unable to delete entry snapshot from storage.");
  }
}
